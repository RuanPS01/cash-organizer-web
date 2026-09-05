import { addDoc, collection, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Origin, OriginColorKey, OriginIconKey } from '../types';

// ---------------------------------------------------------------------------
// Origens do gasto (cadastro do compartimento)
//
// A origem é o segundo eixo de classificação do lançamento variável, ao lado
// da categoria: diz de onde o dinheiro saiu ("Cartão C6", "Pix"). Fica em
// coleção própria porque o ciclo de vida é o do cadastro, não o do mês: a
// origem não gera linha de mês nem entra no cálculo de totais.
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

export async function addOrigin(compartmentId: string, input: OriginInput): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(originsCol(compartmentId), {
    name: input.name.trim(),
    icon: input.icon,
    color: input.color,
    isDefault: input.isDefault ?? false,
    sortOrder: now,
    active: true,
    createdAt: now,
  });
  return ref.id;
}

/** Grava nome, ícone e cor da origem (o papel de padrão não muda aqui). */
export async function saveOrigin(
  compartmentId: string,
  id: string,
  input: OriginInput,
): Promise<void> {
  await updateOrigin(compartmentId, id, {
    name: input.name.trim(),
    icon: input.icon,
    color: input.color,
  });
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
 */
export async function removeOrigin(compartmentId: string, id: string): Promise<void> {
  await updateOrigin(compartmentId, id, { active: false });
}
