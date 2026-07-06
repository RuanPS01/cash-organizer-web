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
} from 'firebase/firestore';
import { db } from '../firebase';
import { weekOfMonth } from '../utils/dates';
import { categoryEntriesCol, expensesCol, fixedEntriesCol, monthRef } from './months';
import type { EntryStatus } from '../types';

// ---------------------------------------------------------------------------
// Lançamentos variáveis
// ---------------------------------------------------------------------------

export async function addVariableExpense(
  compartmentId: string,
  ym: string,
  input: { categoryId: string; categoryName: string; amount: number; description: string },
): Promise<void> {
  const now = new Date();
  await addDoc(expensesCol(compartmentId, ym), {
    ...input,
    description: input.description.trim(),
    createdAt: now.getTime(),
    week: weekOfMonth(now),
  });
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

export async function addFixedExpense(
  compartmentId: string,
  currentMonth: string,
  input: { name: string; amount: number; idealAmount?: number },
): Promise<void> {
  const idealAmount = input.idealAmount || input.amount;
  const ref = await addDoc(collection(db, 'compartments', compartmentId, 'fixedExpenses'), {
    name: input.name.trim(),
    amount: input.amount,
    idealAmount,
    active: true,
    createdAt: Date.now(),
  });
  // Reflete no mês corrente, se ele estiver aberto.
  const month = await getDoc(monthRef(compartmentId, currentMonth));
  if (month.exists() && month.data().status === 'open') {
    await setDoc(doc(fixedEntriesCol(compartmentId, currentMonth), ref.id), {
      name: input.name.trim(),
      amount: input.amount,
      idealAmount,
      status: 'Pendente' satisfies EntryStatus,
    });
  }
}

export async function updateFixedExpense(
  compartmentId: string,
  id: string,
  patch: Partial<{ name: string; amount: number; idealAmount: number; active: boolean }>,
): Promise<void> {
  await updateDoc(doc(db, 'compartments', compartmentId, 'fixedExpenses', id), patch);
}

async function isMonthOpen(compartmentId: string, ym: string): Promise<boolean> {
  const month = await getDoc(monthRef(compartmentId, ym));
  return month.exists() && month.data().status === 'open';
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
  const ref = await addDoc(collection(db, 'compartments', compartmentId, 'categories'), {
    name: input.name.trim(),
    idealAmount: input.idealAmount,
    isDefault: false,
    active: true,
    createdAt: Date.now(),
  });
  const month = await getDoc(monthRef(compartmentId, currentMonth));
  if (month.exists() && month.data().status === 'open') {
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

// ---------------------------------------------------------------------------
// Linhas do mês (status e valores)
// ---------------------------------------------------------------------------

export async function updateFixedEntry(
  compartmentId: string,
  ym: string,
  entryId: string,
  patch: Partial<{ amount: number; idealAmount: number; status: EntryStatus }>,
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
