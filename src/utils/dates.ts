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

/** Hoje é domingo? É quando o app sugere virar a semana. */
export function isSunday(date: Date = new Date()): boolean {
  return date.getDay() === 0;
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

/** Dia no formato YYYY-MM-DD, aceito pelo <input type="date">. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converte YYYY-MM-DD em um Date local. A hora vem do relógio (por padrão, o
 * momento da inclusão) para que lançamentos do mesmo dia mantenham a ordem em
 * que foram criados; o construtor com string seria interpretado como UTC e
 * poderia cair no dia anterior.
 */
export function dateFromDayKey(key: string, time: Date = new Date()): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(
    y,
    m - 1,
    d,
    time.getHours(),
    time.getMinutes(),
    time.getSeconds(),
    time.getMilliseconds(),
  );
}

/** Rótulo curto (dd/mm) de um dia no formato YYYY-MM-DD. */
export function dayKeyLabel(key: string): string {
  return dayLabel(dateFromDayKey(key).getTime());
}

const fullDayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Rótulo completo (dd/mm/aaaa) de um dia no formato YYYY-MM-DD. */
export function dayKeyFullLabel(key: string): string {
  return fullDayFormatter.format(dateFromDayKey(key));
}
