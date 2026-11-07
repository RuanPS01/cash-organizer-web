/**
 * Importação de fatura: do arquivo lido (`ParsedStatement`) ao rascunho da
 * revisão, e da revisão confirmada aos lançamentos gravados.
 *
 * O que impede a mesma compra de entrar duas vezes é o registro de importação
 * (`importedItems`), um documento por compra já revisada, com id igual ao
 * hash da chave da compra. Ele vale para qualquer mês do app, então reimportar
 * a fatura inteira, ou uma fatura que repete dias da anterior, só traz o que
 * ainda não entrou. Ver docs/11-importacao-e-ia.md.
 */
import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { sha256Hex } from '../utils/crypto';
import { normalizeText } from '../utils/csv';
import { addMonthsKey, dateFromDayKey, dayKey, dayKeyFullLabel } from '../utils/dates';
import {
  installmentImportKey,
  merchantHead,
  merchantKey,
  occurrences,
  purchaseImportKey,
  tidyTitle,
} from '../utils/statement';
import type { ParsedStatement, StatementFormat, StatementItem } from '../utils/statement';
import { addCategory } from './expenses';
import { expensesCol, fixedEntriesCol, isMonthOpen } from './months';
import type { Category, EntryStatus, ImportedItem, ImportedKind, VariableExpense } from '../types';

export function importedItemsCol(compartmentId: string) {
  return collection(db, 'compartments', compartmentId, 'importedItems');
}

/** De onde veio a categoria sugerida, para a revisão mostrar. */
export type SuggestionSource = 'history' | 'bank' | 'ai' | 'default';

/** Uma linha da revisão: a compra da fatura e o que o usuário decidiu nela. */
export interface DraftRow {
  /** Estável na tela (a posição da compra no arquivo). */
  id: number;
  item: StatementItem;
  /** Chave da compra e o id do registro (hash da chave). */
  key: string;
  docId: string;
  /** Compra parcelada vira gasto fixo parcelado; à vista, lançamento variável. */
  kind: 'expense' | 'fixed';
  /** Desmarcada, a compra é registrada como ignorada e não volta. */
  include: boolean;
  description: string;
  /** Categoria existente escolhida (só no lançamento variável). */
  categoryId: string | null;
  /** Categoria nova sugerida pela IA, criada ao confirmar. */
  newCategory: string | null;
  source: SuggestionSource;
  /** Já existe lançamento manual no mês com o mesmo valor no mesmo dia. */
  possibleDuplicate: boolean;
}

export interface ImportDraft {
  fileName: string;
  format: StatementFormat;
  rows: DraftRow[];
  /** Compras que já estavam no app (importadas ou ignoradas antes). */
  alreadyImported: number;
  /** Pagamentos, estornos e créditos da fatura, que não são gasto. */
  credits: number;
  /** Linhas sem data ou valor legível. */
  invalid: number;
  /** Exemplos do histórico para a IA ("descrição", "categoria"). */
  examples: { description: string; category: string }[];
}

/** Categoria escolhida antes, pelo estabelecimento. */
interface Learned {
  categoryId: string;
  categoryName: string;
  example: string;
}

// Lidas do registro para aprender "estabelecimento: categoria". O bastante
// para cobrir alguns meses de faturas sem pesar na abertura da revisão.
const HISTORY_LIMIT = 400;
// O Firestore aceita até 30 valores no filtro `in`.
const IN_LIMIT = 30;

async function fetchRegistry(
  compartmentId: string,
  ids: string[],
): Promise<Map<string, ImportedItem>> {
  const found = new Map<string, ImportedItem>();
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_LIMIT) chunks.push(unique.slice(i, i + IN_LIMIT));
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(importedItemsCol(compartmentId), where(documentId(), 'in', chunk))),
    ),
  );
  for (const snap of snaps) {
    for (const d of snap.docs) found.set(d.id, { id: d.id, ...(d.data() as Omit<ImportedItem, 'id'>) });
  }
  return found;
}

/**
 * O que o usuário já classificou, por estabelecimento: o registro das
 * importações anteriores (o mais recente vence) e os lançamentos do mês em
 * aberto, inclusive os digitados à mão.
 */
async function learnCategories(
  compartmentId: string,
  categories: Category[],
  monthExpenses: VariableExpense[],
): Promise<Map<string, Learned>> {
  const active = new Set(categories.map((c) => c.id));
  // A categoria padrão é onde cai o que ninguém classificou (a importação sem
  // IA põe lá o que não reconhece): aprender com ela travaria a compra no
  // padrão para sempre e impediria a IA de sugerir.
  const fallback = (categories.find((c) => c.isDefault) ?? categories[0])?.id;
  const learned = new Map<string, Learned>();
  const remember = (merchant: string, l: Learned) => {
    if (!merchant || !active.has(l.categoryId) || l.categoryId === fallback || learned.has(merchant)) {
      return;
    }
    learned.set(merchant, l);
  };
  for (const e of monthExpenses) {
    if (!e.description) continue;
    remember(merchantKey(e.description), {
      categoryId: e.categoryId,
      categoryName: e.categoryName,
      example: e.description,
    });
  }
  // Leitura de apoio: sem ela a revisão abre só sem as sugestões do histórico.
  const snap = await getDocs(
    query(importedItemsCol(compartmentId), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT)),
  ).catch(() => null);
  for (const d of snap?.docs ?? []) {
    const r = d.data() as Omit<ImportedItem, 'id'>;
    if (r.kind !== 'expense' || !r.categoryId) continue;
    remember(r.merchant, { categoryId: r.categoryId, categoryName: r.categoryName, example: tidyTitle(r.title) });
  }
  return learned;
}

/**
 * Categoria do usuário que aparece na categoria do banco ("Mercado" dentro de
 * "Supermercados / Mercearia / Padarias"). Compara palavra contra palavra,
 * aceitando uma como começo da outra.
 */
function matchBankCategory(bank: string | null, categories: Category[]): Category | null {
  if (!bank) return null;
  const bankWords = normalizeText(bank).split(/[^a-z]+/).filter((w) => w.length >= 4);
  for (const c of categories) {
    const words = normalizeText(c.name).split(/[^a-z]+/).filter((w) => w.length >= 4);
    const hit = words.some((w) =>
      bankWords.some((b) => b.startsWith(w.slice(0, 5)) || w.startsWith(b.slice(0, 5)) || b.includes(w)),
    );
    if (hit) return c;
  }
  return null;
}

/**
 * Monta o rascunho da revisão. Compra que já passou por uma importação (ou foi
 * ignorada) não aparece; a parcelada deixa de bloquear depois do último mês
 * dela, para uma compra nova idêntica poder entrar.
 */
export async function prepareImport(
  compartmentId: string,
  currentMonth: string,
  fileName: string,
  statement: ParsedStatement,
  ctx: { categories: Category[]; monthExpenses: VariableExpense[] },
): Promise<ImportDraft> {
  const occ = occurrences(statement.items);
  const keys = statement.items.map((item, i) =>
    item.installment ? installmentImportKey(item) : purchaseImportKey(item, occ[i]),
  );
  const docIds = await Promise.all(keys.map((k) => sha256Hex(k)));
  const [registry, learned] = await Promise.all([
    fetchRegistry(compartmentId, docIds),
    learnCategories(compartmentId, ctx.categories, ctx.monthExpenses),
  ]);

  const defaultCategory = ctx.categories.find((c) => c.isDefault) ?? ctx.categories[0] ?? null;
  // Lançamento digitado à mão no mês, por dia e valor: a compra da fatura que
  // bate com um deles provavelmente já foi lançada, e vem desmarcada.
  const manual = new Map<string, number>();
  for (const e of ctx.monthExpenses) {
    if (e.importKey) continue;
    const k = `${dayKey(new Date(e.createdAt))}|${e.amount}`;
    manual.set(k, (manual.get(k) ?? 0) + 1);
  }

  const rows: DraftRow[] = [];
  let alreadyImported = 0;
  statement.items.forEach((item, i) => {
    const prev = registry.get(docIds[i]);
    if (prev && (prev.until === null || prev.until >= currentMonth)) {
      alreadyImported++;
      return;
    }
    const merchant = merchantKey(item.rawTitle);
    const head = merchantHead(merchant);
    let fromHistory = learned.get(merchant);
    if (!fromHistory && head) {
      for (const [m, l] of learned) {
        if (merchantHead(m) === head) {
          fromHistory = l;
          break;
        }
      }
    }
    const fromBank = fromHistory ? null : matchBankCategory(item.bankCategory, ctx.categories);
    const dupKey = `${item.date}|${item.amount}`;
    const dupCount = manual.get(dupKey) ?? 0;
    if (dupCount > 0) manual.set(dupKey, dupCount - 1);
    rows.push({
      id: item.index,
      item,
      key: keys[i],
      docId: docIds[i],
      kind: item.installment ? 'fixed' : 'expense',
      include: dupCount === 0,
      description: tidyTitle(item.title),
      categoryId: fromHistory?.categoryId ?? fromBank?.id ?? defaultCategory?.id ?? null,
      newCategory: null,
      source: fromHistory ? 'history' : fromBank ? 'bank' : 'default',
      possibleDuplicate: dupCount > 0,
    });
  });

  const examples = [...learned.values()]
    .slice(0, 40)
    .map((l) => ({ description: l.example, category: l.categoryName }));

  return {
    fileName,
    format: statement.format,
    rows,
    alreadyImported,
    credits: statement.credits,
    invalid: statement.invalid,
    examples,
  };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

export interface CommitResult {
  expenses: number;
  fixed: number;
  skipped: number;
  newCategories: number;
}

// Folga abaixo do limite de 500 operações por lote do Firestore.
const BATCH_LIMIT = 400;

type Op = (batch: WriteBatch) => void;

/**
 * Grava a revisão confirmada no mês em aberto:
 * - compra à vista marcada vira lançamento variável, na semana corrente;
 * - compra parcelada marcada (como fixo) vira gasto fixo parcelado, que já
 *   entra no mês e avança sozinho nas próximas viradas;
 * - compra desmarcada só entra no registro, como ignorada.
 *
 * Cada compra vai no mesmo lote que o registro dela: se a rede cair no meio,
 * nenhum lançamento fica sem registro (o que o faria entrar de novo) e nenhum
 * registro fica sem lançamento (o que o esconderia para sempre).
 */
export async function commitImport(
  compartmentId: string,
  currentMonth: string,
  input: {
    rows: DraftRow[];
    origin: { id: string; name: string } | null;
    week: number;
    categories: Category[];
    format: StatementFormat;
  },
): Promise<CommitResult> {
  if (!(await isMonthOpen(compartmentId, currentMonth))) {
    throw new Error('O mês de referência não está aberto. Abra o mês na aba Pagamento e tente de novo.');
  }
  const now = Date.now();
  const result: CommitResult = { expenses: 0, fixed: 0, skipped: 0, newCategories: 0 };

  // Categorias novas sugeridas pela IA: uma por nome (sem caixa nem acento),
  // reaproveitando a existente de mesmo nome.
  const byName = new Map(input.categories.map((c) => [normalizeText(c.name), c]));
  const created = new Map<string, { id: string; name: string }>();
  for (const row of input.rows) {
    if (!row.include || row.kind !== 'expense' || row.categoryId || !row.newCategory) continue;
    const norm = normalizeText(row.newCategory);
    if (!norm || byName.has(norm) || created.has(norm)) continue;
    const id = await addCategory(compartmentId, currentMonth, { name: row.newCategory, idealAmount: 0 });
    created.set(norm, { id, name: row.newCategory.trim() });
    result.newCategories++;
  }
  const defaultCategory = input.categories.find((c) => c.isDefault) ?? input.categories[0] ?? null;
  const categoryOf = (row: DraftRow): { id: string; name: string } | null => {
    const chosen = input.categories.find((c) => c.id === row.categoryId);
    if (chosen) return chosen;
    if (row.newCategory) {
      const norm = normalizeText(row.newCategory);
      return byName.get(norm) ?? created.get(norm) ?? defaultCategory;
    }
    return defaultCategory;
  };

  const originId = input.origin?.id ?? null;
  const originName = input.origin?.name ?? '';
  const groups: Op[][] = [];

  input.rows.forEach((row, i) => {
    const { item } = row;
    const until = item.installment
      ? addMonthsKey(currentMonth, item.installment.total - item.installment.current)
      : null;
    const registryRef = doc(importedItemsCol(compartmentId), row.docId);
    const registry = (kind: ImportedKind, refId: string, cat: { id: string; name: string } | null) =>
      ({
        kind,
        key: row.key,
        ym: currentMonth,
        refId,
        title: item.rawTitle,
        merchant: merchantKey(item.rawTitle),
        categoryId: cat?.id ?? '',
        categoryName: cat?.name ?? '',
        amount: item.amount,
        until,
        createdAt: now,
      }) satisfies Omit<ImportedItem, 'id'>;
    const description = row.description.trim() || tidyTitle(item.title);

    if (!row.include) {
      groups.push([(b) => b.set(registryRef, registry('skipped', '', null))]);
      result.skipped++;
      return;
    }

    if (row.kind === 'fixed' && item.installment) {
      const fixedRef = doc(collection(db, 'compartments', compartmentId, 'fixedExpenses'));
      const data = {
        name: description,
        amount: item.amount,
        description: `Compra parcelada importada da fatura (${dayKeyFullLabel(item.date)})`,
        originId,
        originName,
        installmentCurrent: item.installment.current,
        installmentTotal: item.installment.total,
        planId: null,
      };
      groups.push([
        (b) => b.set(fixedRef, { ...data, importKey: row.key, active: true, createdAt: now }),
        (b) =>
          b.set(doc(fixedEntriesCol(compartmentId, currentMonth), fixedRef.id), {
            ...data,
            status: 'Pendente' satisfies EntryStatus,
          }),
        (b) => b.set(registryRef, registry('fixed', fixedRef.id, null)),
      ]);
      result.fixed++;
      return;
    }

    const cat = categoryOf(row);
    if (!cat) return;
    const expenseRef = doc(expensesCol(compartmentId, currentMonth));
    // A hora vem do relógio, com um milissegundo por linha: os lançamentos do
    // mesmo dia mantêm a ordem da fatura no histórico.
    const createdAt = dateFromDayKey(item.date, new Date(now + i)).getTime();
    groups.push([
      (b) =>
        b.set(expenseRef, {
          categoryId: cat.id,
          categoryName: cat.name,
          amount: item.amount,
          description,
          createdAt,
          week: input.week,
          originId,
          originName,
          importKey: row.key,
        } satisfies Omit<VariableExpense, 'id'>),
      (b) => b.set(registryRef, registry('expense', expenseRef.id, cat)),
    ]);
    result.expenses++;
  });

  let batch = writeBatch(db);
  let size = 0;
  for (const group of groups) {
    if (size + group.length > BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      size = 0;
    }
    group.forEach((op) => op(batch));
    size += group.length;
  }
  if (size > 0) await batch.commit();
  return result;
}
