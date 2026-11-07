/**
 * Faturas de cartão em CSV: reconhece o banco pelo cabeçalho, lê cada linha
 * para um formato único (`StatementItem`) e monta as chaves que impedem a
 * mesma compra de entrar duas vezes. Tudo puro: sem React e sem Firestore.
 *
 * Formatos conhecidos (ver docs/11-importacao-e-ia.md):
 * - Nubank: `date,title,amount`, data ISO, valor com vírgula decimal entre
 *   aspas, parcela no fim do título ("Parcela 2/3" ou " - 2/7").
 * - C6 Bank: separado por ponto e vírgula, com "Data de Compra", "Categoria",
 *   "Descrição", "Parcela" ("Única" ou "1/3") e "Valor (em R$)".
 * - Genérico: qualquer CSV com colunas de data, descrição e valor que os
 *   apelidos abaixo reconheçam.
 */
import { decodeText, normalizeText, parseAmountCents, parseCsv, parseDayKey } from './csv';
import { isZip, readZip } from './zip';

export const STATEMENT_FORMATS = ['nubank', 'c6', 'generic'] as const;

export type StatementFormat = (typeof STATEMENT_FORMATS)[number];

export const STATEMENT_FORMAT_LABEL: Record<StatementFormat, string> = {
  nubank: 'Fatura Nubank',
  c6: 'Fatura C6 Bank',
  generic: 'CSV genérico',
};

export interface Installment {
  current: number;
  total: number;
}

/** Uma compra da fatura, já no formato do app. */
export interface StatementItem {
  /** Posição da linha no arquivo, a partir de 0: mantém a ordem da fatura. */
  index: number;
  /** Data da compra (ou do lançamento da parcela), `YYYY-MM-DD`. */
  date: string;
  /** Descrição sem a parte da parcela ("Js Direcao Hidraulica"). */
  title: string;
  /** Descrição exatamente como veio no arquivo. */
  rawTitle: string;
  /** Valor em centavos, sempre positivo (créditos ficam fora, ver `credits`). */
  amount: number;
  /** Parcela da compra parcelada; `null` na compra à vista. */
  installment: Installment | null;
  /** Categoria que o próprio banco mandou (o C6 manda), só como pista. */
  bankCategory: string | null;
  /**
   * Cartão da compra, quando a fatura junta vários (o C6 traz o final de cada
   * cartão, físico, virtual ou adicional, e o nome de quem usou): "final 0723,
   * Bruna Souza". Só para leitura na revisão.
   */
  card: string | null;
}

export interface ParsedStatement {
  format: StatementFormat;
  items: StatementItem[];
  /** Pagamentos da fatura, estornos e créditos: não são gasto e não entram. */
  credits: number;
  /** Linhas sem data ou valor legível. */
  invalid: number;
}

/** Falha de leitura com mensagem pronta para a tela. */
export class StatementError extends Error {}

// Apelidos de cada coluna, já normalizados (sem acento e em minúsculas). A
// comparação é exata de propósito: "valor (em us$)" não pode virar o valor.
const DATE_HEADERS = [
  'date',
  'data',
  'data de compra',
  'data da compra',
  'data compra',
  'data lancamento',
  'data do lancamento',
  'data de lancamento',
];
const TITLE_HEADERS = [
  'title',
  'descricao',
  'description',
  'estabelecimento',
  'lancamento',
  'historico',
  'detalhe',
];
const AMOUNT_HEADERS = [
  'valor (em r$)',
  'valor em r$',
  'valor (r$)',
  'valor r$',
  'amount',
  'valor',
];
const INSTALLMENT_HEADERS = ['parcela', 'parcelas', 'installment'];
const CATEGORY_HEADERS = ['categoria', 'category'];
const CARD_HEADERS = ['final do cartao', 'final cartao', 'cartao'];
const HOLDER_HEADERS = ['nome no cartao', 'titular', 'portador'];

/** "RUAN SOUZA" vira "Ruan Souza"; o resto fica como veio. */
function capitalizeName(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

// "-" é como o C6 diz "sem categoria" (pagamento, crédito).
function cleanBankCategory(raw: string): string | null {
  const text = raw.trim();
  return text && text !== '-' ? text : null;
}

function findColumn(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const i = headers.indexOf(alias);
    if (i >= 0) return i;
  }
  return -1;
}

function detectFormat(headers: string[]): StatementFormat {
  const set = new Set(headers);
  if (set.has('final do cartao') || set.has('nome no cartao')) return 'c6';
  if (set.has('data de compra') && set.has('valor (em r$)')) return 'c6';
  if (headers.length === 3 && set.has('date') && set.has('title') && set.has('amount')) {
    return 'nubank';
  }
  return 'generic';
}

/** Parcela escrita como "2/3", "02 de 10" ou "Única" (que é à vista). */
export function parseInstallment(raw: string): Installment | null {
  const match = /(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})/i.exec(raw);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (total < 2 || current < 1 || current > total || total > 120) return null;
  return { current, total };
}

// Parcela no fim do título: "Loja - Parcela 2/3", "Pix no Crédito - Fulano -
// 2/7", "LOJA PARC 02/10". O hífen e a meia-risca do separador saem junto.
const TITLE_INSTALLMENT = /\s*[-\u2013\u2014]?\s*(?:parcela|parc\.?)?\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\s*$/i;

/** Separa a parcela do fim do título, quando há. */
export function splitTitleInstallment(title: string): { title: string; installment: Installment | null } {
  const match = TITLE_INSTALLMENT.exec(title);
  if (!match) return { title: title.trim(), installment: null };
  const installment = parseInstallment(`${match[1]}/${match[2]}`);
  if (!installment) return { title: title.trim(), installment: null };
  const base = title.slice(0, match.index).replace(/\s*[-\u2013\u2014]\s*$/, '').trim();
  return { title: base || title.trim(), installment };
}

/**
 * Lê o texto de um CSV de fatura. Lança `StatementError` com a explicação
 * quando o arquivo não tem as colunas mínimas (data, descrição e valor).
 */
export function parseStatement(text: string): ParsedStatement {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new StatementError('O arquivo está vazio.');

  const headers = rows[0].map(normalizeText);
  const format = detectFormat(headers);
  const col = {
    date: findColumn(headers, DATE_HEADERS),
    title: findColumn(headers, TITLE_HEADERS),
    amount: findColumn(headers, AMOUNT_HEADERS),
    installment: findColumn(headers, INSTALLMENT_HEADERS),
    category: findColumn(headers, CATEGORY_HEADERS),
    card: findColumn(headers, CARD_HEADERS),
    holder: findColumn(headers, HOLDER_HEADERS),
  };
  if (col.date < 0 || col.title < 0 || col.amount < 0) {
    throw new StatementError(
      'Formato de CSV não reconhecido: o arquivo precisa ter colunas de data, descrição e valor.',
    );
  }

  type Raw = Omit<StatementItem, 'amount' | 'index'> & { signed: number };
  const raws: Raw[] = [];
  let invalid = 0;
  for (const row of rows.slice(1)) {
    const date = parseDayKey(row[col.date] ?? '');
    const signed = parseAmountCents(row[col.amount] ?? '');
    const rawTitle = (row[col.title] ?? '').trim();
    if (!date || signed === null || !rawTitle) {
      invalid++;
      continue;
    }
    if (signed === 0) continue;
    const fromColumn = col.installment >= 0 ? parseInstallment(row[col.installment] ?? '') : null;
    const split = splitTitleInstallment(rawTitle);
    const bankCategory = col.category >= 0 ? cleanBankCategory(row[col.category] ?? '') : null;
    const cardParts = [
      col.card >= 0 && row[col.card] ? `final ${row[col.card]}` : '',
      col.holder >= 0 && row[col.holder] ? capitalizeName(row[col.holder]) : '',
    ].filter(Boolean);
    raws.push({
      date,
      rawTitle,
      // A coluna de parcela, quando existe, manda; o título só é limpo se a
      // parcela estava nele.
      title: fromColumn && !split.installment ? rawTitle : split.title,
      installment: fromColumn ?? split.installment,
      bankCategory,
      card: cardParts.length > 0 ? cardParts.join(', ') : null,
      signed,
    });
  }

  // Nubank e C6 escrevem a compra positiva e o pagamento negativo. Extrato
  // genérico às vezes faz o contrário (gasto negativo): quando a maioria vem
  // negativa, o sinal é invertido para a compra continuar sendo a positiva.
  const negatives = raws.filter((r) => r.signed < 0).length;
  const flip = format === 'generic' && negatives > raws.length - negatives;

  const items: StatementItem[] = [];
  let credits = 0;
  for (const r of raws) {
    const value = flip ? -r.signed : r.signed;
    if (value < 0) {
      credits++;
      continue;
    }
    items.push({
      index: items.length,
      date: r.date,
      title: r.title,
      rawTitle: r.rawTitle,
      amount: value,
      installment: r.installment,
      bankCategory: r.bankCategory,
      card: r.card,
    });
  }
  return { format, items, credits, invalid };
}

/**
 * Lê o arquivo anexado ou baixado do email: CSV direto, ou ZIP com um ou mais
 * CSVs dentro (juntados em uma fatura só, na ordem do ZIP). A senha só é usada
 * se o ZIP estiver protegido; sem ela, lança `ZipError` do tipo `password`.
 */
export async function readStatementFile(
  fileName: string,
  bytes: Uint8Array,
  password?: string,
): Promise<ParsedStatement> {
  if (!isZip(bytes)) return parseStatement(decodeText(bytes));
  const entries = await readZip(bytes, (name) => /\.csv$/i.test(name), password);
  if (entries.length === 0) throw new StatementError(`O arquivo ${fileName} não tem nenhum CSV dentro.`);
  const parts = entries.map((e) => parseStatement(decodeText(e.bytes)));
  const items = parts.flatMap((p) => p.items).map((item, index) => ({ ...item, index }));
  return {
    format: parts[0].format,
    items,
    credits: parts.reduce((s, p) => s + p.credits, 0),
    invalid: parts.reduce((s, p) => s + p.invalid, 0),
  };
}

// ---------------------------------------------------------------------------
// Chaves e comparação
// ---------------------------------------------------------------------------

/** Título normalizado para chave: sem acento, sem caixa, espaço simples. */
export function titleKey(title: string): string {
  return normalizeText(title);
}

// Prefixos de adquirente que antecedem o nome da loja ("DL*SPOTIFY",
// "IFD*RESTAURANTE", "PG *LOJA", "ADIQPLU*GAMA", "JIM.COM* VETLIFE"): não
// dizem nada sobre o gasto. Só sai quando sobra texto depois do asterisco.
const ACQUIRER_PREFIX = /^[a-z0-9.]{1,10}\s*\*\s*(?=\S)/i;

/**
 * Nome do estabelecimento para comparar com o histórico: sem o prefixo da
 * adquirente, sem números (código de loja, cidade abreviada com número) e sem
 * pontuação. "Dl*Spotify P4870" vira "spotify".
 */
export function merchantKey(title: string): string {
  return normalizeText(splitTitleInstallment(title).title)
    .replace(ACQUIRER_PREFIX, '')
    .replace(/\*/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((t) => t && !/\d/.test(t))
    .join(' ');
}

// Começos que se repetem em compras sem relação entre si: comparar só por eles
// juntaria "Pix no Crédito - Fulano" e "Pix no Crédito - Beltrano".
const GENERIC_HEADS = new Set(['pix', 'pag', 'pagamento', 'compra', 'iof', 'ted', 'doc', 'transf']);

/** As duas primeiras palavras do estabelecimento, ou vazio quando são genéricas. */
export function merchantHead(key: string): string {
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length < 2 || GENERIC_HEADS.has(tokens[0]) || tokens[0].length < 3) return '';
  return `${tokens[0]} ${tokens[1]}`;
}

/**
 * Chave da compra à vista: data, título, valor e a ocorrência (a segunda
 * compra idêntica no mesmo dia é a ocorrência 1). Reimportar o mesmo arquivo,
 * ou uma fatura que repete dias da anterior, produz as mesmas chaves.
 */
export function purchaseImportKey(item: StatementItem, occurrence: number): string {
  return `v1|${item.date}|${titleKey(item.title)}|${item.amount}|${occurrence}`;
}

/**
 * Chave da compra parcelada: título, valor da parcela e total de parcelas,
 * sem a data e sem a parcela atual. É o que faz a "Parcela 3/3" da fatura
 * seguinte ser reconhecida como a mesma compra que entrou na "2/3".
 */
export function installmentImportKey(item: StatementItem): string {
  return `p1|${titleKey(item.title)}|${item.amount}|${item.installment?.total ?? 0}`;
}

/**
 * Ocorrência de cada item entre os idênticos (mesma data, título e valor),
 * na ordem do arquivo. Devolve um vetor alinhado com `items`.
 */
export function occurrences(items: StatementItem[]): number[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = `${item.date}|${titleKey(item.title)}|${item.amount}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n;
  });
}

/**
 * Descrição legível a partir do título do banco, sem IA: tira o prefixo da
 * adquirente e passa o que está todo em maiúsculas para iniciais maiúsculas.
 * "DL*SPOTIFY P4870" vira "Spotify P4870".
 */
export function tidyTitle(title: string): string {
  const semPrefixo = title.replace(ACQUIRER_PREFIX, '').replace(/\*/g, ' ').trim();
  const base = (semPrefixo || title.trim()).replace(/\s+/g, ' ');
  if (base !== base.toUpperCase()) return base;
  return base
    .toLowerCase()
    .split(' ')
    .map((word, i) =>
      // Preposição e artigo no meio do nome ficam em minúsculas ("Casa do Farelo").
      i > 0 && LOWER_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o']);
