/** Chave de mês no formato YYYY-MM. */
export function monthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m, 1); // m já é o próximo mês (0-based)
  return monthKey(d);
}

export function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return monthKey(d);
}

/** Semana do mês de 1 a 4; dias 29, 30 e 31 contam como semana 4. */
export function weekOfMonth(date: Date = new Date()): number {
  return Math.min(4, Math.floor((date.getDate() - 1) / 7) + 1);
}

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
});

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const label = monthFormatter.format(new Date(y, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
});

export function dayLabel(ms: number): string {
  return dayFormatter.format(new Date(ms));
}

/** Data (ms) para o valor de um <input type="date"> (YYYY-MM-DD, hora local). */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Converte o valor de um <input type="date"> (YYYY-MM-DD) em ms, preservando a
 * hora atual — mantém a ordenação por horário entre lançamentos do mesmo dia.
 */
export function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  const now = new Date();
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).getTime();
}

/** Limites (min/max) de um mês YYYY-MM como valores de <input type="date">. */
export function monthDateRange(ym: string): { min: string; max: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // dia 0 do mês seguinte = último dia
  const mm = String(m).padStart(2, '0');
  return { min: `${y}-${mm}-01`, max: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
