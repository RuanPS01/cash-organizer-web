import { useEffect, useMemo, useState } from 'react';
import { computeTotals, fetchExpenses } from '../services/months';
import { formatBRL } from '../utils/money';
import { monthLabel, prevMonthKey } from '../utils/dates';
import { MonthlyComparisonCard } from './MonthlyComparisonCard';
import { ProgressBar } from './shared';
import type { MonthData } from '../hooks/useMonthData';
import type { MonthTotals, VariableExpense } from '../types';

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
  const [prevExpenses, setPrevExpenses] = useState<VariableExpense[]>([]);

  const prevMonth = prevMonthKey(viewMonth);

  useEffect(() => {
    let cancelled = false;
    fetchExpenses(compartmentId, prevMonth).then((pe) => {
      if (!cancelled) setPrevExpenses(pe);
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

  const weeks = weeklySums(data.expenses);
  const prevWeeks = weeklySums(prevExpenses);
  const weeklyIdeal = Math.round(viewTotals.varIdeal / 4);

  const categories = Object.entries(viewTotals.byCategory).sort(
    (a, b) => b[1].actual - a[1].actual,
  );

  return (
    <div className="stats">
      <MonthlyComparisonCard compartmentId={compartmentId} viewMonth={viewMonth} data={data} />

      <section className="card">
        <h3>Categorias em {monthLabel(viewMonth)}</h3>
        {categories.length === 0 && <p className="muted">Sem categorias neste mês.</p>}
        {categories.map(([id, c]) => (
          <div key={id} className="stat-row">
            <div className="stat-head">
              <span>
                {c.name}
                {/* Categoria ignorada: o gasto aparece aqui, mas está fora do
                    total do mês. */}
                {c.ignored && <span className="badge ignored">ignorado</span>}
              </span>
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
