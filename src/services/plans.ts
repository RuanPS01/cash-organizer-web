import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { addFixedExpense, removeFixedExpense, saveFixedExpense } from './expenses';
import { monthlyDepositOf, planMonthPosition } from '../utils/projection';
import type { FixedExpense, Plan } from '../types';

// ---------------------------------------------------------------------------
// Planejamentos financeiros (cadastro do compartimento)
//
// O plano é uma projeção, não um extrato: guarda só as entradas da simulação,
// e o resultado é recalculado na tela por `utils/projection`. O vínculo com o
// mês é o gasto fixo de planejamento, um gasto fixo comum com `planId` e uma
// parcela por mês do prazo, que é o que mostra quantos meses faltam.
// ---------------------------------------------------------------------------

export function plansCol(compartmentId: string) {
  return collection(db, 'compartments', compartmentId, 'plans');
}

/** Campos do plano que o formulário edita. */
export type PlanInput = Omit<Plan, 'id' | 'active' | 'createdAt'>;

function normalizePlanInput(input: PlanInput): PlanInput {
  return {
    ...input,
    name: input.name.trim(),
    // Cada tipo usa uma das duas entradas; a outra vai zerada para o documento
    // não carregar um número que não vale nada na conta.
    monthlyAmount: input.kind === 'accumulate' ? input.monthlyAmount : 0,
    targetAmount: input.kind === 'goal' ? input.targetAmount : 0,
  };
}

export async function addPlan(compartmentId: string, input: PlanInput): Promise<string> {
  const ref = await addDoc(plansCol(compartmentId), {
    ...normalizePlanInput(input),
    active: true,
    createdAt: Date.now(),
  } satisfies Omit<Plan, 'id'>);
  return ref.id;
}

/** O que aconteceu com o gasto fixo de planejamento ao salvar o plano. */
export type PlanFixedSync = 'none' | 'updated' | 'removed';

/**
 * Leva o resultado do plano para o gasto fixo de planejamento dele: nome, valor
 * mensal e parcelas (a do mês em aberto é a posição dele no prazo). Origem e
 * descrição ficam como estão, porque são escolha do usuário no gasto fixo, e
 * não do plano. Também serve para desfazer um ajuste feito à mão no valor do
 * gasto fixo, voltando ao valor planejado.
 *
 * Se o mês em aberto saiu do prazo (o início mudou para depois dele, ou o prazo
 * encurtou) ou o valor mensal zerou, o gasto fixo sai do mês: uma parcela fora
 * do plano seria uma conta que o próprio plano diz que não existe.
 */
export async function setPlanFixedExpense(
  compartmentId: string,
  currentMonth: string,
  planId: string,
  plan: PlanInput,
  linked: FixedExpense,
): Promise<Exclude<PlanFixedSync, 'none'>> {
  const position = planMonthPosition(plan, currentMonth);
  const deposit = monthlyDepositOf(plan);
  if (position.kind !== 'during' || deposit <= 0) {
    await removeFixedExpense(compartmentId, currentMonth, linked.id);
    return 'removed';
  }
  await saveFixedExpense(compartmentId, currentMonth, linked.id, {
    name: plan.name,
    amount: deposit,
    description: linked.description,
    originId: linked.originId,
    originName: linked.originName,
    installmentCurrent: position.index,
    installmentTotal: plan.durationMonths,
    planId,
  });
  return 'updated';
}

/**
 * Grava o plano e, quando ele está no mês como gasto fixo de planejamento,
 * reflete o resultado novo nele (`setPlanFixedExpense`).
 */
export async function savePlan(
  compartmentId: string,
  currentMonth: string,
  id: string,
  input: PlanInput,
  linked: FixedExpense | null,
): Promise<PlanFixedSync> {
  const data = normalizePlanInput(input);
  await updateDoc(doc(plansCol(compartmentId), id), data);
  if (!linked) return 'none';
  return setPlanFixedExpense(compartmentId, currentMonth, id, data, linked);
}

/**
 * Desativa o plano, como os demais cadastros, e tira do mês o gasto fixo de
 * planejamento dele: sem o plano, a parcela não teria mais de onde vir. Meses
 * fechados não mudam.
 */
export async function removePlan(
  compartmentId: string,
  currentMonth: string,
  id: string,
  linked: FixedExpense | null,
): Promise<void> {
  await updateDoc(doc(plansCol(compartmentId), id), { active: false });
  if (linked) await removeFixedExpense(compartmentId, currentMonth, linked.id);
}

/**
 * Inclui o valor mensal do plano no mês em aberto como gasto fixo de
 * planejamento: parcela N de M, com N sendo a posição do mês em aberto no
 * prazo. A partir daí ele é um gasto fixo como os outros, avança a parcela na
 * virada do mês e sai sozinho depois da última.
 */
export async function addPlanFixedExpense(
  compartmentId: string,
  currentMonth: string,
  plan: Plan,
  origin: { originId: string | null; originName: string },
): Promise<void> {
  const position = planMonthPosition(plan, currentMonth);
  if (position.kind !== 'during') {
    throw new Error('O mês em aberto está fora do prazo deste planejamento.');
  }
  const deposit = monthlyDepositOf(plan);
  if (deposit <= 0) throw new Error('Este planejamento não tem valor mensal a guardar.');
  await addFixedExpense(compartmentId, currentMonth, {
    name: plan.name,
    amount: deposit,
    description: '',
    originId: origin.originId,
    originName: origin.originName,
    installmentCurrent: position.index,
    installmentTotal: plan.durationMonths,
    planId: plan.id,
  });
}
