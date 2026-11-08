/**
 * Camada de provedores de IA: uma função só (`runCompletion`) que esconde
 * quatro provedores e a fila de modelos de reserva. Quem usa só monta um
 * `system`, as mensagens e lê o texto que volta.
 *
 * O app não tem servidor, então a chamada sai do navegador direto para o
 * provedor, com `fetch` e sem SDK (o projeto evita dependência nova). Os
 * quatro aceitam CORS: o Claude pede o cabeçalho
 * `anthropic-dangerous-direct-browser-access`, e o Ollama precisa ter a origem
 * do app em `OLLAMA_ORIGINS`. Ver docs/11-importacao-e-ia.md.
 *
 * A interface é deliberadamente pobre (texto entra, texto sai): nada de JSON
 * mode nem tool use de cada provedor, e é isso que deixa trocar o provedor por
 * configuração.
 */
import { sha256Hex } from '../utils/crypto';
import type { AiModelEntry, AiProvider } from '../types';

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
  ollama: 'Ollama (local)',
};

/** Modelo usado quando o item da fila não escolhe um. */
export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  claude: 'claude-haiku-5-5',
  openai: 'gpt-5-mini',
  gemini: 'gemini-3.5-flash',
  ollama: 'llama3.2',
};

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/** Principal mais cinco reservas. */
export const MAX_AI_MODEL_CHAIN = 6;

export interface AiModelOption {
  id: string;
  name: string;
}

/**
 * Catálogo embutido: é o que a tela mostra quando a lista ao vivo do provedor
 * não responde (sem chave, rede fora, CORS). Envelhece a cada lançamento, por
 * isso a lista ao vivo vem primeiro e o "nome customizado" cobre o resto.
 */
export const AI_MODEL_CATALOG: Record<AiProvider, AiModelOption[]> = {
  claude: [
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  ],
  openai: [
    { id: 'gpt-5-mini', name: 'GPT-5 mini' },
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2' },
    { id: 'qwen2.5', name: 'Qwen 2.5' },
    { id: 'gemma3', name: 'Gemma 3' },
  ],
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** Por que um modelo falhou; decide se ele vai para a quarentena e por quanto tempo. */
export type AiFailureKind = 'limit' | 'model' | 'credential' | 'network' | 'other';

/** Erro vindo do provedor (ou do caminho até ele): repetir não adianta. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly provider: AiProvider,
    readonly model: string,
    readonly kind: AiFailureKind,
    readonly status: number,
    /** Segundos pedidos pelo cabeçalho `retry-after`, quando veio. */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

/** Erro de conteúdo: o modelo respondeu, mas fora do formato. Vale repetir. */
export class AiContentError extends Error {}

export function isProviderError(err: unknown): err is AiProviderError {
  return err instanceof AiProviderError;
}

/** A frase do provedor, sem JSON aninhado, pronta para a tela. */
export function providerMessage(err: unknown): string {
  if (err instanceof AiProviderError) {
    return `${AI_PROVIDER_LABEL[err.provider]} (${err.model}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return 'Falha desconhecida ao chamar a IA.';
}

const LIMIT_TEXT = /rate.?limit|quota|resource_exhausted|overloaded|too many requests|capacity/i;
const KEY_TEXT = /api key not valid|invalid.{0,10}api.?key|invalid x-api-key|incorrect api key|authentication/i;

function classify(status: number, message: string): AiFailureKind {
  if ([429, 529, 502, 503, 504].includes(status) || LIMIT_TEXT.test(message)) return 'limit';
  if (status === 404) return 'model';
  if (status === 401 || status === 403 || (status === 400 && KEY_TEXT.test(message))) {
    return 'credential';
  }
  return 'other';
}

/** Lê a mensagem de erro de qualquer um dos quatro formatos de corpo. */
async function errorFromResponse(
  res: Response,
  provider: AiProvider,
  model: string,
): Promise<AiProviderError> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    if (typeof body.error === 'string') message = body.error;
    else if (body.error?.message) message = body.error.message;
    else if (body.message) message = body.message;
  } catch {
    // corpo sem JSON: fica o status
  }
  // O Gemini às vezes repete o JSON do erro dentro da própria mensagem.
  message = message.replace(/\s*\{[\s\S]*\}\s*$/, '').trim() || `HTTP ${res.status}`;
  const retry = Number(res.headers.get('retry-after'));
  return new AiProviderError(
    message,
    provider,
    model,
    classify(res.status, message),
    res.status,
    Number.isFinite(retry) && retry > 0 ? retry : null,
  );
}

// ---------------------------------------------------------------------------
// Adaptadores
// ---------------------------------------------------------------------------

/** Prazo de uma chamada a um modelo. Estouro conta como limite (vai a reserva). */
export const CALL_TIMEOUT_MS = 60_000;

interface CallInput {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
}

async function post(
  input: CallInput,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === 'TimeoutError';
    throw new AiProviderError(
      timeout
        ? 'o modelo não respondeu dentro do prazo.'
        : 'não foi possível conectar (rede fora do ar ou bloqueio do navegador).',
      input.provider,
      input.model,
      timeout ? 'limit' : 'network',
      0,
    );
  }
  if (!res.ok) throw await errorFromResponse(res, input.provider, input.model);
  return res.json();
}

function emptyAnswer(input: CallInput, why = 'a resposta veio vazia.'): AiProviderError {
  return new AiProviderError(why, input.provider, input.model, 'other', 200);
}

async function callClaude(input: CallInput): Promise<string> {
  const json = (await post(
    input,
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    {
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: input.messages,
    },
  )) as { content?: { type: string; text?: string }[] };
  // Só os blocos de texto: raciocínio não é resposta.
  const text = (json.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  if (!text) throw emptyAnswer(input);
  return text;
}

async function callOpenAi(input: CallInput): Promise<string> {
  const json = (await post(
    input,
    'https://api.openai.com/v1/chat/completions',
    { authorization: `Bearer ${input.apiKey}` },
    {
      model: input.model,
      // `max_tokens` é recusado com 400 pelos modelos de raciocínio e pela
      // família GPT-5; `max_completion_tokens` vale para todos.
      max_completion_tokens: input.maxTokens,
      messages: [{ role: 'system', content: input.system }, ...input.messages],
    },
  )) as { choices?: { message?: { content?: string | null } }[] };
  const text = json.choices?.[0]?.message?.content ?? '';
  if (!text) throw emptyAnswer(input);
  return text;
}

async function callGemini(input: CallInput): Promise<string> {
  const json = (await post(
    input,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    // A chave vai no cabeçalho, e não na URL, para não ficar em histórico nem
    // em log de proxy.
    { 'x-goog-api-key': input.apiKey },
    {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: input.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      // Sem teto explícito a resposta para no padrão do modelo, e nos modelos
      // que pensam o raciocínio também gasta deste teto.
      generationConfig: { maxOutputTokens: Math.max(input.maxTokens, 8000) },
    },
  )) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) {
    const blocked = json.promptFeedback?.blockReason;
    throw emptyAnswer(input, blocked ? `a resposta foi bloqueada (${blocked}).` : undefined);
  }
  return text;
}

async function callOllama(input: CallInput): Promise<string> {
  const base = (input.baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const json = (await post(input, `${base}/api/chat`, {}, {
    model: input.model,
    stream: false,
    messages: [{ role: 'system', content: input.system }, ...input.messages],
  })) as { message?: { content?: string }; error?: string };
  if (json.error) throw new AiProviderError(json.error, 'ollama', input.model, 'other', 200);
  const text = json.message?.content ?? '';
  if (!text) throw emptyAnswer(input);
  return text;
}

const ADAPTERS: Record<AiProvider, (input: CallInput) => Promise<string>> = {
  claude: callClaude,
  openai: callOpenAi,
  gemini: callGemini,
  ollama: callOllama,
};

// ---------------------------------------------------------------------------
// Fila de modelos
// ---------------------------------------------------------------------------

/** Item da fila pronto para chamar: modelo resolvido e credencial herdada. */
export interface ResolvedAiEntry {
  /** Posição na configuração (0 é o principal), para a tela apontar o item. */
  position: number;
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
}

/**
 * Monta a fila a partir da configuração: modelo vazio vira o padrão do
 * provedor e reserva sem chave herda a do item anterior do mesmo provedor
 * (no Ollama, a URL). Assim alternar entre modelos de um provedor pede a
 * chave uma vez só. Item sem credencial nenhuma fica fora.
 */
export function resolveAiChain(chain: AiModelEntry[]): ResolvedAiEntry[] {
  const out: ResolvedAiEntry[] = [];
  const lastKey = new Map<AiProvider, string>();
  const lastUrl = new Map<AiProvider, string>();
  chain.slice(0, MAX_AI_MODEL_CHAIN).forEach((entry, position) => {
    const apiKey = entry.apiKey.trim() || lastKey.get(entry.provider) || '';
    const baseUrl = entry.baseUrl.trim() || lastUrl.get(entry.provider) || '';
    if (entry.apiKey.trim()) lastKey.set(entry.provider, entry.apiKey.trim());
    if (entry.baseUrl.trim()) lastUrl.set(entry.provider, entry.baseUrl.trim());
    const usable = entry.provider === 'ollama' ? true : apiKey !== '';
    if (!usable) return;
    out.push({
      position,
      provider: entry.provider,
      model: entry.model.trim() || DEFAULT_AI_MODELS[entry.provider],
      apiKey,
      baseUrl: entry.provider === 'ollama' ? baseUrl || DEFAULT_OLLAMA_URL : '',
    });
  });
  return out;
}

/** Algum item da fila tem credencial? Sem isso a IA fica desligada na tela. */
export function aiChainUsable(chain: AiModelEntry[]): boolean {
  return resolveAiChain(chain).length > 0;
}

interface Quarantine {
  until: number;
  kind: AiFailureKind;
  message: string;
}

// Quarentena em memória da aba: some ao recarregar, o que só faz o app tentar
// todos de novo. A chave leva o hash da credencial, nunca a credencial.
const quarantine = new Map<string, Quarantine>();

const QUARANTINE_DEFAULT_MS = 60_000;
const QUARANTINE_MAX_MS = 10 * 60_000;
const QUARANTINE_MODEL_MS = 30 * 60_000;

async function entryId(e: ResolvedAiEntry): Promise<string> {
  const cred = e.provider === 'ollama' ? e.baseUrl : e.apiKey;
  return `${e.provider}|${e.model}|${(await sha256Hex(cred)).slice(0, 16)}`;
}

function quarantineFor(err: AiProviderError, hasAlternative: boolean): number {
  if (err.kind === 'limit') {
    const asked = err.retryAfter ? err.retryAfter * 1000 : QUARANTINE_DEFAULT_MS;
    return Math.min(asked, QUARANTINE_MAX_MS);
  }
  // O provedor que retira um modelo responde 404 para sempre; chave recusada
  // não melhora sozinha. Sem reserva, porém, não há para onde ir.
  if (err.kind === 'model' && hasAlternative) return QUARANTINE_MODEL_MS;
  if (err.kind === 'credential' && hasAlternative) return QUARANTINE_DEFAULT_MS;
  return 0;
}

export interface CompletionResult {
  text: string;
  provider: AiProvider;
  model: string;
}

/**
 * Chama a fila: o primeiro item que responder ganha. Item que falha por limite
 * (ou modelo retirado, ou chave recusada) vai para a quarentena e passa para o
 * fim da fila, sem sumir: se todos os outros falharem, ele ainda é tentado.
 * Todos falhando, o erro repassado é o da primeira tentativa, que é o que diz o
 * que aconteceu com o modelo escolhido como principal.
 */
export async function runCompletion(opts: {
  chain: AiModelEntry[];
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<CompletionResult> {
  const resolved = resolveAiChain(opts.chain);
  if (resolved.length === 0) {
    throw new Error('A IA não está configurada: informe uma chave em Configurações de IA.');
  }
  const ids = await Promise.all(resolved.map(entryId));
  const now = Date.now();
  const order = resolved
    .map((entry, i) => ({ entry, id: ids[i], held: (quarantine.get(ids[i])?.until ?? 0) > now }))
    .sort((a, b) => Number(a.held) - Number(b.held));

  let first: unknown = null;
  for (const { entry, id } of order) {
    try {
      const text = await ADAPTERS[entry.provider]({
        ...entry,
        system: opts.system,
        messages: opts.messages,
        maxTokens: opts.maxTokens ?? 4000,
      });
      quarantine.delete(id);
      return { text, provider: entry.provider, model: entry.model };
    } catch (err) {
      first ??= err;
      if (err instanceof AiProviderError) {
        const ms = quarantineFor(err, order.length > 1);
        if (ms > 0) quarantine.set(id, { until: Date.now() + ms, kind: err.kind, message: err.message });
      }
    }
  }
  throw first;
}

export interface AiEntryHealth {
  position: number;
  kind: AiFailureKind;
  message: string;
  /** Até quando o item fica no fim da fila (ms). */
  until: number;
}

/** Itens da fila em quarentena agora, com o motivo, para a tela de configuração. */
export async function chainHealth(chain: AiModelEntry[]): Promise<AiEntryHealth[]> {
  const resolved = resolveAiChain(chain);
  const ids = await Promise.all(resolved.map(entryId));
  const now = Date.now();
  const out: AiEntryHealth[] = [];
  resolved.forEach((entry, i) => {
    const q = quarantine.get(ids[i]);
    if (q && q.until > now) out.push({ position: entry.position, kind: q.kind, message: q.message, until: q.until });
  });
  return out;
}

/**
 * Primeiro objeto JSON do texto: aceita a resposta dentro de cerca de código
 * ou solta, e pega do primeiro `{` ao último `}`. Sem objeto, é erro de
 * conteúdo (vale pedir de novo).
 */
export function parseJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AiContentError('A IA não respondeu com um objeto JSON.');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AiContentError('A IA respondeu com um JSON inválido.');
  }
}

// ---------------------------------------------------------------------------
// Lista de modelos ao vivo
// ---------------------------------------------------------------------------

const LIST_TIMEOUT_MS = 8_000;
const LIST_CACHE_MS = 10 * 60_000;
const listCache = new Map<string, { at: number; models: AiModelOption[] }>();

// Modelos que não conversam por texto: não servem para organizar a fatura.
const NOT_CHAT =
  /embed|whisper|tts|dall-e|image|imagen|veo|audio|realtime|moderation|transcribe|search|instruct|aqa|live|robotics|computer-use|babbage|davinci/i;

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchLiveModels(provider: AiProvider, apiKey: string, baseUrl: string): Promise<AiModelOption[]> {
  if (provider === 'claude') {
    const json = (await getJson('https://api.anthropic.com/v1/models?limit=100', {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })) as { data?: { id: string; display_name?: string }[] };
    return (json.data ?? []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }
  if (provider === 'openai') {
    const json = (await getJson('https://api.openai.com/v1/models', {
      authorization: `Bearer ${apiKey}`,
    })) as { data?: { id: string; created?: number }[] };
    return (json.data ?? [])
      .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !NOT_CHAT.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({ id: m.id, name: m.id }));
  }
  if (provider === 'gemini') {
    const json = (await getJson(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      { 'x-goog-api-key': apiKey },
    )) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }))
      .filter((m) => !NOT_CHAT.test(m.id));
  }
  const base = (baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const json = (await getJson(`${base}/api/tags`, {})) as { models?: { name: string }[] };
  return (json.models ?? []).map((m) => ({ id: m.name, name: m.name }));
}

/**
 * Modelos do provedor, consultados na API de listagem dele com a chave em
 * mãos. Qualquer falha devolve o catálogo embutido com `live: false`, e a tela
 * avisa que pode haver modelo fora da lista.
 */
export async function listModels(
  provider: AiProvider,
  apiKey: string,
  baseUrl: string,
): Promise<{ models: AiModelOption[]; live: boolean }> {
  const cred = provider === 'ollama' ? baseUrl || DEFAULT_OLLAMA_URL : apiKey.trim();
  if (!cred) return { models: AI_MODEL_CATALOG[provider], live: false };
  const cacheKey = `${provider}|${(await sha256Hex(cred)).slice(0, 16)}`;
  const cached = listCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIST_CACHE_MS) return { models: cached.models, live: true };
  try {
    const models = await fetchLiveModels(provider, apiKey.trim(), baseUrl);
    if (models.length === 0) return { models: AI_MODEL_CATALOG[provider], live: false };
    listCache.set(cacheKey, { at: Date.now(), models });
    return { models, live: true };
  } catch {
    return { models: AI_MODEL_CATALOG[provider], live: false };
  }
}
