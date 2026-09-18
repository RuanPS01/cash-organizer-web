import { collection, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { hashPassword } from '../utils/crypto';
import { isMonthOpen, monthRef } from './months';
import { monthKey } from '../utils/dates';
import type { AddStatsTab, Compartment } from '../types';

/** Normaliza o nome do compartimento para usar como id do documento. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function compartmentRef(id: string) {
  return doc(db, 'compartments', id);
}

export async function fetchCompartment(id: string): Promise<Compartment | null> {
  const snap = await getDoc(compartmentRef(id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Compartment, 'id'>) };
}

export type OpenResult =
  | { kind: 'ok'; compartment: Compartment }
  | { kind: 'not-found' }
  | { kind: 'wrong-password' };

/** Tenta abrir um compartimento existente validando a senha. */
export async function openCompartment(name: string, password: string): Promise<OpenResult> {
  const id = slugify(name);
  const compartment = await fetchCompartment(id);
  if (!compartment) return { kind: 'not-found' };
  const hash = await hashPassword(id, password);
  if (hash !== compartment.passwordHash) return { kind: 'wrong-password' };
  return { kind: 'ok', compartment };
}

/**
 * Preferências de leitura do card de estatísticas da aba Adicionar: a
 * categoria e a origem acompanhadas e a aba aberta. Ficam no compartimento, e
 * não no dispositivo, para a escolha valer em qualquer aparelho que abrir o
 * mesmo compartimento.
 */
// Declarado com `type` e não `interface` de propósito: o SDK exige um payload
// com assinatura de índice, e só o alias de tipo ganha a implícita.
export type ViewPrefs = {
  weekCategoryId: string | null;
  weekOriginId: string | null;
  addStatsTab: AddStatsTab;
};

export async function setViewPrefs(
  compartmentId: string,
  patch: Partial<ViewPrefs>,
): Promise<void> {
  await updateDoc(compartmentRef(compartmentId), patch);
}

/**
 * Renda mensal líquida do compartimento, em centavos. Grava no cadastro (que
 * vale para os meses que ainda vão nascer) e reflete no mês corrente em
 * aberto, que é de onde o resumo do mês lê. Mês já fechado fica com a renda
 * que tinha: o restante dele não pode mudar depois do fechamento.
 */
export async function setMonthlyIncome(
  compartmentId: string,
  currentMonth: string,
  cents: number,
): Promise<void> {
  await updateDoc(compartmentRef(compartmentId), { monthlyIncome: cents });
  if (await isMonthOpen(compartmentId, currentMonth)) {
    await updateDoc(monthRef(compartmentId, currentMonth), { income: cents });
  }
}

/** Cria o compartimento junto com a categoria padrão "Avulso". */
export async function createCompartment(name: string, password: string): Promise<Compartment> {
  const id = slugify(name);
  const passwordHash = await hashPassword(id, password);
  const now = Date.now();
  const currentMonth = monthKey();

  const batch = writeBatch(db);
  const ref = compartmentRef(id);
  batch.set(ref, {
    name: name.trim(),
    passwordHash,
    currentMonth,
    // Renda ainda não informada: o resumo do mês compara o gasto com o ideal
    // planejado até o usuário preencher a renda na tela Gerenciar.
    monthlyIncome: 0,
    createdAt: now,
  });
  const avulsoRef = doc(collection(db, 'compartments', id, 'categories'));
  batch.set(avulsoRef, {
    name: 'Avulso',
    idealAmount: 0,
    isDefault: true,
    active: true,
    createdAt: now,
  });
  await batch.commit();

  return { id, name: name.trim(), passwordHash, currentMonth, monthlyIncome: 0, createdAt: now };
}
