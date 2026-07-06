/**
 * Utilitários de criptografia (Web Crypto API).
 *
 * - A senha do compartimento nunca é salva em texto puro: no Firestore fica
 *   apenas o hash SHA-256 (com o id do compartimento como sal) e no
 *   localStorage fica cifrada com AES-GCM usando uma chave gerada no
 *   dispositivo.
 */

const DEVICE_KEY_STORAGE = 'cash-organizer.device-key';

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPassword(compartmentId: string, password: string): Promise<string> {
  return sha256Hex(`${compartmentId}::${password}`);
}

async function getDeviceKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (stored) {
    try {
      const jwk = JSON.parse(stored) as JsonWebKey;
      return await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, [
        'encrypt',
        'decrypt',
      ]);
    } catch {
      // chave corrompida: gera outra abaixo
    }
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  localStorage.setItem(DEVICE_KEY_STORAGE, JSON.stringify(jwk));
  return key;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Cifra um texto com AES-GCM; retorna base64(iv + ciphertext). */
export async function encryptText(plain: string): Promise<string> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), iv.length);
  return bytesToBase64(out);
}

/** Decifra o formato produzido por encryptText. Retorna null se inválido. */
export async function decryptText(encoded: string): Promise<string | null> {
  try {
    const key = await getDeviceKey();
    const bytes = base64ToBytes(encoded);
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
