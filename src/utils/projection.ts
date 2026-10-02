import { addMonthsKey, monthsBetween } from './dates';
import type { Plan, PlanMonthRecord } from '../types';

/**
 * Cálculo dos planejamentos financeiros: projeção mês a mês do que se guarda,
 * com rendimento opcional de renda fixa e imposto de renda opcional no resgate.
 *
 * Entradas e saídas são inteiros em centavos, como todo dinheiro do app. O
 * float existe só dentro da conta de juros compostos, que não tem como ser
 * feita em inteiros; cada valor exibido sai dela arredondado para o centavo.
 */

/** Parâmetros que a projeção usa; é o plano sem os campos de cadastro. */
export type PlanParams = Pick<
  Plan,
  | 'kind'
  | 'monthlyAmount'
  | 'targetAmount'
  | 'initialAmount'
  | 'durationMonths'
  | 'startMonth'
  | 'rateMode'
  | 'annualRate'
  | 'cdiRate'
  | 'cdiPercent'
  | 'incomeTax'
>;

/** Prazo máximo de um plano: 50 anos. As regras do Firestore usam o mesmo teto. */
export const MAX_PLAN_MONTHS = 600;

/** Teto de taxa digitada: 999,99%, em centésimos de ponto percentual. */
const MAX_RATE = 99_999;

/** Dias úteis por ano na convenção do CDI. */
const BUSINESS_DAYS = 252;

const rateFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata uma taxa em centésimos de ponto percentual: 1065 vira "10,65%". */
export function formatRate(hundredths: number): string {
  return `${rateFormatter.format(hundredths / 100)}%`;
}

/**
 * Lê a taxa digitada pelos dígitos, do mesmo jeito que o valor em dinheiro:
 * "1065" vira 10,65%. Mantém a digitação igual à dos campos de valor do app.
 */
export function digitsToRate(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits ? Math.min(Number(digits), MAX_RATE) : 0;
}

/**
 * Taxa efetiva ao ano, em fração (0,1065 para 10,65%).
 *
 * No modo CDI o percentual incide sobre a taxa diária, que é como o CDB
 * pós-fixado rende de verdade: 110% do CDI é 110% de cada dia útil, e não o
 * CDI anual vezes 1,1. A diferença é pequena, mas cresce com o prazo.
 */
export function annualRateOf(p: Pick<PlanParams, 'rateMode' | 'annualRate' | 'cdiRate' | 'cdiPercent'>): number {
  if (p.rateMode === 'annual') return p.annualRate / 10_000;
  if (p.rateMode === 'cdi') {
    const cdi = p.cdiRate / 10_000;
    const percentual = p.cdiPercent / 10_000;
    const diaria = (1 + cdi) ** (1 / BUSINESS_DAYS) - 1;
    return (1 + diaria * percentual) ** BUSINESS_DAYS - 1;
  }
  return 0;
}

/** Taxa mensal equivalente a uma taxa efetiva anual (juros compostos). */
export function monthlyRateOf(annual: number): number {
  return (1 + annual) ** (1 / 12) - 1;
}

/**
 * Alíquota da tabela regressiva de renda fixa pelo tempo aplicado. O prazo é
 * contado em meses de 30 dias: até 6 meses (180 dias) 22,5%, até 12 (360
 * dias) 20%, até 24 (720 dias) 17,5% e acima disso 15%.
 */
export function incomeTaxRate(monthsHeld: number): number {
  if (monthsHeld <= 6) return 0.225;
  if (monthsHeld <= 12) return 0.2;
  if (monthsHeld <= 24) return 0.175;
  return 0.15;
}

/**
 * Quanto 1 centavo aplicado vale no resgate depois de `months` meses, já
 * descontado o imposto sobre o ganho quando `incomeTax` está ligado. Cada
 * depósito tem o próprio prazo, e é por isso que o imposto é calculado por
 * depósito, e não sobre o saldo final de uma vez.
 */
function netFactor(months: number, monthlyRate: number, incomeTax: boolean): number {
  const bruto = (1 + monthlyRate) ** months;
  return incomeTax ? bruto - incomeTaxRate(months) * (bruto - 1) : bruto;
}

function clampMonths(months: number): number {
  return Math.min(MAX_PLAN_MONTHS, Math.max(1, Math.trunc(months) || 1));
}

/**
 * Valor mensal do plano, em centavos. No `accumulate` é o próprio valor
 * digitado. No `goal` é o menor depósito que, somado ao valor inicial e ao
 * rendimento, chega à meta no último mês: arredondado para cima, porque um
 * centavo a menos por mês deixaria a meta para trás. Zero quando o valor
 * inicial sozinho já chega lá.
 *
 * Os depósitos são feitos no fim de cada mês (o primeiro rende a partir do
 * segundo mês): é a hipótese conservadora, e é a que bate com o gasto fixo,
 * que sai ao longo do mês.
 */
export function monthlyDepositOf(p: PlanParams): number {
  if (p.kind === 'accumulate') return p.monthlyAmount;
  const n = clampMonths(p.durationMonths);
  const i = monthlyRateOf(annualRateOf(p));
  const falta = p.targetAmount - p.initialAmount * netFactor(n, i, p.incomeTax);
  if (falta <= 0) return 0;
  let fatores = 0;
  for (let k = 1; k <= n; k++) fatores += netFactor(n - k, i, p.incomeTax);
  // A folga tira o ruído do float: 500,00 calculado como 500,0000001 não pode
  // virar 500,01.
  return Math.ceil(falta / fatores - 1e-6);
}

/**
 * Situação de um mês do plano:
 * - `planned`: mês que ainda vai acontecer, com o depósito planejado;
 * - `assumed`: mês antes de o plano entrar nos gastos fixos, contado como feito;
 * - `paid`: mês fechado em que o depósito saiu inteiro;
 * - `open`: mês em aberto, ainda com o depósito inteiro previsto;
 * - `partial`: pago em parte (fechado ou em aberto);
 * - `skipped`: pulado, nada guardado (ignorado, sem gasto ou fora do mês).
 */
export type PlanMonthState = 'planned' | 'assumed' | 'paid' | 'open' | 'partial' | 'skipped';

/** Um mês da projeção. Todos os valores em centavos. */
export interface ProjectionMonth {
  /** Posição no plano, de 1 ao prazo. */
  index: number;
  ym: string;
  /** Depósito considerado na conta (o feito, nos meses que já aconteceram). */
  deposit: number;
  /** Depósito planejado; maior que `deposit` no mês pulado ou pago em parte. */
  planned: number;
  state: PlanMonthState;
  /** Mês depois do prazo original, acrescentado para repor o que faltou. */
  extra: boolean;
  /** Rendimento bruto do mês. */
  interest: number;
  /** Total depositado até aqui, com o valor inicial. */
  deposited: number;
  /** Saldo bruto no fim do mês. */
  balance: number;
}

export interface Projection {
  monthlyDeposit: number;
  /** Taxa efetiva ao ano, em fração; zero sem rendimento. */
  annualRate: number;
  months: ProjectionMonth[];
  /** Total depositado no prazo, com o valor inicial. */
  deposited: number;
  grossBalance: number;
  /** Rendimento bruto do prazo inteiro. */
  interest: number;
  /** Imposto de renda no resgate (zero quando o desconto está desligado). */
  tax: number;
  netBalance: number;
  /** Meta (`goal`) já coberta pelo valor inicial, sem depósito nenhum. */
  goalReached: boolean;
  /** Último mês do prazo original, antes de qualquer prorrogação. */
  originalEnd: string;
  /** Meses acrescentados ao fim para repor o que foi pulado ou pago em parte. */
  extraMonths: number;
  /** Meses pulados ou pagos em parte. */
  shortMonths: number;
}

/** Mês de entrada da conta: o que foi (ou vai ser) depositado e em que situação. */
type MonthInput = Pick<ProjectionMonth, 'ym' | 'deposit' | 'planned' | 'state' | 'extra'>;

/**
 * Saldos, rendimento e imposto a partir da lista de depósitos, um por mês. O
 * rendimento de cada mês é a diferença entre os saldos arredondados, e não o
 * juro arredondado sozinho: assim a coluna fecha exatamente (saldo anterior
 * mais depósito mais rendimento igual ao saldo).
 */
function buildProjection(
  p: PlanParams,
  entradas: MonthInput[],
  monthlyDeposit: number,
  annualRate: number,
): Projection {
  const i = monthlyRateOf(annualRate);
  const n = clampMonths(p.durationMonths);
  const months: ProjectionMonth[] = [];
  let saldo = p.initialAmount;
  let anterior = p.initialAmount;
  let depositado = p.initialAmount;
  entradas.forEach((e, k) => {
    saldo = saldo * (1 + i) + e.deposit;
    depositado += e.deposit;
    const balance = Math.round(saldo);
    months.push({
      ...e,
      index: k + 1,
      interest: balance - anterior - e.deposit,
      deposited: depositado,
      balance,
    });
    anterior = balance;
  });

  const total = entradas.length;
  const grossBalance = Math.round(saldo);
  let tax = 0;
  if (p.incomeTax && i > 0) {
    // O imposto incide sobre o ganho de cada depósito, com a alíquota do tempo
    // que aquele depósito ficou aplicado até o resgate no fim do prazo.
    const ganho = (valor: number, meses: number) =>
      valor * ((1 + i) ** meses - 1) * incomeTaxRate(meses);
    let soma = ganho(p.initialAmount, total);
    entradas.forEach((e, k) => {
      soma += ganho(e.deposit, total - (k + 1));
    });
    tax = Math.round(soma);
  }

  return {
    monthlyDeposit,
    annualRate,
    months,
    deposited: depositado,
    grossBalance,
    interest: grossBalance - depositado,
    tax,
    netBalance: grossBalance - tax,
    goalReached: p.kind === 'goal' && monthlyDeposit === 0,
    originalEnd: addMonthsKey(p.startMonth, n - 1),
    extraMonths: Math.max(0, total - n),
    shortMonths: months.filter((m) => m.state === 'partial' || m.state === 'skipped').length,
  };
}

/** Projeção do plano como foi planejado: o mesmo depósito em todos os meses do prazo. */
export function projectPlan(p: PlanParams): Projection {
  const n = clampMonths(p.durationMonths);
  const deposit = monthlyDepositOf(p);
  const entradas: MonthInput[] = Array.from({ length: n }, (_, k) => ({
    ym: addMonthsKey(p.startMonth, k),
    deposit,
    planned: deposit,
    state: 'planned',
    extra: false,
  }));
  return buildProjection(p, entradas, deposit, annualRateOf(p));
}

/** O que o plano em curso sabe dos meses que já aconteceram. */
export interface PlanTrack {
  /** Mês em que o plano entrou nos gastos fixos. */
  trackedFrom: string;
  /** Meses fechados, gravados na virada do mês. */
  progress: Record<string, PlanMonthRecord>;
  /** Mês em aberto do app. */
  currentMonth: string;
  /**
   * O plano está nos gastos fixos. Fora deles (concluído) não há mês por vir,
   * e a conta para no último mês que aconteceu.
   */
  ongoing: boolean;
  /**
   * O mês em aberto quando o Pagamento já disse que ele ficou pulado ou pago em
   * parte. Ausente, o mês em aberto conta com o depósito planejado inteiro.
   */
  current?: PlanMonthRecord;
}

/**
 * Projeção do plano em curso: os meses que já aconteceram entram com o que foi
 * guardado de fato, e o que faltou (mês pulado ou pago em parte) vai para o fim,
 * prorrogando o prazo.
 *
 * - "Quanto vou juntar": o plano é guardar o valor planejado de cada mês do
 *   prazo. O que faltou vira meses extras no fim, com o valor mensal, e o último
 *   leva só o resto. Pular um mês acrescenta exatamente um mês.
 * - "Quanto guardar por mês": o plano é chegar à meta. Os meses extras seguem
 *   com o valor mensal até a meta ser alcançada, e o último leva só o que falta.
 *   Com rendimento, pular um mês pode custar mais de um mês, porque o depósito
 *   pulado também deixou de render.
 *
 * Sem nada pulado ou parcial, o resultado é o mesmo de `projectPlan`. O prazo
 * nunca encurta: os meses extras só existem para repor.
 */
export function projectPlanInProgress(p: PlanParams, track: PlanTrack): Projection {
  const n = clampMonths(p.durationMonths);
  const annualRate = annualRateOf(p);
  const i = monthlyRateOf(annualRate);
  const deposit = monthlyDepositOf(p);
  const atual = monthsBetween(p.startMonth, track.currentMonth) + 1;
  const emCurso = track.ongoing;

  // A conta não para antes do último mês que aconteceu de verdade.
  let ultimoReal = emCurso ? atual : 0;
  for (const ym of Object.keys(track.progress)) {
    ultimoReal = Math.max(ultimoReal, monthsBetween(p.startMonth, ym) + 1);
  }

  const entradas: MonthInput[] = [];
  // Valor líquido no resgate, no fim do mês `k`, de tudo depositado até ali.
  const liquidoEm = (k: number) => {
    let v = p.initialAmount * netFactor(k, i, p.incomeTax);
    entradas.forEach((e, j) => {
      v += e.deposit * netFactor(k - (j + 1), i, p.incomeTax);
    });
    return v;
  };

  let devido = 0;
  for (let k = 1; k <= n + MAX_PLAN_MONTHS; k++) {
    const ym = addMonthsKey(p.startMonth, k - 1);
    const extra = k > n;
    let planned = deposit;
    if (extra) {
      const falta =
        p.kind === 'accumulate' ? devido : Math.ceil(p.targetAmount - liquidoEm(k) - 1e-6);
      planned = Math.min(deposit, Math.max(0, falta));
    }

    const rec = track.progress[ym];
    let paid = planned;
    let state: PlanMonthState = 'planned';
    if (ym < track.trackedFrom) {
      state = 'assumed';
    } else if (rec) {
      planned = rec.planned;
      paid = rec.paid;
      state = paid >= planned ? 'paid' : paid > 0 ? 'partial' : 'skipped';
    } else if (k === atual && emCurso) {
      if (track.current) {
        planned = track.current.planned;
        paid = track.current.paid;
      }
      state = paid >= planned ? 'open' : paid > 0 ? 'partial' : 'skipped';
    } else if (k < atual) {
      // Mês que já fechou sem o plano nele: nada foi guardado.
      paid = 0;
      state = 'skipped';
    }

    entradas.push({ ym, deposit: paid, planned, state, extra });
    // No prazo original o que faltou entra na dívida; nos meses extras, o que
    // foi depositado a abate.
    devido += (extra ? 0 : planned) - paid;

    if (k < n || k < ultimoReal) continue;
    const cumprido =
      p.kind === 'accumulate' ? devido <= 0 : liquidoEm(k) >= p.targetAmount - 1e-6;
    if (cumprido || !emCurso || deposit <= 0) break;
  }

  return buildProjection(p, entradas, deposit, annualRate);
}

/** Prazo por extenso: "3 anos" quando foi digitado em anos e fecha a conta, senão em meses. */
export function formatDuration(p: Pick<PlanParams, 'durationMonths'> & { durationUnit?: string }): string {
  const meses = p.durationMonths;
  if (p.durationUnit === 'years' && meses % 12 === 0) {
    const anos = meses / 12;
    return anos === 1 ? '1 ano' : `${anos} anos`;
  }
  return meses === 1 ? '1 mês' : `${meses} meses`;
}

/** Rendimento do plano em uma linha: "10,65% ao ano", "110,00% do CDI" ou "Sem rendimento". */
export function formatPlanRate(
  p: Pick<PlanParams, 'rateMode' | 'annualRate' | 'cdiRate' | 'cdiPercent'>,
): string {
  if (p.rateMode === 'annual') return `${formatRate(p.annualRate)} ao ano`;
  if (p.rateMode === 'cdi') return `${formatRate(p.cdiPercent)} do CDI`;
  return 'Sem rendimento';
}

/**
 * Meses que faltam depois do mês da parcela: na parcela 3 de 12 faltam 9.
 * É o que identifica no mês quanto ainda resta do gasto fixo de planejamento.
 */
export function remainingMonthsLabel(current: number, total: number): string {
  const faltam = Math.max(0, total - current);
  if (faltam === 0) return 'último mês';
  return faltam === 1 ? 'falta 1 mês' : `faltam ${faltam} meses`;
}
