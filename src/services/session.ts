import { decryptText, deriveSecretKey, encryptText } from '../utils/crypto';
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
  secret = null;
}

/**
 * Chave dos segredos do compartimento aberto (chave de API da IA, senha do ZIP
 * da fatura), derivada da senha. Fica só em memória: some ao sair e é refeita
 * a cada login ou restauração de sessão, que são os dois momentos em que a
 * senha está em mãos.
 */
let secret: { compartmentId: string; key: CryptoKey } | null = null;

export async function unlockSecrets(compartmentId: string, password: string): Promise<void> {
  secret = { compartmentId, key: await deriveSecretKey(compartmentId, password) };
}

/** A chave dos segredos, ou null quando a sessão não a derivou (não deveria acontecer). */
export function compartmentSecret(compartmentId: string): CryptoKey | null {
  return secret?.compartmentId === compartmentId ? secret.key : null;
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
    await unlockSecrets(result.compartment.id, password);
    return result.compartment;
  } catch {
    clearSession();
    return null;
  }
}
