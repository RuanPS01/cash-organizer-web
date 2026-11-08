/**
 * Leitura de CSV sem dependência: só o necessário para faturas de cartão.
 *
 * Os bancos não concordam em nada: o Nubank separa por vírgula e põe o valor
 * entre aspas ("24,90"), o C6 separa por ponto e vírgula, e qualquer um pode
 * vir com BOM, quebra de linha do Windows ou acento em Latin-1. As funções
 * daqui resolvem esse chão comum; o que cada banco quer dizer com cada coluna
 * fica em `utils/statement.ts`.
 */

/** Separadores aceitos, na ordem de preferência quando a contagem empata. */
const DELIMITERS = [';', ',', '\t'] as const;

/**
 * Descobre o separador olhando a primeira linha (o cabeçalho), contando só o
 * que está fora de aspas. Vírgula dentro de "24,90" não pode votar.
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const delim of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === delim) count++;
    }
    if (count > bestCount) {
      best = delim;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Quebra o texto em linhas e células, respeitando aspas (inclusive aspas
 * dobradas e quebra de linha dentro de aspas). Linhas vazias são descartadas.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  // O BOM do UTF-8 grudaria no nome da primeira coluna e o cabeçalho deixaria
  // de ser reconhecido.
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return rows;
}

/**
 * Converte bytes em texto. Tenta UTF-8 e, se aparecer o caractere de
 * substituição (byte que não forma UTF-8 válido), relê como Windows-1252,
 * que é como os exportadores antigos gravam acento.
 */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return utf8;
  }
}

/** Minúsculas, sem acento e com espaços simples: a forma de comparar texto. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lê um valor monetário escrito por um banco e devolve centavos (inteiro,
 * com sinal), ou null quando não é número.
 *
 * Aceita "24,90", "1.234,56", "1234.56", "-24,90", "R$ 24,90" e "(24,90)".
 * Com vírgula e ponto juntos, o último dos dois é o decimal. Só com ponto, três
 * dígitos depois dele são milhar ("1.234"), e um ou dois são centavos.
 */
export function parseAmountCents(raw: string): number | null {
  let text = raw.replace(/\s|R\$|US\$| /gi, '');
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (text.startsWith('+')) text = text.slice(1);
  if (!/^[\d.,]+$/.test(text)) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let integer: string;
  let fraction = '';
  if (lastComma >= 0 && lastDot >= 0) {
    const sep = lastComma > lastDot ? lastComma : lastDot;
    integer = text.slice(0, sep).replace(/[.,]/g, '');
    fraction = text.slice(sep + 1);
  } else if (lastComma >= 0) {
    integer = text.slice(0, lastComma).replace(/,/g, '');
    fraction = text.slice(lastComma + 1);
  } else if (lastDot >= 0) {
    const after = text.length - lastDot - 1;
    const head = text.slice(0, text.indexOf('.'));
    // "1.234" e "12.345.678" são milhar; "0.123" (cotação) não é.
    if (after === 3 && head !== '0' && head.length <= 3) {
      integer = text.replace(/\./g, '');
    } else {
      integer = text.slice(0, lastDot).replace(/\./g, '');
      fraction = text.slice(lastDot + 1);
    }
  } else {
    integer = text;
  }
  if (!/^\d*$/.test(integer) || !/^\d*$/.test(fraction)) return null;
  // Centavos sempre com dois dígitos: "24,9" é 24,90, e um terceiro dígito
  // (cotação de moeda estrangeira) é arredondado.
  const cents = Math.round(Number(`${integer || '0'}.${fraction || '0'}`) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/**
 * Lê uma data de fatura e devolve `YYYY-MM-DD`, ou null. Aceita
 * `YYYY-MM-DD`, `DD/MM/YYYY`, `DD/MM/YY` e as mesmas com hífen ou ponto.
 */
export function parseDayKey(raw: string): string | null {
  const text = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(text);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(y, m - 1, d);
  if (check.getMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
