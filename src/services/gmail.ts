/**
 * Caixa do Gmail: login do Google (Google Identity Services) e busca dos
 * anexos de fatura na API do Gmail, direto do navegador.
 *
 * O script do login é carregado sob demanda (sem dependência no
 * package.json), o token vale uma hora e fica só em memória, e a busca roda
 * quando o usuário toca em "Buscar". A configuração (caixas e remetentes) e a
 * escolha entre Gmail e Outlook ficam em `emailImport.ts`.
 * Ver docs/11-importacao-e-ia.md.
 */
import type { RawInvoice } from './emailImport';

/** Id do cliente OAuth do Google (tipo "Aplicativo da Web"). Sem ele, o Gmail fica desligado. */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

export function gmailAvailable(): boolean {
  return GOOGLE_CLIENT_ID.trim() !== '';
}

/** Só leitura: o app nunca envia, apaga nem marca email. */
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

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

/**
 * Carrega o script do login do Google antes do toque em "Buscar": a janela do
 * Google só abre dentro do gesto do usuário, e esperar o script baixar depois
 * do toque pode passar desse limite.
 */
export function preloadGoogleLogin(): void {
  if (gmailAvailable()) loadGis().catch(() => undefined);
}

// Tokens de acesso por caixa, só em memória: valem uma hora e somem ao
// recarregar. Gravar token no banco o deixaria legível por quem sabe o id do
// compartimento.
const tokens = new Map<string, { token: string; expiresAt: number }>();

function validToken(email: string): string | null {
  const t = tokens.get(email.toLowerCase());
  return t && t.expiresAt - 60_000 > Date.now() ? t.token : null;
}

export function gmailConnected(email: string): boolean {
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

/** Token recusado: a caixa precisa de login de novo. */
export class GmailAuthError extends Error {}

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

/** Conecta uma caixa nova: login com escolha de conta e leitura do endereço. */
export async function connectGmail(): Promise<string> {
  const token = await requestToken(null);
  const profile = await gmail<{ emailAddress: string }>(token, 'profile');
  const email = profile.emailAddress.toLowerCase();
  tokens.set(email, { token, expiresAt: Date.now() + 55 * 60_000 });
  return email;
}

// ---------------------------------------------------------------------------
// Busca das faturas
// ---------------------------------------------------------------------------

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

// Mensagens por busca: uma fatura por mês e por banco cabe com folga.
const MAX_MESSAGES = 20;

/**
 * Busca na caixa os emails dos remetentes informados com anexo CSV ou ZIP,
 * dentro da janela de dias, e baixa os anexos. O filtro de remetente vai na
 * própria busca do Gmail. Sem token válido, abre o login do Google para aquela
 * caixa: chame direto do toque, sem esperar nada antes.
 */
export async function searchGmail(
  mailbox: string,
  addresses: string[],
  lookbackDays: number,
): Promise<RawInvoice[]> {
  let token = validToken(mailbox);
  if (!token) {
    token = await requestToken(mailbox);
    tokens.set(mailbox.toLowerCase(), { token, expiresAt: Date.now() + 55 * 60_000 });
  }
  try {
    const q = `from:(${addresses.join(' OR ')}) has:attachment (filename:csv OR filename:zip) newer_than:${lookbackDays}d`;
    const list = await gmail<{ messages?: { id: string }[] }>(
      token,
      `messages?maxResults=${MAX_MESSAGES}&q=${encodeURIComponent(q)}`,
    );
    const found: RawInvoice[] = [];
    for (const { id } of list.messages ?? []) {
      const msg = await gmail<GmailMessage>(token, `messages/${id}?format=full`);
      const headers = msg.payload?.headers ?? [];
      const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value ?? '';
      for (const part of attachmentsOf(msg.payload)) {
        let data = part.body?.data ?? '';
        if (!data && part.body?.attachmentId) {
          const att = await gmail<{ data: string }>(token, `messages/${id}/attachments/${part.body.attachmentId}`);
          data = att.data;
        }
        if (!data) continue;
        found.push({
          messageId: id,
          filename: part.filename ?? 'anexo',
          from: header('from'),
          subject: header('subject'),
          date: Number(msg.internalDate ?? Date.now()),
          bytes: base64UrlToBytes(data),
        });
      }
    }
    return found;
  } catch (err) {
    if (err instanceof GmailAuthError) tokens.delete(mailbox.toLowerCase());
    throw err;
  }
}
