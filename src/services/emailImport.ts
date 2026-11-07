/**
 * Importação de fatura por email: caixas do Gmail conectadas por login do
 * Google e remetentes de fatura cadastrados (cada um ligado a uma origem do
 * gasto e, se o banco manda ZIP protegido, à senha dele).
 *
 * Sem servidor, quem fala com o Gmail é o navegador: o login usa o Google
 * Identity Services (script carregado sob demanda, sem dependência no
 * package.json), o token vale uma hora e fica só em memória, e a busca roda
 * quando o usuário toca em "Buscar". Escutar a caixa o tempo todo pediria um
 * servidor (Cloud Functions no plano Blaze). Ver docs/11-importacao-e-ia.md.
 */
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { openSecret, sealSecret } from '../utils/crypto';
import type { EmailMailbox, StoredEmailImportSettings } from '../types';

export function emailSettingsRef(compartmentId: string) {
  return doc(db, 'compartments', compartmentId, 'settings', 'emailImport');
}

/** Id do cliente OAuth do Google (tipo "Aplicativo da Web"). Sem ele, o email fica desligado. */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

export function emailImportAvailable(): boolean {
  return GOOGLE_CLIENT_ID.trim() !== '';
}

/** Só leitura: o app nunca envia, apaga nem marca email. */
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const DEFAULT_LOOKBACK_DAYS = 45;

/** Remetente com a senha do ZIP em claro (só em memória). */
export interface EmailSenderConfig {
  address: string;
  originId: string | null;
  originName: string;
  zipPassword: string;
}

export interface EmailConfig {
  mailboxes: EmailMailbox[];
  senders: EmailSenderConfig[];
  lookbackDays: number;
  /** Alguma senha gravada não abriu com a chave da sessão. */
  locked: boolean;
}

export const EMPTY_EMAIL_CONFIG: EmailConfig = {
  mailboxes: [],
  senders: [],
  lookbackDays: DEFAULT_LOOKBACK_DAYS,
  locked: false,
};

export async function openEmailSettings(
  stored: StoredEmailImportSettings | null,
  secret: CryptoKey | null,
): Promise<EmailConfig> {
  if (!stored) return EMPTY_EMAIL_CONFIG;
  let locked = false;
  const senders: EmailSenderConfig[] = [];
  for (const s of stored.senders ?? []) {
    let zipPassword = '';
    if (s.sealedZipPassword) {
      const opened = secret ? await openSecret(secret, s.sealedZipPassword) : null;
      if (opened === null) locked = true;
      else zipPassword = opened;
    }
    senders.push({ address: s.address, originId: s.originId ?? null, originName: s.originName ?? '', zipPassword });
  }
  return {
    mailboxes: stored.mailboxes ?? [],
    senders,
    lookbackDays: stored.lookbackDays || DEFAULT_LOOKBACK_DAYS,
    locked,
  };
}

/** Grava a configuração; a senha do ZIP vai cifrada como a chave de API. */
export async function saveEmailSettings(
  compartmentId: string,
  secret: CryptoKey,
  config: Omit<EmailConfig, 'locked'>,
): Promise<void> {
  const senders = await Promise.all(
    config.senders.map(async (s) => ({
      address: s.address.trim().toLowerCase(),
      originId: s.originId,
      originName: s.originName,
      sealedZipPassword: await sealSecret(secret, s.zipPassword),
    })),
  );
  await setDoc(emailSettingsRef(compartmentId), {
    mailboxes: config.mailboxes,
    senders,
    lookbackDays: Math.min(365, Math.max(1, Math.trunc(config.lookbackDays))),
    updatedAt: Date.now(),
  } satisfies StoredEmailImportSettings);
}

export async function removeEmailSettings(compartmentId: string): Promise<void> {
  await deleteDoc(emailSettingsRef(compartmentId));
}

// ---------------------------------------------------------------------------
// Login do Google (Google Identity Services)
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    login_hint?: string;
    prompt?: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }): TokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let gisLoading: Promise<GoogleOAuth2> | null = null;

function loadGis(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  gisLoading ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new Error('O login do Google não carregou.'));
    };
    script.onerror = () => {
      gisLoading = null;
      reject(new Error('Não foi possível carregar o login do Google. Verifique a conexão.'));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

// Tokens de acesso por caixa, só em memória: valem uma hora e somem ao
// recarregar. Gravar token no banco o deixaria legível por quem sabe o id do
// compartimento.
const tokens = new Map<string, { token: string; expiresAt: number }>();

function validToken(email: string): string | null {
  const t = tokens.get(email.toLowerCase());
  return t && t.expiresAt - 60_000 > Date.now() ? t.token : null;
}

export function mailboxConnected(email: string): boolean {
  return validToken(email) !== null;
}

/**
 * Abre o login do Google e devolve o token. Precisa ser chamado direto do
 * toque do usuário: fora de um gesto o navegador bloqueia a janela.
 */
async function requestToken(hint: string | null): Promise<string> {
  const oauth2 = await loadGis();
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GMAIL_SCOPE,
      ...(hint ? { login_hint: hint } : {}),
      prompt: hint ? '' : 'select_account',
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || 'O login do Google foi cancelado.'));
          return;
        }
        if (resp.scope && !resp.scope.includes(GMAIL_SCOPE)) {
          reject(new Error('A permissão de ler os emails não foi concedida.'));
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(
          new Error(
            err.type === 'popup_failed_to_open'
              ? 'O navegador bloqueou a janela do Google. Libere pop-ups para este site.'
              : 'O login do Google foi cancelado.',
          ),
        );
      },
    });
    client.requestAccessToken();
  });
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new GmailAuthError('O acesso ao Gmail expirou. Toque em buscar de novo.');
  if (res.status === 403) {
    throw new Error('O Gmail recusou o acesso. Confira se a API do Gmail está ativa no projeto do Google.');
  }
  if (!res.ok) throw new Error(`O Gmail respondeu com erro (HTTP ${res.status}).`);
  return res.json() as Promise<T>;
}

/** Token recusado: a caixa precisa de login de novo. */
export class GmailAuthError extends Error {}

/** Conecta uma caixa nova: login com escolha de conta e leitura do endereço. */
export async function connectMailbox(): Promise<string> {
  const token = await requestToken(null);
  const profile = await gmail<{ emailAddress: string }>(token, 'profile');
  const email = profile.emailAddress.toLowerCase();
  tokens.set(email, { token, expiresAt: Date.now() + 55 * 60_000 });
  return email;
}

// ---------------------------------------------------------------------------
// Busca das faturas
// ---------------------------------------------------------------------------

export interface FoundInvoice {
  /** Estável na tela: caixa, mensagem e anexo. */
  id: string;
  mailbox: string;
  filename: string;
  from: string;
  subject: string;
  /** ms do email. */
  date: number;
  /** Remetente cadastrado que casou com o "De" do email. */
  sender: EmailSenderConfig | null;
  bytes: Uint8Array;
}

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

function base64UrlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function attachmentsOf(part: GmailPart | undefined, out: GmailPart[] = []): GmailPart[] {
  if (!part) return out;
  if (part.filename && /\.(csv|zip)$/i.test(part.filename)) out.push(part);
  for (const p of part.parts ?? []) attachmentsOf(p, out);
  return out;
}

/** Remetente cadastrado contido no "De" do email (endereço completo ou domínio). */
export function matchSender(from: string, senders: EmailSenderConfig[]): EmailSenderConfig | null {
  const lower = from.toLowerCase();
  return senders.find((s) => s.address && lower.includes(s.address.toLowerCase())) ?? null;
}

// Mensagens por busca: uma fatura por mês e por banco cabe com folga.
const MAX_MESSAGES = 20;

/**
 * Busca na caixa os emails dos remetentes cadastrados com anexo CSV ou ZIP,
 * dentro da janela de dias configurada, e baixa os anexos. Sem token válido,
 * abre o login do Google para aquela caixa (chame direto do toque).
 */
export async function searchInvoices(mailbox: string, config: EmailConfig): Promise<FoundInvoice[]> {
  const senders = config.senders.filter((s) => s.address.trim());
  if (senders.length === 0) return [];
  let token = validToken(mailbox);
  if (!token) {
    token = await requestToken(mailbox);
    tokens.set(mailbox.toLowerCase(), { token, expiresAt: Date.now() + 55 * 60_000 });
  }
  try {
    const from = senders.map((s) => s.address.trim()).join(' OR ');
    const q = `from:(${from}) has:attachment (filename:csv OR filename:zip) newer_than:${config.lookbackDays}d`;
    const list = await gmail<{ messages?: { id: string }[] }>(
      token,
      `messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(q)}`,
    );
    const found: FoundInvoice[] = [];
    for (const { id } of list.messages ?? []) {
      const msg = await gmail<GmailMessage>(token, `messages/${id}?format=full`);
      const headers = msg.payload?.headers ?? [];
      const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value ?? '';
      const fromHeader = header('from');
      for (const part of attachmentsOf(msg.payload)) {
        let data = part.body?.data ?? '';
        if (!data && part.body?.attachmentId) {
          const att = await gmail<{ data: string }>(token, `messages/${id}/attachments/${part.body.attachmentId}`);
          data = att.data;
        }
        if (!data) continue;
        found.push({
          id: `${mailbox}|${id}|${part.filename}`,
          mailbox,
          filename: part.filename ?? 'anexo',
          from: fromHeader,
          subject: header('subject'),
          date: Number(msg.internalDate ?? Date.now()),
          sender: matchSender(fromHeader, senders),
          bytes: base64UrlToBytes(data),
        });
      }
    }
    return found.sort((a, b) => b.date - a.date);
  } catch (err) {
    if (err instanceof GmailAuthError) tokens.delete(mailbox.toLowerCase());
    throw err;
  }
}

/**
 * Carrega o script do login do Google antes do toque em "Buscar": a janela do
 * Google só abre dentro do gesto do usuário, e esperar o script baixar depois
 * do toque pode passar desse limite.
 */
export function preloadGoogleLogin(): void {
  if (emailImportAvailable()) loadGis().catch(() => undefined);
}
