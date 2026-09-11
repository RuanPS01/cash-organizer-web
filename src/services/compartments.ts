import { collection, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { hashPassword } from '../utils/crypto';
import { monthKey } from '../utils/dates';
import type { Compartment } from '../types';

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
 * Guarda a categoria que o card de acompanhamento da aba Adicionar está
 * mostrando. Fica no compartimento, e não no dispositivo, para a escolha valer
 * em qualquer aparelho que abrir o mesmo compartimento.
 */
export async function setWeekCategory(
  compartmentId: string,
  categoryId: string | null,
): Promise<void> {
  await updateDoc(compartmentRef(compartmentId), { weekCategoryId: categoryId });
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

  return { id, name: name.trim(), passwordHash, currentMonth, createdAt: now };
}
