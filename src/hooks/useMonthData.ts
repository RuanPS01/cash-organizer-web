import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import {
  categoryEntriesCol,
  expensesCol,
  fixedEntriesCol,
  monthRef,
} from '../services/months';
import type {
  Category,
  CategoryEntry,
  FixedEntry,
  FixedExpense,
  MonthDoc,
  VariableExpense,
} from '../types';

export interface MonthData {
  loading: boolean;
  month: MonthDoc | null;
  fixedEntries: FixedEntry[];
  categoryEntries: CategoryEntry[];
  expenses: VariableExpense[];
}

/** Assina (tempo real) o documento do mês e suas subcoleções. */
export function useMonthData(compartmentId: string, ym: string): MonthData {
  const [month, setMonth] = useState<MonthDoc | null>(null);
  const [monthLoaded, setMonthLoaded] = useState(false);
  const [fixedEntries, setFixedEntries] = useState<FixedEntry[]>([]);
  const [categoryEntries, setCategoryEntries] = useState<CategoryEntry[]>([]);
  const [expenses, setExpenses] = useState<VariableExpense[]>([]);

  useEffect(() => {
    setMonthLoaded(false);
    setMonth(null);
    setFixedEntries([]);
    setCategoryEntries([]);
    setExpenses([]);

    const unsubs = [
      onSnapshot(monthRef(compartmentId, ym), (snap) => {
        setMonth(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<MonthDoc, 'id'>) } : null);
        setMonthLoaded(true);
      }),
      onSnapshot(query(fixedEntriesCol(compartmentId, ym), orderBy('name')), (snap) => {
        setFixedEntries(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FixedEntry, 'id'>) })),
        );
      }),
      onSnapshot(query(categoryEntriesCol(compartmentId, ym), orderBy('name')), (snap) => {
        setCategoryEntries(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CategoryEntry, 'id'>) })),
        );
      }),
      onSnapshot(query(expensesCol(compartmentId, ym), orderBy('createdAt', 'desc')), (snap) => {
        setExpenses(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VariableExpense, 'id'>) })),
        );
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [compartmentId, ym]);

  return { loading: !monthLoaded, month, fixedEntries, categoryEntries, expenses };
}

/** Assina os cadastros de gastos fixos e categorias do compartimento. */
export function useConfig(compartmentId: string) {
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(
        query(collection(db, 'compartments', compartmentId, 'fixedExpenses'), orderBy('name')),
        (snap) => {
          setFixedExpenses(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<FixedExpense, 'id'>) }))
              .filter((f) => f.active),
          );
        },
      ),
      onSnapshot(
        query(collection(db, 'compartments', compartmentId, 'categories'), orderBy('createdAt')),
        (snap) => {
          setCategories(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) }))
              .filter((c) => c.active)
              .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt)),
          );
        },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [compartmentId]);

  return { fixedExpenses, categories };
}
