export const ENTRY_STATUSES = [
  'Pendente',
  'Parcialmente pago',
  'Agendado/Automático',
  'Pago',
  'Sem gasto',
  'Não disponível ainda',
] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Todos os valores monetários são armazenados em centavos (inteiro). */
export interface Compartment {
  id: string;
  name: string;
  passwordHash: string;
  /** Mês corrente do compartimento no formato YYYY-MM (avança via "virar mês"). */
  currentMonth: string;
  createdAt: number;
}

export interface FixedExpense {
  id: string;
  name: string;
  /** Valor fixo mensal, em centavos. */
  amount: number;
  /** Gasto ideal; por padrão igual ao valor fixo. */
  idealAmount: number;
  /** Comentário/descrição livre. */
  description?: string;
  /**
   * Parcelamento opcional ("2 de 4"): a parcela atual incrementa a cada
   * virada de mês; ao passar da última, o gasto é desativado e sai dos
   * próximos meses.
   */
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
  active: boolean;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  /** Gasto ideal do mês para a categoria, em centavos. */
  idealAmount: number;
  /** "Avulso" é a categoria padrão e não pode ser removida. */
  isDefault: boolean;
  active: boolean;
  createdAt: number;
}

export interface CategoryTotal {
  name: string;
  ideal: number;
  actual: number;
}

export interface MonthTotals {
  fixedIdeal: number;
  fixedActual: number;
  varIdeal: number;
  varActual: number;
  byCategory: Record<string, CategoryTotal>;
}

export interface MonthDoc {
  id: string;
  status: 'open' | 'closed';
  closedAt?: number;
  /** Preenchido ao fechar o mês, para estatísticas baratas. */
  totals?: MonthTotals;
}

/** Linha de gasto fixo dentro de um mês (snapshot do cadastro). */
export interface FixedEntry {
  id: string;
  name: string;
  idealAmount: number;
  amount: number;
  status: EntryStatus;
  description?: string;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
}

/** Linha de categoria (gasto variável) dentro de um mês. */
export interface CategoryEntry {
  id: string;
  name: string;
  idealAmount: number;
  status: EntryStatus;
}

export interface VariableExpense {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  description: string;
  createdAt: number;
  /** Semana do mês, 1 a 4 (dias 29+ contam como semana 4). */
  week: number;
}

export interface Session {
  compartmentId: string;
  name: string;
}
