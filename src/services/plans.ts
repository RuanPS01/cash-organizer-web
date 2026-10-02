import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { addFixedExpense, removeFixedExpense, saveFixedExpense } from './expenses';
import { fixedEntriesCol, projectPlanForMonth } from './months';
import { monthsBetween } from '../utils/dates';
import type { Projection } from '../utils/projection';
import type { FixedEntry, FixedExpense, Plan } from '../types';

// ---------------------------------------------------------------------------
// Planejamentos financeiros (cadastro do compartimento)
//
// O plano é uma projeção, não um extrato: guarda as entradas da simulação, e o
// resultado é recalculado na tela por `utils/projection`. Sozinho ele não mexe
// no mês. Só entra nos gastos quando o usuário o inclui como gasto fixo de
// planejamento, um gasto fixo com `planId` e uma parcela por mês do prazo; a
// partir daí ele fica em curso, e o que o Pagamento disser de cada mês (pago,
// pago em parte, pulado) volta para a projeção e para a contagem de parcelas.
//
// O gasto fixo de planejamento só muda por aqui: a tela Gerenciar e o
// histórico do mês o mostram sem edição, para ele nunca discordar do plano.
// ---------------------------------------------------------------------------

export function plansCol(compartmentId: string) {
  return collection(db, 'compartments', compartmentId, 'plans');
}

/** Campos do plano que o formulário edita. */
export type PlanInput = Omit<Plan, 'id' | 'active' | 'createdAt' | 'trackedFrom' | 'progress'>;

/** Acompanhamento do plano em curso, que só os serviços e a virada gravam. */
export type PlanTracking = Pick<Plan, 'trackedFrom' | 'progress'>;

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
    trackedFrom: null,
    progress: {},
    active: true,
    createdAt: Date.now(),
  } satisfies Omit<Plan, 'id'>);
  return ref.id;
}

/**
 * Onde o mês em aberto cai no plano: a parcela, o total de parcelas (o prazo,
 * já com os meses extras de um plano em curso) e o valor planejado do mês.
 * `null` quando o mês em aberto está fora do prazo.
 */
export function planMonthSchedule(
  projecao: Projection,
  startMonth: string,
  currentMonth: string,
): { index: number; total: number; planned: number } | null {
  const index = monthsBetween(startMonth, currentMonth) + 1;
  const mes = projecao.months[index - 1];
  if (index < 1 || !mes) return null;
  return { index, total: projecao.months.length, planned: mes.planned };
}

/** O que aconteceu com o gasto fixo de planejamento ao salvar o plano. */
export type PlanFixedSync = 'none' | 'updated' | 'removed';

async function fetchLine(
  compartmentId: string,
  currentMonth: string,
  fixedId: string,
): Promise<FixedEntry | null> {
  const snap = await getDoc(doc(fixedEntriesCol(compartmentId, currentMonth), fixedId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<FixedEntry, 'id'>) }) : null;
}

/**
 * Tira o gasto fixo de planejamento do mês em aberto e dos próximos e encerra o
 * acompanhamento: sem o gasto fixo o plano deixa de estar em curso e volta a
 * ser só o planejado, e o histórico dos meses dele é descartado. Meses
 * fechados não mudam.
 */
export async function removePlanFixedExpense(
  compartmentId: string,
  currentMonth: string,
  planId: string,
  fixedId: string,
): Promise<void> {
  await removeFixedExpense(compartmentId, currentMonth, fixedId);
  await updateDoc(doc(plansCol(compartmentId), planId), { trackedFrom: null, progress: {} });
}

/**
 * Leva o plano para o gasto fixo de planejamento dele: nome, valor do mês e
 * parcelas. A conta é a do plano em curso (`projectPlanForMonth`): um mês
 * pulado ou pago em parte, já no mês em aberto, aumenta o total de parcelas na
 * hora, e o selo da linha mostra os meses que faltam de verdade. Origem e
 * descrição ficam como estão, porque são escolha do usuário no gasto fixo.
 *
 * Se o mês em aberto saiu do prazo ou não há mais valor a guardar, o gasto
 * fixo sai do mês e o acompanhamento termina.
 */
export async function setPlanFixedExpense(
  compartmentId: string,
  currentMonth: string,
  planId: string,
  plan: PlanInput & PlanTracking,
  linked: FixedExpense,
): Promise<Exclude<PlanFixedSync, 'none'>> {
  const line = await fetchLine(compartmentId, currentMonth, linked.id);
  const projecao = projectPlanForMonth(plan, currentMonth, true, line);
  const agenda = planMonthSchedule(projecao, plan.startMonth, currentMonth);
  if (!agenda || agenda.planned <= 0) {
    await removePlanFixedExpense(compartmentId, currentMonth, planId, linked.id);
    return 'removed';
  }
  await saveFixedExpense(compartmentId, currentMonth, linked.id, {
    name: plan.name,
    amount: agenda.planned,
    description: linked.description,
    originId: linked.originId,
    originName: linked.originName,
    installmentCurrent: agenda.index,
    installmentTotal: agenda.total,
    planId,
  });
  // Plano incluído antes de o acompanhamento existir: passa a ser acompanhado
  // a partir de agora, o mesmo mês que a projeção já está usando.
  if (!plan.trackedFrom) {
    await updateDoc(doc(plansCol(compartmentId), planId), {
      trackedFrom: currentMonth,
      progress: plan.progress ?? {},
    });
  }
  return 'updated';
}

/**
 * Grava o plano e, quando ele está nos gastos fixos, reflete o resultado novo
 * no gasto fixo de planejamento (`setPlanFixedExpense`). O acompanhamento não
 * vem do formulário: ele é passado à parte para a conta continuar sabendo o
 * que já aconteceu.
 */
export async function savePlan(
  compartmentId: string,
  currentMonth: string,
  id: string,
  input: PlanInput,
  linked: FixedExpense | null,
  tracking: PlanTracking,
): Promise<PlanFixedSync> {
  const data = normalizePlanInput(input);
  await updateDoc(doc(plansCol(compartmentId), id), data);
  if (!linked) return 'none';
  return setPlanFixedExpense(compartmentId, currentMonth, id, { ...data, ...tracking }, linked);
}

/**
 * Atualiza os gastos fixos de planejamento depois de uma mudança na aba
 * Pagamento (status ou valor pago em parte), para a contagem de parcelas
 * acompanhar o plano em curso no mesmo instante. Recebe as linhas do mês; as
 * que não são de planejamento são ignoradas.
 */
export async function syncPlanFixedExpenses(
  compartmentId: string,
  currentMonth: string,
  entries: FixedEntry[],
): Promise<void> {
  for (const entry of entries) {
    if (!entry.planId) continue;
    const [planSnap, fixedSnap] = await Promise.all([
      getDoc(doc(plansCol(compartmentId), entry.planId)),
      getDoc(doc(db, 'compartments', compartmentId, 'fixedExpenses', entry.id)),
    ]);
    if (!planSnap.exists() || !fixedSnap.exists()) continue;
    const fixed = { id: fixedSnap.id, ...(fixedSnap.data() as Omit<FixedExpense, 'id'>) };
    if (!fixed.active) continue;
    await setPlanFixedExpense(
      compartmentId,
      currentMonth,
      entry.planId,
      planSnap.data() as Omit<Plan, 'id'>,
      fixed,
    );
  }
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
 * Inclui o valor mensal do plano nos gastos fixos, a partir do mês em aberto:
 * parcela N de M, com N sendo a posição do mês em aberto no prazo. É a única
 * forma de o plano mexer no mês. Daí em diante ele fica em curso: o mês em
 * aberto é o primeiro acompanhado, e os meses do plano antes dele contam como
 * guardados conforme o planejado.
 */
export async function addPlanFixedExpense(
  compartmentId: string,
  currentMonth: string,
  plan: Plan,
  origin: { originId: string | null; originName: string },
): Promise<void> {
  const tracking: PlanTracking = plan.trackedFrom
    ? { trackedFrom: plan.trackedFrom, progress: plan.progress ?? {} }
    : { trackedFrom: currentMonth, progress: {} };
  const projecao = projectPlanForMonth({ ...plan, ...tracking }, currentMonth, true, null);
  const agenda = planMonthSchedule(projecao, plan.startMonth, currentMonth);
  if (!agenda) throw new Error('O mês em aberto está fora do prazo deste planejamento.');
  if (agenda.planned <= 0) throw new Error('Este planejamento não tem valor mensal a guardar.');
  await addFixedExpense(compartmentId, currentMonth, {
    name: plan.name,
    amount: agenda.planned,
    description: '',
    originId: origin.originId,
    originName: origin.originName,
    installmentCurrent: agenda.index,
    installmentTotal: agenda.total,
    planId: plan.id,
  });
  if (!plan.trackedFrom) {
    await updateDoc(doc(plansCol(compartmentId), plan.id), tracking);
  }
}
