import { useMemo } from 'react';
import { computeTotals } from '../services/months';
import { formatBRL } from '../utils/money';
import { monthLabel } from '../utils/dates';
import { ProgressBar } from './shared';
import type { MonthData } from '../hooks/useMonthData';
import type { MonthTotals } from '../types';

function pct(actual: number, ideal: number): string {
  if (ideal <= 0) return 'sem ideal';
  return `${Math.round((actual / ideal) * 100)}%`;
}

/**
 * Resumo do mês visualizado: o total gasto contra o ideal, com a composição
 * (fixos, variáveis e o que ainda resta). É o status geral do mês em um card
 * só, reutilizado pela aba Adicionar e pela de Estatísticas.
 *
 * Mês fechado usa os totais gravados no fechamento; o mês em aberto é
 * calculado ao vivo a partir dos dados assinados.
 *
 * Com `embedded`, sai só o conteúdo, sem o card e sem o título: é assim que a
 * aba "Resumo do mês" do card de estatísticas da tela Adicionar o exibe, e
 * card dentro de card teria moldura dobrada.
 */
export function MonthSummaryCard(props: {
  viewMonth: string;
  data: MonthData;
  embedded?: boolean;
}) {
  const { viewMonth, data } = props;

  const totals: MonthTotals = useMemo(
    () =>
      data.month?.totals ??
      computeTotals(data.fixedEntries, data.categoryEntries, data.expenses, data.originEntries),
    [data],
  );

  const ideal = totals.fixedIdeal + totals.varIdeal;
  const actual = totals.fixedActual + totals.varActual;
  const restante = ideal - actual;

  const conteudo = (
    <div className="stat-row">
      <div className="stat-head">
        <span>{monthLabel(viewMonth)}</span>
        <span>
          <strong>{formatBRL(actual)}</strong>
          <span className="muted">
            {' '}
            / {formatBRL(ideal)} · {pct(actual, ideal)}
          </span>
        </span>
      </div>
      <ProgressBar
        ratio={ideal > 0 ? actual / ideal : actual > 0 ? 1 : 0}
        danger={ideal > 0 && actual > ideal}
      />
      <p className="muted small">
        Fixos {formatBRL(totals.fixedActual)} · Variáveis {formatBRL(totals.varActual)}
        {ideal > 0 &&
          (restante >= 0 ? (
            <> · Restante {formatBRL(restante)}</>
          ) : (
            <span className="neg"> · Excedido {formatBRL(-restante)}</span>
          ))}
      </p>
    </div>
  );

  if (props.embedded) return conteudo;

  return (
    <section className="card">
      <h3>Resumo do mês (total gasto × ideal)</h3>
      {conteudo}
    </section>
  );
}
