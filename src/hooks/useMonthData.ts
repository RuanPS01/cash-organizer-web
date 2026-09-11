import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import {
  categoryEntriesCol,
  expensesCol,
  fixedEntriesCol,
  monthRef,
  originEntriesCol,
} from '../services/months';
import { originsCol } from '../services/origins';
import type {
  Category,
  CategoryEntry,
  FixedEntry,
  FixedExpense,
  MonthDoc,
  Origin,
  OriginEntry,
  VariableExpense,
} from '../types';

export interface MonthData {
  loading: boolean;
  month: MonthDoc | null;
  fixedEntries: FixedEntry[];
  categoryEntries: CategoryEntry[];
  originEntries: OriginEntry[];
  expenses: VariableExpense[];
}

/** Assina (tempo real) o documento do mês e suas quatro subcoleções. */
export function useMonthData(compartmentId: string, ym: string): MonthData {
  const [month, setMonth] = useState<MonthDoc | null>(null);
  const [monthLoaded, setMonthLoaded] = useState(false);
  const [fixedEntries, setFixedEntries] = useState<FixedEntry[]>([]);
  const [categoryEntries, setCategoryEntries] = useState<CategoryEntry[]>([]);
  const [originEntries, setOriginEntries] = useState<OriginEntry[]>([]);
  const [expenses, setExpenses] = useState<VariableExpense[]>([]);

  useEffect(() => {
    setMonthLoaded(false);
    setMonth(null);
    setFixedEntries([]);
    setCategoryEntries([]);
    setOriginEntries([]);
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
      onSnapshot(query(originEntriesCol(compartmentId, ym), orderBy('name')), (snap) => {
        setOriginEntries(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OriginEntry, 'id'>) })),
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

  return { loading: !monthLoaded, month, fixedEntries, categoryEntries, originEntries, expenses };
}

/** Assina os cadastros de gastos fixos, categorias e origens do compartimento. */
export function useConfig(compartmentId: string) {
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);

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
      onSnapshot(query(originsCol(compartmentId), orderBy('createdAt')), (snap) => {
        setOrigins(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Origin, 'id'>) }))
            .filter((o) => o.active)
            .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt)),
        );
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [compartmentId]);

  return { fixedExpenses, categories, origins };
}
