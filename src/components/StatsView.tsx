import { useEffect, useMemo, useState } from 'react';
import { computeTotals, fetchExpenses, listMonths } from '../services/months';
import { formatBRL } from '../utils/money';
import { monthLabel, prevMonthKey } from '../utils/dates';
import { ProgressBar } from './shared';
import type { MonthData } from '../hooks/useMonthData';
import type { MonthDoc, MonthTotals, VariableExpense } from '../types';

function pct(actual: number, ideal: number): string {
  if (ideal <= 0) return 'sem ideal';
  return `${Math.round((actual / ideal) * 100)}%`;
}

function weeklySums(expenses: VariableExpense[]): number[] {
  const weeks = [0, 0, 0, 0];
  for (const e of expenses) {
    const w = Math.min(4, Math.max(1, e.week)) - 1;
    weeks[w] += e.amount;
  }
  return weeks;
}

/**
 * Subtela de estatísticas: comparação entre meses, uso por categoria no mês
 * visualizado e comparação semanal com o mês anterior.
 */
export function StatsView(props: {
  compartmentId: string;
  viewMonth: string;
  data: MonthData;
}) {
  const { compartmentId, viewMonth, data } = props;
  const [months, setMonths] = useState<MonthDoc[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<VariableExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const prevMonth = prevMonthKey(viewMonth);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listMonths(compartmentId), fetchExpenses(compartmentId, prevMonth)])
      .then(([m, pe]) => {
        if (cancelled) return;
        setMonths(m);
        setPrevExpenses(pe);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compartmentId, prevMonth]);

  // Totais do mês visualizado: os fechados têm totais gravados; o aberto é
  // calculado ao vivo a partir dos dados assinados.
  const viewTotals: MonthTotals = useMemo(
    () =>
      data.month?.totals ??
      computeTotals(data.fixedEntries, data.categoryEntries, data.expenses),
    [data],
  );

  const monthlyRows = useMemo(() => {
    return months
      .slice(0, 6)
      .map((m) => {
        const totals = m.id === viewMonth ? viewTotals : m.totals;
        return totals
          ? {
              id: m.id,
              ideal: totals.fixedIdeal + totals.varIdeal,
              actual: totals.fixedActual + totals.varActual,
              fixed: totals.fixedActual,
              variable: totals.varActual,
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [months, viewMonth, viewTotals]);

  const maxMonthly = Math.max(1, ...monthlyRows.map((r) => Math.max(r.actual, r.ideal)));

  const weeks = weeklySums(data.expenses);
  const prevWeeks = weeklySums(prevExpenses);
  const weeklyIdeal = Math.round(viewTotals.varIdeal / 4);

  const categories = Object.entries(viewTotals.byCategory).sort(
    (a, b) => b[1].actual - a[1].actual,
  );

  if (loading && months.length === 0) {
    return <p className="muted center">Carregando estatísticas…</p>;
  }

  return (
    <div className="stats">
      <section className="card">
        <h3>Comparativo mensal (total gasto × ideal)</h3>
        {monthlyRows.length === 0 && <p className="muted">Ainda não há meses com dados.</p>}
        {monthlyRows.map((r) => (
          <div key={r.id} className="stat-row">
            <div className="stat-head">
              <span>{monthLabel(r.id)}</span>
              <span>
                <strong>{formatBRL(r.actual)}</strong>
                <span className="muted"> / {formatBRL(r.ideal)} · {pct(r.actual, r.ideal)}</span>
              </span>
            </div>
            <ProgressBar ratio={r.actual / maxMonthly} danger={r.ideal > 0 && r.actual > r.ideal} />
            <p className="muted small">
              Fixos {formatBRL(r.fixed)} · Variáveis {formatBRL(r.variable)}
            </p>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Categorias em {monthLabel(viewMonth)}</h3>
        {categories.length === 0 && <p className="muted">Sem categorias neste mês.</p>}
        {categories.map(([id, c]) => (
          <div key={id} className="stat-row">
            <div className="stat-head">
              <span>{c.name}</span>
              <span>
                <strong>{formatBRL(c.actual)}</strong>
                {c.ideal > 0 && (
                  <span className="muted"> / {formatBRL(c.ideal)} · {pct(c.actual, c.ideal)}</span>
                )}
              </span>
            </div>
            <ProgressBar ratio={c.ideal > 0 ? c.actual / c.ideal : c.actual > 0 ? 1 : 0} />
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Semanas: {monthLabel(viewMonth)} × {monthLabel(prevMonth)}</h3>
        <p className="muted small">
          Ideal semanal (variáveis): {weeklyIdeal > 0 ? formatBRL(weeklyIdeal) : 'não definido'}
        </p>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat-row">
            <div className="stat-head">
              <span>Semana {i + 1}</span>
              <span>
                <strong>{formatBRL(weeks[i])}</strong>
                <span className="muted"> · mês anterior {formatBRL(prevWeeks[i])}</span>
              </span>
            </div>
            <ProgressBar
              ratio={weeklyIdeal > 0 ? weeks[i] / weeklyIdeal : 0}
              danger={weeklyIdeal > 0 && weeks[i] > weeklyIdeal}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
