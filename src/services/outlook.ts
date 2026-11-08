/**
 * Caixa da Microsoft (Outlook, Hotmail, Live e Microsoft 365): login na
 * plataforma de identidade da Microsoft e busca dos anexos de fatura no
 * Microsoft Graph, direto do navegador.
 *
 * O login é o fluxo de código de autorização com PKCE, escrito à mão em vez da
 * biblioteca da Microsoft (o projeto evita dependência nova): a janela de
 * login abre no toque, volta para `auth-redirect.html` com o código no
 * fragmento da URL, e o código vira token na API de token da Microsoft, que
 * aceita a chamada do navegador para app registrado como "aplicativo de página
 * única". Os tokens ficam só em memória: o de acesso vale uma hora, e o de
 * renovação (24 horas para esse tipo de app) evita abrir a janela de novo
 * enquanto a aba está aberta. Ver docs/11-importacao-e-ia.md.
 */
import type { RawInvoice } from './emailImport';

/** Id do aplicativo registrado no Microsoft Entra. Sem ele, o Outlook fica desligado. */
export const MICROSOFT_CLIENT_ID =
  (import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined) ?? '';

export function outlookAvailable(): boolean {
  return MICROSOFT_CLIENT_ID.trim() !== '';
}

// `common` aceita conta pessoal (hotmail.com, outlook.com, live.com) e conta de
// trabalho ou escola; o app precisa estar registrado para os dois tipos.
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
// Só leitura de email (Mail.Read), o endereço da conta (User.Read) e a
// renovação do token (offline_access).
const SCOPES = 'openid profile offline_access User.Read Mail.Read';
// Canal pelo qual a página de retorno avisa a janela do app (ver
// public/auth-redirect.html). O mesmo nome nos dois lados.
const AUTH_CHANNEL = 'cash-organizer-auth';

/** Endereço da página de retorno, que precisa estar registrado no Entra. */
export function outlookRedirectUri(): string {
  return new URL('auth-redirect.html', new URL(import.meta.env.BASE_URL, window.location.origin)).href;
}

/** Login vencido ou recusado: a caixa precisa de um toque novo para entrar. */
export class OutlookAuthError extends Error {}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

interface MsToken {
  access: string;
  expiresAt: number;
  refresh: string | null;
}

const tokens = new Map<string, MsToken>();

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomUrlSafe(size: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: MICROSOFT_CLIENT_ID, scope: SCOPES, ...body }),
    });
  } catch {
    throw new Error('Não foi possível falar com o login da Microsoft. Verifique a conexão.');
  }
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    // A Microsoft escreve o código (AADSTS...), a frase e o rastreio em linhas
    // separadas: só a primeira interessa para a tela.
    const why = json.error_description?.split(/\r?\n/)[0] || json.error || `HTTP ${res.status}`;
    throw new OutlookAuthError(`O login da Microsoft recusou: ${why}`);
  }
  if (json.scope && !/mail\.read/i.test(json.scope)) {
    throw new OutlookAuthError('A permissão de ler os emails não foi concedida.');
  }
  return json;
}

function remember(email: string, json: TokenResponse, previousRefresh: string | null = null): string {
  const access = json.access_token ?? '';
  tokens.set(email, {
    access,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    refresh: json.refresh_token ?? previousRefresh,
  });
  return access;
}

/**
 * Espera a janela de login voltar para a página de retorno. Dois caminhos,
 * o que chegar primeiro: ler a URL da janela (dá assim que ela volta para a
 * origem do app) e a mensagem que a própria página de retorno manda pelo
 * BroadcastChannel (cobre o navegador que corta o vínculo com a janela).
 */
function waitForRedirect(popup: Window, state: string): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(AUTH_CHANNEL) : null;
    const redirect = outlookRedirectUri();
    let done = false;
    let closedSince = 0;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(limit);
      channel?.close();
      try {
        popup.close();
      } catch {
        // janela já fechada
      }
      fn();
    };
    const handle = (hash: string) => {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      // Resposta de outra tentativa (outra aba, toque repetido): não é esta.
      if (params.get('state') !== state) return;
      const error = params.get('error');
      if (error) {
        const why = params.get('error_description')?.split(/\r?\n/)[0];
        finish(() =>
          reject(
            new OutlookAuthError(
              error === 'access_denied' ? 'O login da Microsoft foi cancelado.' : `O login da Microsoft recusou: ${why ?? error}`,
            ),
          ),
        );
      } else if (params.get('code')) {
        finish(() => resolve(params));
      }
    };
    channel?.addEventListener('message', (e: MessageEvent) => {
      if (typeof e.data === 'string') handle(e.data);
    });
    const timer = setInterval(() => {
      if (popup.closed) {
        // A página de retorno se fecha sozinha depois de avisar: dá um tempo
        // para a mensagem dela chegar antes de concluir que o usuário desistiu.
        closedSince ||= Date.now();
        if (Date.now() - closedSince > 1500) {
          finish(() => reject(new OutlookAuthError('O login da Microsoft foi cancelado.')));
        }
        return;
      }
      try {
        if (popup.location.href.startsWith(redirect)) handle(popup.location.hash);
      } catch {
        // Ainda no site da Microsoft: outra origem, a URL não é legível.
      }
    }, 250);
    const limit = setTimeout(
      () => finish(() => reject(new OutlookAuthError('O login da Microsoft passou do prazo. Tente de novo.'))),
      5 * 60_000,
    );
  });
}

/**
 * Abre a janela de login e devolve o token da conta. A janela é aberta antes
 * de qualquer espera: fora do gesto do usuário o navegador a bloqueia, e o
 * PKCE (que usa `crypto.subtle`, assíncrono) é montado depois, já com a janela
 * aberta em branco.
 */
function login(hint: string | null): Promise<{ email: string; access: string }> {
  const popup = window.open('', 'cash-organizer-microsoft', 'width=480,height=680');
  if (!popup) {
    return Promise.reject(
      new Error('O navegador bloqueou a janela da Microsoft. Libere pop-ups para este site.'),
    );
  }
  return (async () => {
    const verifier = randomUrlSafe(32);
    const state = randomUrlSafe(16);
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: outlookRedirectUri(),
      // No fragmento o código não vai para servidor nenhum, nem para o
      // service worker, que serve a página de retorno do cache.
      response_mode: 'fragment',
      scope: SCOPES,
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: 'S256',
      ...(hint ? { login_hint: hint } : { prompt: 'select_account' }),
    });
    popup.location.href = `${AUTHORITY}/authorize?${params}`;
    const back = await waitForRedirect(popup, state);
    const json = await tokenRequest({
      grant_type: 'authorization_code',
      code: back.get('code') ?? '',
      redirect_uri: outlookRedirectUri(),
      code_verifier: verifier,
    });
    const me = await graph<{ mail?: string | null; userPrincipalName?: string }>(
      json.access_token ?? '',
      `${GRAPH}/me?$select=mail,userPrincipalName`,
    );
    const email = (me.mail || me.userPrincipalName || hint || '').toLowerCase();
    if (!email) throw new Error('A Microsoft não informou o endereço da conta.');
    if (hint && email !== hint.toLowerCase()) {
      throw new OutlookAuthError(`O login foi feito com ${email}, e não com ${hint}. Tente de novo com a conta certa.`);
    }
    return { email, access: remember(email, json) };
  })();
}

/**
 * Token da caixa: o guardado, se ainda vale; renovado sem janela, se há token
 * de renovação; senão, a janela de login. Sem espera antes da janela, para
 * ela continuar dentro do gesto do usuário.
 */
function tokenFor(email: string): Promise<string> {
  const t = tokens.get(email);
  if (t && t.expiresAt - 60_000 > Date.now()) return Promise.resolve(t.access);
  if (t?.refresh) {
    const refresh = t.refresh;
    return tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
      .then((json) => remember(email, json, refresh))
      .catch(() => {
        // Renovação recusada (passou das 24 horas, senha trocada): a janela
        // agora já não estaria dentro do gesto, então o usuário toca de novo.
        tokens.delete(email);
        throw new OutlookAuthError('O acesso à caixa expirou. Toque de novo para entrar na conta Microsoft.');
      });
  }
  return login(email).then((r) => r.access);
}

export function outlookConnected(email: string): boolean {
  const t = tokens.get(email.toLowerCase());
  return Boolean(t && (t.refresh || t.expiresAt - 60_000 > Date.now()));
}

/** Conecta uma caixa nova: login com escolha de conta e leitura do endereço. */
export async function connectOutlook(): Promise<string> {
  return (await login(null)).email;
}

// ---------------------------------------------------------------------------
// Microsoft Graph
// ---------------------------------------------------------------------------

async function graph<T>(token: string, url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Não foi possível falar com o Outlook. Verifique a conexão.');
  }
  if (res.status === 401) throw new OutlookAuthError('O acesso à caixa expirou. Toque em buscar de novo.');
  if (res.status === 403) {
    throw new Error('A Microsoft recusou o acesso à caixa. Confira a permissão Mail.Read do app no Microsoft Entra.');
  }
  if (!res.ok) throw new Error(`O Outlook respondeu com erro (HTTP ${res.status}).`);
  return res.json() as Promise<T>;
}

interface GraphMessage {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
}

interface GraphAttachment {
  '@odata.type'?: string;
  name?: string;
  contentBytes?: string;
}

function base64ToBytes(data: string): Uint8Array {
  const bin = atob(data);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// Mensagens com anexo lidas por busca (páginas de 50) e mensagens de fatura
// baixadas: uma caixa pessoal recebe muitos anexos que não são fatura.
const MAX_SCANNED = 250;
const MAX_MATCHED = 20;

/**
 * Busca na caixa os emails com anexo dentro da janela de dias, fica com os
 * dos remetentes cadastrados (o Graph não combina busca de remetente com
 * filtro de data, então o remetente é conferido aqui) e baixa os anexos CSV e
 * ZIP. Sem token válido, abre o login da Microsoft: chame direto do toque.
 */
export async function searchOutlook(
  mailbox: string,
  isSender: (from: string) => boolean,
  lookbackDays: number,
): Promise<RawInvoice[]> {
  const email = mailbox.toLowerCase();
  const token = await tokenFor(email);
  try {
    const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
    // O Graph exige que o campo da ordenação venha primeiro no filtro.
    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${since} and hasAttachments eq true`,
      $orderby: 'receivedDateTime desc',
      $select: 'id,subject,from,receivedDateTime',
      $top: '50',
    });
    let next: string | undefined = `${GRAPH}/me/messages?${params}`;
    const matched: { msg: GraphMessage; from: string }[] = [];
    let scanned = 0;
    while (next && scanned < MAX_SCANNED && matched.length < MAX_MATCHED) {
      const page: { value?: GraphMessage[]; '@odata.nextLink'?: string } = await graph(token, next);
      for (const msg of page.value ?? []) {
        scanned++;
        const addr = msg.from?.emailAddress;
        const from = `${addr?.name ?? ''} <${addr?.address ?? ''}>`;
        if (isSender(from) && matched.length < MAX_MATCHED) matched.push({ msg, from });
      }
      next = page['@odata.nextLink'];
    }

    const found: RawInvoice[] = [];
    for (const { msg, from } of matched) {
      const atts = await graph<{ value?: GraphAttachment[] }>(
        token,
        `${GRAPH}/me/messages/${encodeURIComponent(msg.id)}/attachments`,
      );
      for (const att of atts.value ?? []) {
        if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') continue;
        if (!att.name || !/\.(csv|zip)$/i.test(att.name) || !att.contentBytes) continue;
        found.push({
          messageId: msg.id,
          filename: att.name,
          from,
          subject: msg.subject ?? '',
          date: msg.receivedDateTime ? Date.parse(msg.receivedDateTime) : Date.now(),
          bytes: base64ToBytes(att.contentBytes),
        });
      }
    }
    return found;
  } catch (err) {
    if (err instanceof OutlookAuthError) {
      const t = tokens.get(email);
      // Token de acesso recusado: a próxima tentativa renova ou pede login.
      if (t) tokens.set(email, { ...t, expiresAt: 0 });
    }
    throw err;
  }
}
