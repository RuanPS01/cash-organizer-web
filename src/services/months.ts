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
 * - remove linhas cujos cadastros foram removidos (fixos desativados e
 *   categorias desativadas sem lançamentos no mês);
 * - adiciona linhas de fixos e categorias ativos que ainda não existem no
 *   mês (ex.: mês criado antes do cadastro, ou virada para um mês que já
 *   existia). Garante que categorias e fixos sejam mantidos ao virar o mês.
 */
async function syncMonthEntries(compartmentId: string, ym: string): Promise<void> {
  const [fixedCad, catCad, fixedEntries, catEntries, expenses] = await Promise.all([
    getDocs(collection(db, 'compartments', compartmentId, 'fixedExpenses')),
    getDocs(collection(db, 'compartments', compartmentId, 'categories')),
    getDocs(fixedEntriesCol(compartmentId, ym)),
    getDocs(categoryEntriesCol(compartmentId, ym)),
    getDocs(expensesCol(compartmentId, ym)),
  ]);

  const activeFixed = new Set(
    fixedCad.docs.filter((d) => d.data().active !== false).map((d) => d.id),
  );
  const activeCats = new Set(
    catCad.docs.filter((d) => d.data().active !== false).map((d) => d.id),
  );
  const usedCats = new Set(expenses.docs.map((d) => d.data().categoryId as string));
  const fixedEntryIds = new Set(fixedEntries.docs.map((d) => d.id));
  const catEntryIds = new Set(catEntries.docs.map((d) => d.id));

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

  for (const cad of fixedCad.docs) {
    const f = cad.data();
    if (f.active === false || fixedEntryIds.has(cad.id)) continue;
    batch.set(doc(fixedEntriesCol(compartmentId, ym), cad.id), {
      name: f.name,
      amount: f.amount,
      idealAmount: f.idealAmount || f.amount,
      status: 'Pendente',
      description: f.description ?? '',
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

  if (dirty) await batch.commit();
}

/**
 * Adiciona ao batch as linhas do mês a partir dos cadastros ativos (fixos
 * com valor/ideal/descrição/parcela; categorias com o ideal).
 */
async function seedMonthEntries(
  compartmentId: string,
  ym: string,
  batch: WriteBatch,
): Promise<void> {
  const [fixed, categories] = await Promise.all([
    fetchActive<Omit<FixedExpense, 'id'>>(compartmentId, 'fixedExpenses'),
    fetchActive<Omit<Category, 'id'>>(compartmentId, 'categories'),
  ]);

  for (const f of fixed) {
    batch.set(doc(fixedEntriesCol(compartmentId, ym), f.id), {
      name: f.name,
      amount: f.amount,
      idealAmount: f.idealAmount || f.amount,
      status: 'Pendente',
      description: f.description ?? '',
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
}

/**
 * Garante que o mês existe: se não existir, cria o documento do mês e as
 * linhas de gastos fixos (com valor/ideal preenchidos a partir do cadastro)
 * e de categorias (apenas o ideal; o gasto real vem dos lançamentos).
 * Se já existir e estiver aberto, reconcilia as linhas com os cadastros.
 */
export async function ensureMonth(compartmentId: string, ym: string): Promise<void> {
  const ref = monthRef(compartmentId, ym);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    if (snap.data().status === 'open') {
      await syncMonthEntries(compartmentId, ym);
    }
    return;
  }

  const batch = writeBatch(db);
  batch.set(ref, { status: 'open' } satisfies Omit<MonthDoc, 'id'>);
  await seedMonthEntries(compartmentId, ym, batch);
  await batch.commit();
}

/**
 * Define ym como o mês em aberto do compartimento (anterior ou posterior).
 * Com reinitialize=true, apaga as linhas e lançamentos existentes do mês e
 * o reinicia a partir dos cadastros atuais (fluxo de dupla confirmação).
 */
export async function setOpenMonth(
  compartmentId: string,
  ym: string,
  reinitialize: boolean,
): Promise<void> {
  if (!reinitialize) {
    await ensureMonth(compartmentId, ym);
    await updateDoc(doc(db, 'compartments', compartmentId), { currentMonth: ym });
    return;
  }

  const [fe, ce, ex] = await Promise.all([
    getDocs(fixedEntriesCol(compartmentId, ym)),
    getDocs(categoryEntriesCol(compartmentId, ym)),
    getDocs(expensesCol(compartmentId, ym)),
  ]);
  const batch = writeBatch(db);
  for (const d of [...fe.docs, ...ce.docs, ...ex.docs]) {
    batch.delete(d.ref);
  }
  // set sem merge sobrescreve o doc do mês, limpando closedAt/totals
  batch.set(monthRef(compartmentId, ym), { status: 'open' } satisfies Omit<MonthDoc, 'id'>);
  batch.update(doc(db, 'compartments', compartmentId), { currentMonth: ym });
  await seedMonthEntries(compartmentId, ym, batch);
  await batch.commit();
}

/**
 * Totais do mês. Linhas com status "Ignorar" ficam de fora do gasto somado
 * (fixedActual/varActual) mas continuam contando no ideal, que é o orçamento
 * planejado; o valor delas segue visível na tela, marcado como ignorado.
 */
export function computeTotals(
  fixedEntries: FixedEntry[],
  categoryEntries: CategoryEntry[],
  expenses: VariableExpense[],
): MonthTotals {
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
 * (gastos fixos e categorias são mantidos).
 *
 * Pré-condição (validada na UI e aqui): nenhuma linha com status "Pendente".
 */
export async function closeMonth(
  compartmentId: string,
  ym: string,
  fixedEntries: FixedEntry[],
  categoryEntries: CategoryEntry[],
  expenses: VariableExpense[],
): Promise<string> {
  const pending = [...fixedEntries, ...categoryEntries].filter((e) => e.status === 'Pendente');
  if (pending.length > 0) {
    throw new Error(`Ainda há itens pendentes: ${pending.map((p) => p.name).join(', ')}`);
  }

  const totals = computeTotals(fixedEntries, categoryEntries, expenses);
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

/** Lista os meses existentes (mais recentes primeiro) para estatísticas. */
export async function listMonths(compartmentId: string): Promise<MonthDoc[]> {
  // Ordenação no cliente: orderBy('__name__', 'desc') não é suportado em
  // key scans descendentes e a quantidade de meses é pequena.
  const snap = await getDocs(collection(db, 'compartments', compartmentId, 'months'));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MonthDoc, 'id'>) }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Carrega os lançamentos variáveis de um mês (para estatísticas). */
export async function fetchExpenses(
  compartmentId: string,
  ym: string,
): Promise<VariableExpense[]> {
  const snap = await getDocs(expensesCol(compartmentId, ym));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VariableExpense, 'id'>) }));
}
