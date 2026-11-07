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

// ---------------------------------------------------------------------------
// Segredos do compartimento (chave de API da IA, senha do ZIP da fatura)
// ---------------------------------------------------------------------------

// Iterações do PBKDF2: caro o bastante para atrasar quem tenta adivinhar a
// senha a partir de um segredo gravado, barato o bastante para não pesar no
// login do celular (uma derivação por sessão).
const SECRET_ITERATIONS = 210_000;

/**
 * Deriva da senha do compartimento a chave AES-GCM que cifra os segredos
 * gravados no Firestore. O documento do compartimento é legível por quem sabe
 * o id dele (as regras não conhecem a senha), então segredo nenhum pode ir em
 * claro: com esta chave, só quem tem a senha consegue abrir. Não é a mesma
 * chave do dispositivo (que cifra a sessão local) porque precisa valer em
 * qualquer aparelho que entrar no compartimento.
 */
export async function deriveSecretKey(compartmentId: string, password: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(`cash-organizer:${compartmentId}:segredos`),
      iterations: SECRET_ITERATIONS,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const SEALED_PREFIX = 'v1.';

/** Cifra um segredo com a chave do compartimento. Vazio continua vazio. */
export async function sealSecret(key: CryptoKey, plain: string): Promise<string> {
  if (!plain) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), iv.length);
  return SEALED_PREFIX + bytesToBase64(out);
}

/** Abre o que `sealSecret` produziu. Devolve null se a chave não abrir. */
export async function openSecret(key: CryptoKey, sealed: string): Promise<string | null> {
  if (!sealed) return '';
  if (!sealed.startsWith(SEALED_PREFIX)) return null;
  try {
    const bytes = base64ToBytes(sealed.slice(SEALED_PREFIX.length));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
