import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { nextMonthKey } from '../utils/dates';
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
 * Remove do mês em aberto as linhas cujos cadastros foram removidos
 * (gastos fixos desativados e categorias desativadas sem lançamentos no
 * mês). Corrige meses criados antes da remoção do cadastro.
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
  if (dirty) await batch.commit();
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

  const [fixed, categories] = await Promise.all([
    fetchActive<Omit<FixedExpense, 'id'>>(compartmentId, 'fixedExpenses'),
    fetchActive<Omit<Category, 'id'>>(compartmentId, 'categories'),
  ]);

  const batch = writeBatch(db);
  batch.set(ref, { status: 'open' } satisfies Omit<MonthDoc, 'id'>);
  for (const f of fixed) {
    batch.set(doc(fixedEntriesCol(compartmentId, ym), f.id), {
      name: f.name,
      amount: f.amount,
      idealAmount: f.idealAmount || f.amount,
      status: 'Pendente',
    } satisfies Omit<FixedEntry, 'id'>);
  }
  for (const c of categories) {
    batch.set(doc(categoryEntriesCol(compartmentId, ym), c.id), {
      name: c.name,
      idealAmount: c.idealAmount,
      status: 'Pendente',
    } satisfies Omit<CategoryEntry, 'id'>);
  }
  await batch.commit();
}

export function computeTotals(
  fixedEntries: FixedEntry[],
  categoryEntries: CategoryEntry[],
  expenses: VariableExpense[],
): MonthTotals {
  const byCategory: MonthTotals['byCategory'] = {};
  for (const c of categoryEntries) {
    byCategory[c.id] = { name: c.name, ideal: c.idealAmount, actual: 0 };
  }
  for (const e of expenses) {
    const cat = (byCategory[e.categoryId] ??= {
      name: e.categoryName,
      ideal: 0,
      actual: 0,
    });
    cat.actual += e.amount;
  }
  return {
    fixedIdeal: fixedEntries.reduce((s, f) => s + f.idealAmount, 0),
    fixedActual: fixedEntries.reduce((s, f) => s + f.amount, 0),
    varIdeal: categoryEntries.reduce((s, c) => s + c.idealAmount, 0),
    varActual: expenses.reduce((s, e) => s + e.amount, 0),
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

  await ensureMonth(compartmentId, next);
  return next;
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
