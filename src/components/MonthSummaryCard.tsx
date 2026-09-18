import { useMemo } from 'react';
import { computeTotals } from '../services/months';
import { formatBRL } from '../utils/money';
import { monthLabel } from '../utils/dates';
import { ProgressBar } from './shared';
import type { MonthData } from '../hooks/useMonthData';
import type { MonthTotals } from '../types';

function pct(actual: number, reference: number): string {
  if (reference <= 0) return 'sem referência';
  return `${Math.round((actual / reference) * 100)}%`;
}

/**
 * Resumo do mês visualizado: o total gasto contra a referência do mês, com a
 * composição (fixos, variáveis e o que ainda resta). É o status geral do mês
 * em um card só, reutilizado pela aba Adicionar e pela de Estatísticas.
 *
 * A referência é a renda líquida do mês quando ela está informada, porque é a
 * renda que responde "quanto sobrou": gasto fixo novo aumenta o gasto sem
 * aumentar a renda, e o restante cai na hora. Sem renda informada, a
 * referência volta a ser o ideal planejado (fixos mais o ideal das
 * categorias), que é como o mês era lido antes de a renda existir.
 *
 * A barra mostra a composição do gasto: ouro para os fixos, prata para os
 * variáveis, com a legenda na própria linha de detalhe abaixo.
 *
 * Mês fechado usa os totais gravados no fechamento e a renda gravada no mês; o
 * mês em aberto é calculado ao vivo a partir dos dados assinados.
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

  // Renda do mês visualizado, e não a do cadastro: mudar a renda hoje não pode
  // reescrever o restante de um mês que já fechou.
  const income = data.month?.income ?? 0;
  const ideal = totals.fixedIdeal + totals.varIdeal;
  const actual = totals.fixedActual + totals.varActual;
  const reference = income > 0 ? income : ideal;
  const restante = reference - actual;

  const conteudo = (
    <div className="stat-row">
      <div className="stat-head">
        <span>{monthLabel(viewMonth)}</span>
        <span>
          <strong>{formatBRL(actual)}</strong>
          <span className="muted">
            {' '}
            / {formatBRL(reference)} · {pct(actual, reference)}
          </span>
        </span>
      </div>
      <ProgressBar
        ratio={reference > 0 ? actual / reference : actual > 0 ? 1 : 0}
        danger={reference > 0 && actual > reference}
        parts={
          reference > 0
            ? [
                { key: 'fixos', ratio: totals.fixedActual / reference, tone: 'gold' },
                { key: 'variaveis', ratio: totals.varActual / reference, tone: 'silver' },
              ]
            : undefined
        }
      />
      <p className="muted small summary-detail">
        <span className="legend-item">
          <span className="legend-dot gold" aria-hidden /> Fixos {formatBRL(totals.fixedActual)}
        </span>
        <span className="legend-item">
          <span className="legend-dot silver" aria-hidden /> Variáveis{' '}
          {formatBRL(totals.varActual)}
        </span>
        {reference > 0 && (
          <span className={restante >= 0 ? 'legend-item' : 'legend-item neg'}>
            {restante >= 0 ? 'Restante' : 'Acima'} {income > 0 ? 'da renda' : 'do ideal'}{' '}
            {formatBRL(Math.abs(restante))}
          </span>
        )}
      </p>
    </div>
  );

  if (props.embedded) return conteudo;

  return (
    <section className="card">
      <h3>Resumo do mês (total gasto × {income > 0 ? 'renda' : 'ideal'})</h3>
      {conteudo}
    </section>
  );
}
