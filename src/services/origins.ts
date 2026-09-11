import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { expensesCol, fixedEntriesCol, isMonthOpen, originEntriesCol } from './months';
import type { EntryStatus, Origin, OriginColorKey, OriginEntry, OriginIconKey } from '../types';

// ---------------------------------------------------------------------------
// Origens do gasto (cadastro do compartimento)
//
// A origem diz de onde o dinheiro saiu ("Cartão C6", "Pix"): classifica o
// lançamento variável ao lado da categoria e acompanha o cadastro do gasto
// fixo. O cadastro fica em coleção própria, do compartimento; o que pertence
// ao mês é só o status, na linha `originEntries`, que a aba Pagamento usa para
// acompanhar o que já foi pago em cada origem.
// ---------------------------------------------------------------------------

export function originsCol(compartmentId: string) {
  return collection(db, 'compartments', compartmentId, 'origins');
}

export interface OriginInput {
  name: string;
  icon: OriginIconKey;
  color: OriginColorKey;
  /** Marca a origem como a pré-selecionada; usado na primeira origem criada. */
  isDefault?: boolean;
}

export async function addOrigin(
  compartmentId: string,
  currentMonth: string,
  input: OriginInput,
): Promise<string> {
  const now = Date.now();
  const name = input.name.trim();
  const ref = await addDoc(originsCol(compartmentId), {
    name,
    icon: input.icon,
    color: input.color,
    isDefault: input.isDefault ?? false,
    sortOrder: now,
    active: true,
    createdAt: now,
  });
  // Reflete no mês corrente, se ele estiver aberto: sem a linha, a origem nova
  // só apareceria na aba Pagamento na próxima abertura do app.
  if (await isMonthOpen(compartmentId, currentMonth)) {
    await setDoc(doc(originEntriesCol(compartmentId, currentMonth), ref.id), {
      name,
      status: 'Pendente' satisfies EntryStatus,
    } satisfies Omit<OriginEntry, 'id'>);
  }
  return ref.id;
}

/**
 * Grava nome, ícone e cor da origem (o papel de padrão não muda aqui) e leva o
 * nome novo para a linha do mês corrente em aberto.
 */
export async function saveOrigin(
  compartmentId: string,
  currentMonth: string,
  id: string,
  input: OriginInput,
): Promise<void> {
  const name = input.name.trim();
  await updateOrigin(compartmentId, id, {
    name,
    icon: input.icon,
    color: input.color,
  });
  if (await isMonthOpen(compartmentId, currentMonth)) {
    const entryRef = doc(originEntriesCol(compartmentId, currentMonth), id);
    const entry = await getDoc(entryRef);
    if (entry.exists()) await updateDoc(entryRef, { name });
  }
}

export async function updateOrigin(
  compartmentId: string,
  id: string,
  patch: Partial<{
    name: string;
    icon: OriginIconKey;
    color: OriginColorKey;
    active: boolean;
  }>,
): Promise<void> {
  await updateDoc(doc(originsCol(compartmentId), id), patch);
}

/**
 * Move a origem uma posição para cima ou para baixo, trocando a chave de
 * ordenação com a vizinha (a lista recebida já deve estar na ordem exibida).
 */
export async function moveOrigin(
  compartmentId: string,
  ordered: Origin[],
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  const index = ordered.findIndex((o) => o.id === id);
  const other = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || other < 0 || other >= ordered.length) return;

  const a = ordered[index];
  const b = ordered[other];
  const keyA = a.sortOrder ?? a.createdAt;
  const keyB = b.sortOrder ?? b.createdAt;

  const batch = writeBatch(db);
  batch.update(doc(originsCol(compartmentId), a.id), { sortOrder: keyB });
  batch.update(doc(originsCol(compartmentId), b.id), { sortOrder: keyA });
  await batch.commit();
}

/**
 * Transfere o papel de origem padrão (pré-selecionada ao adicionar gasto)
 * para a origem indicada; a padrão anterior vira uma origem comum.
 */
export async function setDefaultOrigin(
  compartmentId: string,
  origins: Origin[],
  id: string,
): Promise<void> {
  const batch = writeBatch(db);
  for (const o of origins) {
    const shouldBeDefault = o.id === id;
    if (o.isDefault !== shouldBeDefault) {
      batch.update(doc(originsCol(compartmentId), o.id), { isDefault: shouldBeDefault });
    }
  }
  await batch.commit();
}

/**
 * Desativa a origem. Os lançamentos que já a usaram continuam com o nome
 * gravado (`originName`), então o histórico segue legível; a origem apenas
 * some do seletor e dos filtros.
 *
 * A linha do mês em aberto some junto quando nada saiu dessa origem no mês:
 * uma linha "Pendente" de origem que o usuário não vê mais no cadastro
 * seguraria a virada do mês. Com gasto no mês, a linha fica até o mês virar,
 * para o status do que já saiu dela continuar valendo.
 */
export async function removeOrigin(
  compartmentId: string,
  currentMonth: string,
  id: string,
): Promise<void> {
  await updateOrigin(compartmentId, id, { active: false });
  if (!(await isMonthOpen(compartmentId, currentMonth))) return;
  const [emLancamentos, emFixos] = await Promise.all([
    getDocs(
      query(expensesCol(compartmentId, currentMonth), where('originId', '==', id), limit(1)),
    ),
    getDocs(
      query(fixedEntriesCol(compartmentId, currentMonth), where('originId', '==', id), limit(1)),
    ),
  ]);
  if (emLancamentos.empty && emFixos.empty) {
    await deleteDoc(doc(originEntriesCol(compartmentId, currentMonth), id));
  }
}
