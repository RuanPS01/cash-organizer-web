import { useMemo } from 'react';
import { computeTotals, monthWeek } from '../services/months';
import { formatBRL } from '../utils/money';
import { monthLabel } from '../utils/dates';
import { MonthSummaryCard } from './MonthSummaryCard';
import { ProgressBar } from './shared';
import type { MonthData } from '../hooks/useMonthData';
import { MONTH_WEEKS } from '../types';
import type { MonthTotals, VariableExpense } from '../types';

function pct(actual: number, ideal: number): string {
  if (ideal <= 0) return 'sem ideal';
  return `${Math.round((actual / ideal) * 100)}%`;
}

function weeklySums(expenses: VariableExpense[]): number[] {
  const weeks = Array<number>(MONTH_WEEKS).fill(0);
  for (const e of expenses) {
    const w = Math.min(MONTH_WEEKS, Math.max(1, e.week)) - 1;
    weeks[w] += e.amount;
  }
  return weeks;
}

/**
 * Subtela de estatísticas: o resumo do mês, o uso por categoria e as semanas
 * do próprio mês visualizado, cada uma contra o ideal semanal.
 */
export function StatsView(props: { viewMonth: string; data: MonthData }) {
  const { viewMonth, data } = props;

  // Totais do mês visualizado: os fechados têm totais gravados; o aberto é
  // calculado ao vivo a partir dos dados assinados.
  const viewTotals: MonthTotals = useMemo(
    () =>
      data.month?.totals ??
      computeTotals(data.fixedEntries, data.categoryEntries, data.expenses, data.originEntries),
    [data],
  );

  const weeks = weeklySums(data.expenses);
  const weeklyIdeal = Math.round(viewTotals.varIdeal / MONTH_WEEKS);
  const currentWeek = monthWeek(data.month);
  const monthOpen = data.month?.status === 'open';

  const categories = Object.entries(viewTotals.byCategory).sort(
    (a, b) => b[1].actual - a[1].actual,
  );

  return (
    <div className="stats">
      <MonthSummaryCard viewMonth={viewMonth} data={data} />

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
        <h3>Semanas de {monthLabel(viewMonth)}</h3>
        <p className="muted small">
          Ideal semanal (variáveis): {weeklyIdeal > 0 ? formatBRL(weeklyIdeal) : 'não definido'}
        </p>
        {weeks.map((gasto, i) => (
          <div key={i} className="stat-row">
            <div className="stat-head">
              <span>
                Semana {i + 1}
                {/* A semana corrente só faz sentido no mês em aberto: nos
                    fechados todas as quatro já aconteceram. */}
                {monthOpen && i + 1 === currentWeek && (
                  <span className="badge week">atual</span>
                )}
              </span>
              <span>
                <strong>{formatBRL(gasto)}</strong>
                {weeklyIdeal > 0 && (
                  <span className="muted">
                    {' '}
                    / {formatBRL(weeklyIdeal)} · {pct(gasto, weeklyIdeal)}
                  </span>
                )}
              </span>
            </div>
            <ProgressBar
              ratio={weeklyIdeal > 0 ? gasto / weeklyIdeal : gasto > 0 ? 1 : 0}
              danger={weeklyIdeal > 0 && gasto > weeklyIdeal}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
