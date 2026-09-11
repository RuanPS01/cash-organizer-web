export const ENTRY_STATUSES = [
  'Pendente',
  'Parcialmente pago',
  'Agendado/Automático',
  'Pago',
  'Sem gasto',
  'Não disponível ainda',
  'Ignorar',
] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Status que tira a linha da soma do gasto do mês (o ideal continua valendo). */
export const IGNORED_STATUS: EntryStatus = 'Ignorar';

/**
 * Classe de cor de cada status. Fica junto de ENTRY_STATUSES para que status
 * novo e cor andem no mesmo lugar: a aba Pagamento e o histórico do mês leem
 * daqui, e as classes `.st-*` estão no `styles.css`.
 */
export const STATUS_CLASS: Record<EntryStatus, string> = {
  Pendente: 'st-pending',
  'Parcialmente pago': 'st-partial',
  'Agendado/Automático': 'st-scheduled',
  Pago: 'st-paid',
  'Sem gasto': 'st-none',
  'Não disponível ainda': 'st-unavailable',
  Ignorar: 'st-ignored',
};

/** Todos os valores monetários são armazenados em centavos (inteiro). */
export interface Compartment {
  id: string;
  name: string;
  passwordHash: string;
  /** Mês corrente do compartimento no formato YYYY-MM (avança via "virar mês"). */
  currentMonth: string;
  /**
   * Categoria escolhida no card de acompanhamento da aba Adicionar. Fica no
   * compartimento, e não no dispositivo, para a escolha valer em qualquer
   * aparelho que abrir o mesmo compartimento.
   */
  weekCategoryId?: string | null;
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
   * Origem do gasto (de onde o dinheiro sai), do mesmo cadastro usado pelos
   * lançamentos variáveis. `null` quando o gasto fixo não tem origem.
   */
  originId?: string | null;
  /** Denormalizado, mantém a listagem legível se a origem for renomeada. */
  originName?: string;
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
  /**
   * Categoria padrão: pré-selecionada ao adicionar gasto e não removível.
   * "Avulso" nasce como padrão, mas o usuário pode transferir o papel para
   * outra categoria (só existe uma padrão por compartimento).
   */
  isDefault: boolean;
  /** Posição na listagem/chips (menor primeiro; ausente usa createdAt). */
  sortOrder?: number;
  active: boolean;
  createdAt: number;
}

/**
 * Ícones disponíveis para a origem do gasto. A chave é gravada no Firestore;
 * o desenho correspondente do lucide-react fica em `components/OriginIcon`,
 * para que trocar o desenho não exija migrar dado gravado.
 */
export const ORIGIN_ICONS = [
  'pix',
  'transfer',
  'card',
  'cash',
  'investment',
  'autodebit',
  'boleto',
] as const;

export type OriginIconKey = (typeof ORIGIN_ICONS)[number];

/**
 * Tons do glifo da origem. São a única exceção ao ouro na identidade e
 * existem para diferenciar cartões de bancos diferentes; a cor real de cada
 * chave está no `styles.css` (classes `.oc-*`).
 */
export const ORIGIN_COLORS = [
  'gold',
  'silver',
  'graphite',
  'copper',
  'violet',
  'teal',
  'terracota',
] as const;

export type OriginColorKey = (typeof ORIGIN_COLORS)[number];

/**
 * Origem do gasto (forma de pagamento): o segundo eixo de classificação do
 * lançamento, ao lado da categoria. Exemplos: "Cartão C6 (Crédito)",
 * "Pix ou Transf.", "Cartão Nu".
 */
export interface Origin {
  id: string;
  name: string;
  icon: OriginIconKey;
  color: OriginColorKey;
  /** Origem padrão: pré-selecionada ao adicionar gasto (só uma por compartimento). */
  isDefault: boolean;
  /** Posição na listagem/chips (menor primeiro; ausente usa createdAt). */
  sortOrder?: number;
  active: boolean;
  createdAt: number;
}

export interface CategoryTotal {
  name: string;
  ideal: number;
  actual: number;
  /** Categoria com status "Ignorar": o gasto dela fica fora do total do mês. */
  ignored?: boolean;
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
  /**
   * Semana corrente do mês, de 1 a 4. Quem manda é o usuário: o mês nasce na
   * semana 1 e só avança no botão "Virar semana". Mês sem o campo (criado
   * antes disso) vale como semana 1.
   */
  currentWeek?: number;
  /** Quando a semana foi virada, para não sugerir a virada duas vezes no mesmo dia. */
  weekChangedAt?: number;
  /** Preenchido ao fechar o mês, para estatísticas baratas. */
  totals?: MonthTotals;
}

/** Semanas de um mês: o app trabalha sempre com quatro. */
export const MONTH_WEEKS = 4;

/** Linha de gasto fixo dentro de um mês (snapshot do cadastro). */
export interface FixedEntry {
  id: string;
  name: string;
  idealAmount: number;
  amount: number;
  status: EntryStatus;
  description?: string;
  /** Origem copiada do cadastro; null quando o gasto fixo não tem origem. */
  originId?: string | null;
  originName?: string;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
}

/**
 * Linha de origem do gasto dentro de um mês: é por ela que a aba Pagamento
 * acompanha o que já foi pago em cada forma de pagamento. Não tem valor
 * próprio, porque o valor é a soma do que saiu daquela origem no mês.
 */
export interface OriginEntry {
  id: string;
  name: string;
  status: EntryStatus;
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
  /** Semana do mês (1 a 4) em que o lançamento foi feito, copiada do mês. */
  week: number;
  /** Origem escolhida no lançamento; null quando não havia origem cadastrada. */
  originId?: string | null;
  /** Denormalizado, mantém o histórico legível se a origem for renomeada. */
  originName?: string;
}

export interface Session {
  compartmentId: string;
  name: string;
}
