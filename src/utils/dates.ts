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
