import { addMonthsKey, monthsBetween } from './dates';
import type { Plan } from '../types';

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

/** Um mês da projeção. Todos os valores em centavos. */
export interface ProjectionMonth {
  /** Posição no plano, de 1 ao prazo. */
  index: number;
  ym: string;
  deposit: number;
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
}

/**
 * Projeção mês a mês do plano. O rendimento de cada mês é a diferença entre os
 * saldos arredondados, e não o juro arredondado sozinho: assim a coluna fecha
 * exatamente (saldo anterior mais depósito mais rendimento igual ao saldo).
 */
export function projectPlan(p: PlanParams): Projection {
  const n = clampMonths(p.durationMonths);
  const annualRate = annualRateOf(p);
  const i = monthlyRateOf(annualRate);
  const deposit = monthlyDepositOf(p);

  const months: ProjectionMonth[] = [];
  let saldo = p.initialAmount;
  let anterior = p.initialAmount;
  let depositado = p.initialAmount;
  for (let k = 1; k <= n; k++) {
    saldo = saldo * (1 + i) + deposit;
    depositado += deposit;
    const balance = Math.round(saldo);
    months.push({
      index: k,
      ym: addMonthsKey(p.startMonth, k - 1),
      deposit,
      interest: balance - anterior - deposit,
      deposited: depositado,
      balance,
    });
    anterior = balance;
  }

  const grossBalance = Math.round(saldo);
  let tax = 0;
  if (p.incomeTax && i > 0) {
    // O imposto incide sobre o ganho de cada depósito, com a alíquota do tempo
    // que aquele depósito ficou aplicado até o resgate no fim do prazo.
    const ganho = (valor: number, meses: number) =>
      valor * ((1 + i) ** meses - 1) * incomeTaxRate(meses);
    let total = ganho(p.initialAmount, n);
    for (let k = 1; k <= n; k++) total += ganho(deposit, n - k);
    tax = Math.round(total);
  }

  return {
    monthlyDeposit: deposit,
    annualRate,
    months,
    deposited: depositado,
    grossBalance,
    interest: grossBalance - depositado,
    tax,
    netBalance: grossBalance - tax,
    goalReached: p.kind === 'goal' && deposit === 0,
  };
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

/**
 * Posição de um mês do app dentro do plano: `before` antes do primeiro mês,
 * `after` depois do último e, durante, o índice de 1 ao prazo (que é a parcela
 * do gasto fixo de planejamento naquele mês).
 */
export function planMonthPosition(
  p: Pick<PlanParams, 'startMonth' | 'durationMonths'>,
  ym: string,
): { kind: 'before' } | { kind: 'after' } | { kind: 'during'; index: number } {
  const index = monthsBetween(p.startMonth, ym) + 1;
  if (index < 1) return { kind: 'before' };
  if (index > clampMonths(p.durationMonths)) return { kind: 'after' };
  return { kind: 'during', index };
}
