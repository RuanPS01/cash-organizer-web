import { useEffect, useMemo, useState } from 'react';
import { computeTotals, listMonths } from '../services/months';
import { formatBRL } from '../utils/money';
import { monthLabel } from '../utils/dates';
import { ProgressBar } from './shared';
import type { MonthData } from '../hooks/useMonthData';
import type { MonthDoc, MonthTotals } from '../types';

function pct(actual: number, ideal: number): string {
  if (ideal <= 0) return 'sem ideal';
  return `${Math.round((actual / ideal) * 100)}%`;
}

/**
 * Card "Comparativo mensal (total gasto × ideal)": mostra os últimos meses
 * com totais (fechados usam os totais gravados; o mês visualizado é calculado
 * ao vivo). Reutilizado na tela de estatísticas e na tela de adicionar gasto.
 */
export function MonthlyComparisonCard(props: {
  compartmentId: string;
  viewMonth: string;
  data: MonthData;
}) {
  const { compartmentId, viewMonth, data } = props;
  const [months, setMonths] = useState<MonthDoc[]>([]);

  useEffect(() => {
    let cancelled = false;
    listMonths(compartmentId).then((m) => {
      if (!cancelled) setMonths(m);
    });
    return () => {
      cancelled = true;
    };
  }, [compartmentId]);

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

  return (
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
  );
}
