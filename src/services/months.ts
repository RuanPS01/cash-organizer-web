import { collection, doc, getDoc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import type { WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { nextMonthKey } from '../utils/dates';
import { IGNORED_STATUS } from '../types';
import type {
  Category,
  CategoryEntry,
  FixedEntry,
  FixedExpense,
  MonthDoc,
  MonthTotals,
  Origin,
  OriginEntry,
  VariableExpense,
} from '../types';

export function monthRef(compartmentId: string, ym: string) {
  return doc(db, 'compartments', compartmentId, 'months', ym);
}

export function fixedEntriesCol(compartmentId: string, ym: string) {
  return collection(db, 'compartments', compartmentId, 'months', ym, 'fixedEntries');
}

export function categoryEntriesCol(compartmentId: string, ym: string) {
  return collection(db, 'compartments', compartmentId, 'months', ym, 'categoryEntries');
}

export function originEntriesCol(compartmentId: string, ym: string) {
  return collection(db, 'compartments', compartmentId, 'months', ym, 'originEntries');
}

export function expensesCol(compartmentId: string, ym: string) {
  return collection(db, 'compartments', compartmentId, 'months', ym, 'expenses');
}

async function fetchActive<T>(compartmentId: string, colName: string): Promise<(T & { id: string })[]> {
  const snap = await getDocs(collection(db, 'compartments', compartmentId, colName));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as T) }))
    .filter((item) => (item as { active?: boolean }).active !== false);
}

/**
 * Reconcilia o mês em aberto com os cadastros, nos dois sentidos:
 * - remove linhas cujos cadastros foram removidos (fixos desativados, e
 *   categorias e origens desativadas que não têm gasto no mês);
 * - adiciona linhas de fixos, categorias e origens ativos que ainda não
 *   existem no mês (ex.: mês criado antes do cadastro, ou virada para um mês
 *   que já existia). É o que mantém os três cadastros ao virar o mês;
 * - completa a linha de fixo que ainda não tem o campo de origem, criada antes
 *   de o gasto fixo poder ter uma.
 */
async function syncMonthEntries(compartmentId: string, ym: string): Promise<void> {
  const [fixedCad, catCad, originCad, fixedEntries, catEntries, originEntries, expenses] =
    await Promise.all([
      getDocs(collection(db, 'compartments', compartmentId, 'fixedExpenses')),
      getDocs(collection(db, 'compartments', compartmentId, 'categories')),
      getDocs(collection(db, 'compartments', compartmentId, 'origins')),
      getDocs(fixedEntriesCol(compartmentId, ym)),
      getDocs(categoryEntriesCol(compartmentId, ym)),
      getDocs(originEntriesCol(compartmentId, ym)),
      getDocs(expensesCol(compartmentId, ym)),
    ]);

  const activeFixed = new Set(
    fixedCad.docs.filter((d) => d.data().active !== false).map((d) => d.id),
  );
  const activeCats = new Set(
    catCad.docs.filter((d) => d.data().active !== false).map((d) => d.id),
  );
  const activeOrigins = new Set(
    originCad.docs.filter((d) => d.data().active !== false).map((d) => d.id),
  );
  const usedCats = new Set(expenses.docs.map((d) => d.data().categoryId as string));
  // Origem usada no mês (por lançamento ou por gasto fixo) não perde a linha
  // quando o cadastro é desativado: o status dela ainda vale para este mês.
  const usedOrigins = new Set([
    ...expenses.docs.map((d) => d.data().originId as string | null),
    ...fixedEntries.docs.map((d) => d.data().originId as string | null),
  ]);
  const fixedEntryIds = new Set(fixedEntries.docs.map((d) => d.id));
  const catEntryIds = new Set(catEntries.docs.map((d) => d.id));
  const originEntryIds = new Set(originEntries.docs.map((d) => d.id));

  const batch = writeBatch(db);
  let dirty = false;

  for (const entry of fixedEntries.docs) {
    if (!activeFixed.has(entry.id)) {
      batch.delete(entry.ref);
      dirty = true;
    }
  }
  for (const entry of catEntries.docs) {
    if (!activeCats.has(entry.id) && !usedCats.has(entry.id)) {
      batch.delete(entry.ref);
      dirty = true;
    }
  }
  for (const entry of originEntries.docs) {
    if (!activeOrigins.has(entry.id) && !usedOrigins.has(entry.id)) {
      batch.delete(entry.ref);
      dirty = true;
    }
  }

  // Linha de fixo criada antes de o gasto fixo ter origem não tem os campos, e
  // a aba Pagamento jogaria esse valor todo em "Sem origem". Completa uma vez,
  // com o que está no cadastro, sem tocar em valor nem em status (que são do
  // mês). Depois disso a chave existe e a linha não é mais reescrita.
  for (const entry of fixedEntries.docs) {
    if ('originId' in entry.data()) continue;
    const cad = fixedCad.docs.find((d) => d.id === entry.id);
    // Cadastro sumido ou desativado: a linha está sendo apagada logo acima.
    if (!cad || cad.data().active === false) continue;
    batch.update(entry.ref, {
      originId: cad.data().originId ?? null,
      originName: cad.data().originName ?? '',
    });
    dirty = true;
  }

  for (const cad of fixedCad.docs) {
    const f = cad.data();
    if (f.active === false || fixedEntryIds.has(cad.id)) continue;
    batch.set(doc(fixedEntriesCol(compartmentId, ym), cad.id), {
      name: f.name,
      amount: f.amount,
      idealAmount: f.idealAmount || f.amount,
      status: 'Pendente',
      description: f.description ?? '',
      originId: f.originId ?? null,
      originName: f.originName ?? '',
      installmentCurrent: f.installmentCurrent ?? null,
      installmentTotal: f.installmentTotal ?? null,
    } satisfies Omit<FixedEntry, 'id'>);
    dirty = true;
  }
  for (const cad of catCad.docs) {
    const c = cad.data();
    if (c.active === false || catEntryIds.has(cad.id)) continue;
    batch.set(doc(categoryEntriesCol(compartmentId, ym), cad.id), {
      name: c.name,
      idealAmount: c.idealAmount,
      status: 'Pendente',
    } satisfies Omit<CategoryEntry, 'id'>);
    dirty = true;
  }
  for (const cad of originCad.docs) {
    const o = cad.data();
    if (o.active === false || originEntryIds.has(cad.id)) continue;
    batch.set(doc(originEntriesCol(compartmentId, ym), cad.id), {
      name: o.name,
      status: 'Pendente',
    } satisfies Omit<OriginEntry, 'id'>);
    dirty = true;
  }

  if (dirty) await batch.commit();
}

/**
 * Adiciona ao batch as linhas do mês a partir dos cadastros ativos (fixos
 * com valor/ideal/descrição/origem/parcela; categorias com o ideal; origens
 * apenas com o status, que é o que a aba Pagamento acompanha nelas).
 */
async function seedMonthEntries(
  compartmentId: string,
  ym: string,
  batch: WriteBatch,
): Promise<void> {
  const [fixed, categories, origins] = await Promise.all([
    fetchActive<Omit<FixedExpense, 'id'>>(compartmentId, 'fixedExpenses'),
    fetchActive<Omit<Category, 'id'>>(compartmentId, 'categories'),
    fetchActive<Omit<Origin, 'id'>>(compartmentId, 'origins'),
  ]);

  for (const f of fixed) {
    batch.set(doc(fixedEntriesCol(compartmentId, ym), f.id), {
      name: f.name,
      amount: f.amount,
      idealAmount: f.idealAmount || f.amount,
      status: 'Pendente',
      description: f.description ?? '',
      originId: f.originId ?? null,
      originName: f.originName ?? '',
      installmentCurrent: f.installmentCurrent ?? null,
      installmentTotal: f.installmentTotal ?? null,
    } satisfies Omit<FixedEntry, 'id'>);
  }
  for (const c of categories) {
    batch.set(doc(categoryEntriesCol(compartmentId, ym), c.id), {
      name: c.name,
      idealAmount: c.idealAmount,
      status: 'Pendente',
    } satisfies Omit<CategoryEntry, 'id'>);
  }
  for (const o of origins) {
    batch.set(doc(originEntriesCol(compartmentId, ym), o.id), {
      name: o.name,
      status: 'Pendente',
    } satisfies Omit<OriginEntry, 'id'>);
  }
}

/** O mês existe e está aberto? É a condição para um cadastro refletir nele. */
export async function isMonthOpen(compartmentId: string, ym: string): Promise<boolean> {
  const month = await getDoc(monthRef(compartmentId, ym));
  return month.exists() && month.data().status === 'open';
}

/**
 * Garante que o mês existe: se não existir, cria o documento do mês e as
 * linhas de gastos fixos (com valor/ideal preenchidos a partir do cadastro),
 * de categorias (apenas o ideal; o gasto real vem dos lançamentos) e de
 * origens (apenas o status).
 * Se já existir e estiver aberto, reconcilia as linhas com os cadastros.
 */
export async function ensureMonth(compartmentId: string, ym: string): Promise<void> {
  const ref = monthRef(compartmentId, ym);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    // Reconciliar é manutenção: o mês já existe e o app funciona sem ela. Sem
    // este catch, uma escrita recusada (regra do banco ainda não liberada, por
    // exemplo) derrubaria a entrada no app, como se a sessão fosse inválida.
    if (snap.data().status === 'open') {
      await syncMonthEntries(compartmentId, ym).catch(() => undefined);
    }
    return;
  }

  const batch = writeBatch(db);
  batch.set(ref, { status: 'open' } satisfies Omit<MonthDoc, 'id'>);
  await seedMonthEntries(compartmentId, ym, batch);
  await batch.commit();
}

// O Firestore aceita no máximo 500 operações por lote; a folga evita ter que
// recontar quando uma escrita ganha mais um passo.
const BATCH_LIMIT = 400;

type BatchOp = (batch: WriteBatch) => void;

/** Aplica as operações em lotes de até BATCH_LIMIT, na ordem recebida. */
async function commitInChunks(ops: BatchOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

/**
 * Troca o mês de referência: `toYm` passa a ser o mês em aberto e leva junto
 * todo o conteúdo do mês que estava aberto (linhas de gastos fixos com valor e
 * status, linhas de categorias, linhas de origens e lançamentos), cada
 * documento com o mesmo id.
 * O mês de origem fica vazio.
 *
 * Os cadastros (gastos fixos, categorias e origens) pertencem ao compartimento
 * e não ao mês, então continuam valendo sem cópia nenhuma; o `syncMonthEntries`
 * do fim só completa o destino com cadastro ativo que ainda não tinha linha.
 *
 * Com `replaceTarget`, o que já existia no destino é apagado antes (é o fluxo
 * de dupla confirmação da tela).
 *
 * A ordem importa: copiar, depois apagar a origem, depois trocar o
 * `currentMonth`. Se a rede cair no meio, o pior caso é o conteúdo aparecer
 * nos dois meses, e nada se perde.
 */
export async function setOpenMonth(
  compartmentId: string,
  fromYm: string,
  toYm: string,
  replaceTarget: boolean,
): Promise<void> {
  if (fromYm === toYm) {
    await ensureMonth(compartmentId, toYm);
    await updateDoc(doc(db, 'compartments', compartmentId), { currentMonth: toYm });
    return;
  }

  const [
    fromFixed,
    fromCats,
    fromOrigins,
    fromExpenses,
    toFixed,
    toCats,
    toOrigins,
    toExpenses,
  ] = await Promise.all([
    getDocs(fixedEntriesCol(compartmentId, fromYm)),
    getDocs(categoryEntriesCol(compartmentId, fromYm)),
    getDocs(originEntriesCol(compartmentId, fromYm)),
    getDocs(expensesCol(compartmentId, fromYm)),
    getDocs(fixedEntriesCol(compartmentId, toYm)),
    getDocs(categoryEntriesCol(compartmentId, toYm)),
    getDocs(originEntriesCol(compartmentId, toYm)),
    getDocs(expensesCol(compartmentId, toYm)),
  ]);

  const prepara: BatchOp[] = [];
  if (replaceTarget) {
    for (const d of [...toFixed.docs, ...toCats.docs, ...toOrigins.docs, ...toExpenses.docs]) {
      prepara.push((b) => b.delete(d.ref));
    }
  }
  // set sem merge sobrescreve o doc do mês, limpando closedAt e totals de um
  // mês que já tinha sido fechado.
  prepara.push((b) =>
    b.set(monthRef(compartmentId, toYm), { status: 'open' } satisfies Omit<MonthDoc, 'id'>),
  );
  await commitInChunks(prepara);

  const copia: BatchOp[] = [
    ...fromFixed.docs.map(
      (d): BatchOp => (b) => b.set(doc(fixedEntriesCol(compartmentId, toYm), d.id), d.data()),
    ),
    ...fromCats.docs.map(
      (d): BatchOp => (b) => b.set(doc(categoryEntriesCol(compartmentId, toYm), d.id), d.data()),
    ),
    ...fromOrigins.docs.map(
      (d): BatchOp => (b) => b.set(doc(originEntriesCol(compartmentId, toYm), d.id), d.data()),
    ),
    ...fromExpenses.docs.map(
      (d): BatchOp => (b) => b.set(doc(expensesCol(compartmentId, toYm), d.id), d.data()),
    ),
  ];
  await commitInChunks(copia);

  await commitInChunks(
    [...fromFixed.docs, ...fromCats.docs, ...fromOrigins.docs, ...fromExpenses.docs].map(
      (d): BatchOp => (b) => b.delete(d.ref),
    ),
  );

  await updateDoc(doc(db, 'compartments', compartmentId), { currentMonth: toYm });
  await syncMonthEntries(compartmentId, toYm);
}

/**
 * Totais do mês. Linhas com status "Ignorar" ficam de fora do gasto somado
 * (fixedActual/varActual) mas continuam contando no ideal, que é o orçamento
 * planejado; o valor delas segue visível na tela, marcado como ignorado.
 *
 * O "Ignorar" vale em três lugares: na linha de gasto fixo, na linha de origem
 * (tira do mês tudo que saiu dela, que é como a aba Pagamento trabalha hoje) e
 * na linha de categoria, que não tem mais status na interface mas continua
 * valendo para os meses em que foi marcada.
 */
export function computeTotals(
  fixedEntries: FixedEntry[],
  categoryEntries: CategoryEntry[],
  expenses: VariableExpense[],
  originEntries: OriginEntry[],
): MonthTotals {
  const ignoredOrigins = new Set(
    originEntries.filter((o) => o.status === IGNORED_STATUS).map((o) => o.id),
  );
  const byCategory: MonthTotals['byCategory'] = {};
  for (const c of categoryEntries) {
    byCategory[c.id] = {
      name: c.name,
      ideal: c.idealAmount,
      actual: 0,
      ignored: c.status === IGNORED_STATUS,
    };
  }
  for (const e of expenses) {
    const cat = (byCategory[e.categoryId] ??= {
      name: e.categoryName,
      ideal: 0,
      actual: 0,
      ignored: false,
    });
    // A categoria continua na lista (o ideal dela vale), mas o dinheiro que
    // saiu de uma origem ignorada não entra em soma nenhuma.
    if (e.originId && ignoredOrigins.has(e.originId)) continue;
    cat.actual += e.amount;
  }
  return {
    fixedIdeal: fixedEntries.reduce((s, f) => s + f.idealAmount, 0),
    fixedActual: fixedEntries
      .filter((f) => f.status !== IGNORED_STATUS)
      .reduce((s, f) => s + f.amount, 0),
    varIdeal: categoryEntries.reduce((s, c) => s + c.idealAmount, 0),
    varActual: Object.values(byCategory)
      .filter((c) => !c.ignored)
      .reduce((s, c) => s + c.actual, 0),
    byCategory,
  };
}

/**
 * Fecha o mês corrente: grava os totais no documento do mês, marca como
 * "closed" e avança o mês corrente do compartimento, inicializando o próximo
 * (gastos fixos, categorias e origens são mantidos).
 *
 * Pré-condição (validada na UI e aqui): nenhuma linha com status "Pendente"
 * entre as que a aba Pagamento resolve, que são as origens e os gastos fixos.
 * A linha de categoria não entra: ela existe pelo ideal, não é paga.
 */
export async function closeMonth(
  compartmentId: string,
  ym: string,
  fixedEntries: FixedEntry[],
  categoryEntries: CategoryEntry[],
  expenses: VariableExpense[],
  originEntries: OriginEntry[],
): Promise<string> {
  const pending = [...originEntries, ...fixedEntries].filter((e) => e.status === 'Pendente');
  if (pending.length > 0) {
    throw new Error(`Ainda há itens pendentes: ${pending.map((p) => p.name).join(', ')}`);
  }

  const totals = computeTotals(fixedEntries, categoryEntries, expenses, originEntries);
  const next = nextMonthKey(ym);

  const batch = writeBatch(db);
  batch.update(monthRef(compartmentId, ym), {
    status: 'closed',
    closedAt: Date.now(),
    totals,
  });
  batch.update(doc(db, 'compartments', compartmentId), { currentMonth: next });
  await batch.commit();

  await advanceInstallments(compartmentId);
  await ensureMonth(compartmentId, next);
  return next;
}

/**
 * Ao virar o mês, avança a parcela dos gastos fixos parcelados: quem ainda
 * não chegou na última parcela incrementa a atual; quem estava na última é
 * desativado e sai do mês seguinte.
 */
async function advanceInstallments(compartmentId: string): Promise<void> {
  const snap = await getDocs(collection(db, 'compartments', compartmentId, 'fixedExpenses'));
  const batch = writeBatch(db);
  let dirty = false;
  for (const d of snap.docs) {
    const f = d.data();
    if (f.active === false) continue;
    const total = typeof f.installmentTotal === 'number' ? f.installmentTotal : null;
    if (!total || total < 1) continue;
    const current = typeof f.installmentCurrent === 'number' ? f.installmentCurrent : 1;
    if (current >= total) {
      batch.update(d.ref, { active: false });
    } else {
      batch.update(d.ref, { installmentCurrent: current + 1 });
    }
    dirty = true;
  }
  if (dirty) await batch.commit();
}

/** Carrega os lançamentos variáveis de um mês (para estatísticas). */
export async function fetchExpenses(
  compartmentId: string,
  ym: string,
): Promise<VariableExpense[]> {
  const snap = await getDocs(expensesCol(compartmentId, ym));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VariableExpense, 'id'>) }));
}
