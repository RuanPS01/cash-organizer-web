import { decryptText, encryptText } from '../utils/crypto';
import { openCompartment } from './compartments';
import type { Compartment } from '../types';

const SESSION_STORAGE = 'cash-organizer.session';

interface StoredSession {
  compartmentId: string;
  name: string;
  /** Senha cifrada com AES-GCM (chave do dispositivo). */
  encryptedPassword: string;
}

export async function saveSession(name: string, password: string, compartmentId: string) {
  const encryptedPassword = await encryptText(password);
  const stored: StoredSession = { compartmentId, name, encryptedPassword };
  localStorage.setItem(SESSION_STORAGE, JSON.stringify(stored));
}

export function clearSession() {
  localStorage.removeItem(SESSION_STORAGE);
}

/**
 * Restaura a sessão salva: decifra a senha local e revalida contra o
 * Firestore. Retorna null (e limpa a sessão) se algo não bater.
 */
export async function restoreSession(): Promise<Compartment | null> {
  const raw = localStorage.getItem(SESSION_STORAGE);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredSession;
    const password = await decryptText(stored.encryptedPassword);
    if (!password) {
      clearSession();
      return null;
    }
    const result = await openCompartment(stored.name, password);
    if (result.kind !== 'ok') {
      clearSession();
      return null;
    }
    return result.compartment;
  } catch {
    clearSession();
    return null;
  }
}
