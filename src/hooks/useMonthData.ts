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
import { plansCol } from '../services/plans';
import { compartmentRef } from '../services/compartments';
import { compartmentSecret } from '../services/session';
import { EMPTY_AI_CONFIG, aiSettingsRef, openAiSettings } from '../services/ai';
import type { AiConfig } from '../services/ai';
import type {
  Category,
  CategoryEntry,
  FixedEntry,
  FixedExpense,
  MonthDoc,
  Origin,
  OriginEntry,
  Plan,
  StoredAiSettings,
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

/**
 * Assina os cadastros de gastos fixos, categorias e origens do compartimento e
 * a renda mensal líquida, que é configuração do compartimento e não de um mês.
 * A renda vem por assinatura, e não da sessão guardada, para a tela Gerenciar
 * mostrar na hora o que foi salvo em outro aparelho.
 */
export function useConfig(compartmentId: string) {
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);

  useEffect(() => {
    const unsubs = [
      onSnapshot(compartmentRef(compartmentId), (snap) => {
        setMonthlyIncome((snap.data()?.monthlyIncome as number | undefined) ?? 0);
      }),
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

  return { fixedExpenses, categories, origins, monthlyIncome };
}

/**
 * Assina os planejamentos ativos do compartimento, do mais recente para o mais
 * antigo. Fica fora do `useConfig` de propósito: só a aba Planejamento usa os
 * planos, e as outras telas não precisam manter essa assinatura aberta.
 */
export function usePlans(compartmentId: string): { loading: boolean; plans: Plan[] } {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return onSnapshot(query(plansCol(compartmentId), orderBy('createdAt', 'desc')), (snap) => {
      setPlans(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Plan, 'id'>) }))
          .filter((p) => p.active),
      );
      setLoading(false);
    });
  }, [compartmentId]);

  return { loading, plans };
}

/**
 * Assina um documento de configuração com segredo e o entrega já aberto (as
 * chaves decifradas com a chave da sessão). A decifragem é assíncrona, então
 * a flag `cancelled` descarta o resultado de um snapshot antigo que termine
 * depois do novo.
 */
function useSecretSettings<S, C>(
  compartmentId: string,
  ref: ReturnType<typeof aiSettingsRef>,
  empty: C,
  open: (stored: S | null, secret: CryptoKey | null) => Promise<C>,
): { loading: boolean; config: C } {
  const [state, setState] = useState<{ loading: boolean; config: C }>({ loading: true, config: empty });
  useEffect(() => {
    let cancelled = false;
    let seq = 0;
    setState({ loading: true, config: empty });
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const mine = ++seq;
        const stored = snap.exists() ? (snap.data() as S) : null;
        open(stored, compartmentSecret(compartmentId)).then((config) => {
          if (!cancelled && mine === seq) setState({ loading: false, config });
        });
      },
      // Sem a regra liberada no Firestore a leitura falha: a tela segue como
      // se não houvesse configuração, em vez de ficar carregando para sempre.
      () => {
        if (!cancelled) setState({ loading: false, config: empty });
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
    // `ref`, `empty` e `open` mudam junto com o compartimento, que é a
    // dependência que importa: incluí-los recriaria a assinatura a cada render.
  }, [compartmentId]);
  return state;
}

/** Configuração de IA do compartimento, com as chaves já decifradas. */
export function useAiConfig(compartmentId: string): { loading: boolean; config: AiConfig } {
  return useSecretSettings<StoredAiSettings, AiConfig>(
    compartmentId,
    aiSettingsRef(compartmentId),
    EMPTY_AI_CONFIG,
    openAiSettings,
  );
}
