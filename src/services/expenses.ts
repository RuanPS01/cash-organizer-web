import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { weekOfMonth } from '../utils/dates';
import {
  categoryEntriesCol,
  expensesCol,
  fixedEntriesCol,
  isMonthOpen,
  originEntriesCol,
} from './months';
import type { Category, EntryStatus, OriginEntry } from '../types';

// ---------------------------------------------------------------------------
// Lançamentos variáveis
// ---------------------------------------------------------------------------

export async function addVariableExpense(
  compartmentId: string,
  ym: string,
  input: {
    categoryId: string;
    categoryName: string;
    amount: number;
    description: string;
    /** Data do lançamento; sem ela, o momento atual. */
    date?: Date;
    /** Origem do gasto; sem origem cadastrada, fica null. */
    originId?: string | null;
    originName?: string;
  },
): Promise<void> {
  const { date, description, originId, originName, ...rest } = input;
  const when = date ?? new Date();
  await addDoc(expensesCol(compartmentId, ym), {
    ...rest,
    description: description.trim(),
    createdAt: when.getTime(),
    week: weekOfMonth(when),
    // Sempre gravados (null/vazio quando não há origem): undefined faz o SDK
    // recusar o documento inteiro.
    originId: originId ?? null,
    originName: originName ?? '',
  });
}

/**
 * Reclassificação de um lançamento: categoria e origem. O nome vai junto do
 * id (denormalizado, como na criação) para o histórico continuar legível se o
 * cadastro for renomeado depois; origem vazia é `null` mais nome em branco,
 * nunca `undefined`, que o SDK recusa.
 */
// Declarado com `type` e não `interface` de propósito: o SDK exige um payload
// com assinatura de índice, e só o alias de tipo ganha a implícita.
export type ExpenseClassification = {
  categoryId?: string;
  categoryName?: string;
  originId?: string | null;
  originName?: string;
};

/**
 * Edita um lançamento já gravado (histórico do mês): valor, descrição, data e
 * classificação. A data traz a semana junto, porque a semana é derivada dela;
 * o mês do documento não muda, porque o mês do app é a referência da fatura e
 * não o calendário (é a mesma regra de quem lança em data passada).
 */
export type ExpenseEdit = Partial<{ amount: number; description: string; date: Date }> &
  ExpenseClassification;

export async function updateVariableExpense(
  compartmentId: string,
  ym: string,
  expenseId: string,
  patch: ExpenseEdit,
): Promise<void> {
  const { date, ...rest } = patch;
  await updateDoc(doc(expensesCol(compartmentId, ym), expenseId), {
    ...rest,
    // Sem data no patch, `createdAt` e `week` nem são tocados: quem só corrigiu
    // o valor não reescreve a data do lançamento.
    ...(date ? { createdAt: date.getTime(), week: weekOfMonth(date) } : {}),
  });
}

// O Firestore aceita no máximo 500 operações por lote; a folga evita ter que
// pensar nisso de novo se a escrita ganhar mais campos.
const BATCH_LIMIT = 400;

/**
 * Aplica a mesma classificação a vários lançamentos de uma vez. Cada fatia vai
 * em um `writeBatch` (tudo ou nada dentro da fatia), o que evita deixar metade
 * da seleção reclassificada quando a rede cai no meio.
 */
export async function updateVariableExpenses(
  compartmentId: string,
  ym: string,
  expenseIds: string[],
  patch: ExpenseClassification,
): Promise<void> {
  if (expenseIds.length === 0 || Object.keys(patch).length === 0) return;
  const col = expensesCol(compartmentId, ym);
  for (let i = 0; i < expenseIds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of expenseIds.slice(i, i + BATCH_LIMIT)) {
      batch.update(doc(col, id), patch);
    }
    await batch.commit();
  }
}

export async function deleteVariableExpense(
  compartmentId: string,
  ym: string,
  expenseId: string,
): Promise<void> {
  await deleteDoc(doc(expensesCol(compartmentId, ym), expenseId));
}

// ---------------------------------------------------------------------------
// Gastos fixos (cadastro + linha do mês corrente aberto)
// ---------------------------------------------------------------------------

export interface FixedExpenseInput {
  name: string;
  amount: number;
  idealAmount?: number;
  description?: string;
  /** Origem do gasto (de onde o dinheiro sai); sem origem escolhida, fica null. */
  originId?: string | null;
  originName?: string;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
}

function normalizeFixedInput(input: FixedExpenseInput) {
  return {
    name: input.name.trim(),
    amount: input.amount,
    idealAmount: input.idealAmount || input.amount,
    description: input.description?.trim() ?? '',
    // O nome vai junto do id (denormalizado, como no lançamento variável) para
    // a listagem continuar legível se a origem for renomeada ou removida.
    // Sempre gravados: undefined faz o SDK recusar o documento inteiro.
    originId: input.originId ?? null,
    originName: input.originName?.trim() ?? '',
    installmentCurrent: input.installmentTotal ? (input.installmentCurrent ?? 1) : null,
    installmentTotal: input.installmentTotal ?? null,
  };
}

export async function addFixedExpense(
  compartmentId: string,
  currentMonth: string,
  input: FixedExpenseInput,
): Promise<void> {
  const data = normalizeFixedInput(input);
  const ref = await addDoc(collection(db, 'compartments', compartmentId, 'fixedExpenses'), {
    ...data,
    active: true,
    createdAt: Date.now(),
  });
  // Reflete no mês corrente, se ele estiver aberto.
  if (await isMonthOpen(compartmentId, currentMonth)) {
    await setDoc(doc(fixedEntriesCol(compartmentId, currentMonth), ref.id), {
      ...data,
      status: 'Pendente' satisfies EntryStatus,
    });
  }
}

/**
 * Salva a edição completa de um gasto fixo (nome, descrição, valores, origem
 * e parcela) e reflete os campos na linha do mês corrente em aberto.
 */
export async function saveFixedExpense(
  compartmentId: string,
  currentMonth: string,
  id: string,
  input: FixedExpenseInput,
): Promise<void> {
  const data = normalizeFixedInput(input);
  await updateDoc(doc(db, 'compartments', compartmentId, 'fixedExpenses', id), data);
  if (await isMonthOpen(compartmentId, currentMonth)) {
    const entryRef = doc(fixedEntriesCol(compartmentId, currentMonth), id);
    const entry = await getDoc(entryRef);
    if (entry.exists()) {
      await updateDoc(entryRef, data);
    } else {
      await setDoc(entryRef, { ...data, status: 'Pendente' satisfies EntryStatus });
    }
  }
}

export async function updateFixedExpense(
  compartmentId: string,
  id: string,
  patch: Partial<{ name: string; amount: number; idealAmount: number; active: boolean }>,
): Promise<void> {
  await updateDoc(doc(db, 'compartments', compartmentId, 'fixedExpenses', id), patch);
}

/** Desativa o gasto fixo e remove a linha dele do mês corrente em aberto. */
export async function removeFixedExpense(
  compartmentId: string,
  currentMonth: string,
  id: string,
): Promise<void> {
  await updateFixedExpense(compartmentId, id, { active: false });
  if (await isMonthOpen(compartmentId, currentMonth)) {
    await deleteDoc(doc(fixedEntriesCol(compartmentId, currentMonth), id));
  }
}

/**
 * Desativa a categoria e, se ela não tiver lançamentos no mês corrente em
 * aberto, remove também a linha do mês. Com lançamentos, a linha permanece
 * até o mês virar para não sumir com valores já gastos.
 */
export async function removeCategory(
  compartmentId: string,
  currentMonth: string,
  id: string,
): Promise<void> {
  await updateCategory(compartmentId, id, { active: false });
  if (await isMonthOpen(compartmentId, currentMonth)) {
    const used = await getDocs(
      query(expensesCol(compartmentId, currentMonth), where('categoryId', '==', id), limit(1)),
    );
    if (used.empty) {
      await deleteDoc(doc(categoryEntriesCol(compartmentId, currentMonth), id));
    }
  }
}

// ---------------------------------------------------------------------------
// Categorias de gastos variáveis
// ---------------------------------------------------------------------------

export async function addCategory(
  compartmentId: string,
  currentMonth: string,
  input: { name: string; idealAmount: number },
): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(collection(db, 'compartments', compartmentId, 'categories'), {
    name: input.name.trim(),
    idealAmount: input.idealAmount,
    isDefault: false,
    sortOrder: now,
    active: true,
    createdAt: now,
  });
  if (await isMonthOpen(compartmentId, currentMonth)) {
    await setDoc(doc(categoryEntriesCol(compartmentId, currentMonth), ref.id), {
      name: input.name.trim(),
      idealAmount: input.idealAmount,
      status: 'Pendente' satisfies EntryStatus,
    });
  }
  return ref.id;
}

export async function updateCategory(
  compartmentId: string,
  id: string,
  patch: Partial<{ name: string; idealAmount: number; active: boolean }>,
): Promise<void> {
  await updateDoc(doc(db, 'compartments', compartmentId, 'categories', id), patch);
}

/**
 * Move a categoria uma posição para cima ou para baixo, trocando a chave de
 * ordenação com a vizinha (a lista recebida já deve estar na ordem exibida).
 */
export async function moveCategory(
  compartmentId: string,
  ordered: Category[],
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  const index = ordered.findIndex((c) => c.id === id);
  const other = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || other < 0 || other >= ordered.length) return;

  const a = ordered[index];
  const b = ordered[other];
  const keyA = a.sortOrder ?? a.createdAt;
  const keyB = b.sortOrder ?? b.createdAt;

  const batch = writeBatch(db);
  batch.update(doc(db, 'compartments', compartmentId, 'categories', a.id), { sortOrder: keyB });
  batch.update(doc(db, 'compartments', compartmentId, 'categories', b.id), { sortOrder: keyA });
  await batch.commit();
}

/**
 * Transfere o papel de categoria padrão (pré-selecionada e não removível)
 * para a categoria indicada; a padrão anterior vira uma categoria comum.
 */
export async function setDefaultCategory(
  compartmentId: string,
  categories: Category[],
  id: string,
): Promise<void> {
  const batch = writeBatch(db);
  for (const c of categories) {
    const shouldBeDefault = c.id === id;
    if (c.isDefault !== shouldBeDefault) {
      batch.update(doc(db, 'compartments', compartmentId, 'categories', c.id), {
        isDefault: shouldBeDefault,
      });
    }
  }
  await batch.commit();
}

/**
 * Atualiza o gasto ideal da categoria no cadastro e também na linha do mês
 * corrente em aberto (a tela de novo gasto lê o ideal do mês).
 */
export async function saveCategoryIdeal(
  compartmentId: string,
  currentMonth: string,
  id: string,
  idealAmount: number,
): Promise<void> {
  await updateCategory(compartmentId, id, { idealAmount });
  if (await isMonthOpen(compartmentId, currentMonth)) {
    const entryRef = doc(categoryEntriesCol(compartmentId, currentMonth), id);
    const entry = await getDoc(entryRef);
    if (entry.exists()) await updateDoc(entryRef, { idealAmount });
  }
}

/** Renomeia a categoria no cadastro e na linha do mês corrente em aberto. */
export async function renameCategory(
  compartmentId: string,
  currentMonth: string,
  id: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await updateCategory(compartmentId, id, { name: trimmed });
  if (await isMonthOpen(compartmentId, currentMonth)) {
    const entryRef = doc(categoryEntriesCol(compartmentId, currentMonth), id);
    const entry = await getDoc(entryRef);
    if (entry.exists()) await updateDoc(entryRef, { name: trimmed });
  }
}

// ---------------------------------------------------------------------------
// Linhas do mês (status e valores)
// ---------------------------------------------------------------------------

export async function updateFixedEntry(
  compartmentId: string,
  ym: string,
  entryId: string,
  patch: Partial<{
    amount: number;
    idealAmount: number;
    status: EntryStatus;
    /** Só a linha do mês muda; o cadastro segue com a descrição original. */
    description: string;
  }>,
): Promise<void> {
  await updateDoc(doc(fixedEntriesCol(compartmentId, ym), entryId), patch);
}

export async function updateCategoryEntry(
  compartmentId: string,
  ym: string,
  entryId: string,
  patch: Partial<{ idealAmount: number; status: EntryStatus }>,
): Promise<void> {
  await updateDoc(doc(categoryEntriesCol(compartmentId, ym), entryId), patch);
}

/**
 * Define o status da origem no mês e repassa o mesmo status aos gastos fixos
 * que saem dela (cada fixo ainda pode ser ajustado depois, na tabela dele).
 * Os dois vão no mesmo `writeBatch`: marcar a origem como paga e deixar os
 * fixos dela pendentes seria um estado que a tela mostraria como meio pago.
 *
 * A linha da origem é gravada inteira (`set`), não alterada: a tela lista as
 * origens do cadastro, então a primeira troca de status pode ser justamente o
 * que cria a linha do mês (mês reconciliado antes de a origem existir, por
 * exemplo). A linha só tem nome e status, então não há nada a preservar.
 */
export async function setOriginStatus(
  compartmentId: string,
  ym: string,
  origin: OriginEntry,
  fixedEntryIds: string[],
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(originEntriesCol(compartmentId, ym), origin.id), {
    name: origin.name,
    status: origin.status,
  } satisfies Omit<OriginEntry, 'id'>);
  for (const id of fixedEntryIds) {
    batch.update(doc(fixedEntriesCol(compartmentId, ym), id), { status: origin.status });
  }
  await batch.commit();
}
