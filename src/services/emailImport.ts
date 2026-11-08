/**
 * Importação de fatura por email: as caixas conectadas (Gmail ou conta
 * Microsoft, com Outlook e Hotmail) e os remetentes de fatura cadastrados,
 * cada um ligado a uma origem do gasto e, se o banco manda ZIP protegido, à
 * senha dele.
 *
 * Sem servidor, quem fala com o provedor é o navegador, e a busca roda quando
 * o usuário toca em "Buscar". O login e a API de cada provedor ficam em
 * `gmail.ts` e `outlook.ts`; aqui ficam a configuração gravada e a escolha do
 * provedor de cada caixa. Escutar a caixa o tempo todo, ou ler um provedor só
 * com IMAP, pediria um servidor (Cloud Functions no plano Blaze).
 * Ver docs/11-importacao-e-ia.md.
 */
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { openSecret, sealSecret } from '../utils/crypto';
import { connectGmail, gmailAvailable, gmailConnected, preloadGoogleLogin, searchGmail } from './gmail';
import { connectOutlook, outlookAvailable, outlookConnected, searchOutlook } from './outlook';
import type { EmailMailbox, EmailProvider, StoredEmailImportSettings } from '../types';

export function emailSettingsRef(compartmentId: string) {
  return doc(db, 'compartments', compartmentId, 'settings', 'emailImport');
}

export const EMAIL_PROVIDER_LABEL: Record<EmailProvider, string> = {
  gmail: 'Gmail',
  microsoft: 'Outlook/Hotmail',
};

/** Provedor da caixa; a conectada antes do Outlook existir é do Gmail. */
export function providerOf(mailbox: EmailMailbox): EmailProvider {
  return mailbox.provider ?? 'gmail';
}

/**
 * O provedor tem o id do app configurado no build? Sem ele não há login:
 * `VITE_GOOGLE_CLIENT_ID` para o Gmail, `VITE_MICROSOFT_CLIENT_ID` para a
 * Microsoft.
 */
export function emailProviderAvailable(provider: EmailProvider): boolean {
  return provider === 'gmail' ? gmailAvailable() : outlookAvailable();
}

/** Algum provedor de email está configurado no build? */
export function emailImportAvailable(): boolean {
  return gmailAvailable() || outlookAvailable();
}

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
// Conexão e busca
// ---------------------------------------------------------------------------

/**
 * Anexo de fatura como o provedor devolve, antes de casar com o remetente
 * cadastrado. É o contrato entre `gmail.ts`, `outlook.ts` e esta busca.
 */
export interface RawInvoice {
  messageId: string;
  filename: string;
  /** "De" do email, com nome e endereço. */
  from: string;
  subject: string;
  /** ms do email. */
  date: number;
  bytes: Uint8Array;
}

export interface FoundInvoice extends RawInvoice {
  /** Estável na tela: provedor, caixa, mensagem e anexo. */
  id: string;
  mailbox: string;
  /** Remetente cadastrado que casou com o "De" do email. */
  sender: EmailSenderConfig | null;
}

/** Remetente cadastrado contido no "De" do email (endereço completo ou domínio). */
export function matchSender(from: string, senders: EmailSenderConfig[]): EmailSenderConfig | null {
  const lower = from.toLowerCase();
  return senders.find((s) => s.address && lower.includes(s.address.toLowerCase())) ?? null;
}

/**
 * Conecta uma caixa nova do provedor: abre o login com escolha de conta e
 * devolve o endereço. Chame direto do toque: a janela de login só abre dentro
 * do gesto do usuário.
 */
export function connectMailbox(provider: EmailProvider): Promise<string> {
  return provider === 'gmail' ? connectGmail() : connectOutlook();
}

/** A caixa já tem acesso válido nesta aba (a busca não vai pedir login)? */
export function mailboxConnected(mailbox: EmailMailbox): boolean {
  return providerOf(mailbox) === 'gmail' ? gmailConnected(mailbox.email) : outlookConnected(mailbox.email);
}

/**
 * Busca na caixa os emails dos remetentes cadastrados com anexo CSV ou ZIP,
 * dentro da janela de dias configurada, e baixa os anexos. Sem acesso válido,
 * abre o login do provedor para aquela caixa: chame direto do toque, sem
 * esperar nada antes.
 */
export async function searchInvoices(mailbox: EmailMailbox, config: EmailConfig): Promise<FoundInvoice[]> {
  const senders = config.senders.filter((s) => s.address.trim());
  if (senders.length === 0) return [];
  const provider = providerOf(mailbox);
  const raw =
    provider === 'gmail'
      ? await searchGmail(mailbox.email, senders.map((s) => s.address.trim()), config.lookbackDays)
      : await searchOutlook(mailbox.email, (from) => matchSender(from, senders) !== null, config.lookbackDays);
  return raw
    .map((r) => ({
      ...r,
      id: `${provider}|${mailbox.email}|${r.messageId}|${r.filename}`,
      mailbox: mailbox.email,
      sender: matchSender(r.from, senders),
    }))
    .sort((a, b) => b.date - a.date);
}

/** Prepara o login de quem precisa de script (o Google) antes do toque. */
export function preloadEmailLogin(): void {
  preloadGoogleLogin();
}
