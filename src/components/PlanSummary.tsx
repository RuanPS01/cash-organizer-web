import { formatBRL } from '../utils/money';
import { monthLabel } from '../utils/dates';
import { formatDuration, formatRate } from '../utils/projection';
import type { Projection } from '../utils/projection';
import type { PlanDurationUnit, PlanKind } from '../types';

/**
 * Nome e explicação de cada tipo de planejamento, nas palavras da pergunta que
 * ele responde. A lista, o formulário e a visualização leem daqui.
 */
export const PLAN_KIND_TEXT: Record<PlanKind, { title: string; hint: string; badge: string }> = {
  accumulate: {
    title: 'Quanto vou juntar',
    hint: 'Guardando o mesmo valor todo mês, veja quanto terá no fim do prazo.',
    badge: 'projeção',
  },
  goal: {
    title: 'Quanto guardar por mês',
    hint: 'Defina o valor que quer alcançar e o prazo, e veja quanto guardar por mês.',
    badge: 'meta',
  },
};

/**
 * Resultado de um planejamento: o número que responde a pergunta do tipo de
 * plano (quanto vou ter, ou quanto guardar por mês) em destaque, e a
 * composição dele logo abaixo. Usado na prévia ao vivo do formulário e na
 * visualização do plano, para os dois nunca mostrarem contas diferentes.
 */
export function PlanSummary(props: {
  kind: PlanKind;
  projection: Projection;
  targetAmount: number;
  durationMonths: number;
  durationUnit: PlanDurationUnit;
  incomeTax: boolean;
}) {
  const { kind, projection, incomeTax } = props;
  const ultimo = projection.months[projection.months.length - 1];
  const prazo = formatDuration(props);
  // Com o imposto ligado, o que importa é o que sobra no resgate: o bruto
  // continua visível na composição, mas não é o número de cima.
  const valorFinal = incomeTax ? projection.netBalance : projection.grossBalance;
  const temRendimento = projection.annualRate > 0;
  const taxaMensal = ((1 + projection.annualRate) ** (1 / 12) - 1) * 10_000;

  return (
    <div className="plan-summary">
      {kind === 'accumulate' ? (
        <>
          <span className="plan-hero-label">
            {incomeTax ? 'Valor líquido no fim do prazo' : 'Valor no fim do prazo'}
          </span>
          <strong className="plan-hero">{formatBRL(valorFinal)}</strong>
          <span className="muted small">
            em {ultimo ? monthLabel(ultimo.ym) : ''}, guardando {formatBRL(projection.monthlyDeposit)}{' '}
            por mês durante {prazo}
          </span>
        </>
      ) : projection.goalReached ? (
        <>
          <span className="plan-hero-label">Guardar por mês</span>
          <strong className="plan-hero">{formatBRL(0)}</strong>
          <span className="muted small">
            O valor que já está guardado alcança a meta de {formatBRL(props.targetAmount)} sem
            depósito nenhum.
          </span>
        </>
      ) : (
        <>
          <span className="plan-hero-label">Guardar por mês</span>
          <strong className="plan-hero">{formatBRL(projection.monthlyDeposit)}</strong>
          <span className="muted small">
            para chegar a {formatBRL(props.targetAmount)}
            {incomeTax ? ' líquidos' : ''} em {ultimo ? monthLabel(ultimo.ym) : ''} ({prazo})
          </span>
        </>
      )}

      <div className="totals-grid plan-totals">
        <div>
          <span className="muted">Total depositado</span>
          <strong>{formatBRL(projection.deposited)}</strong>
        </div>
        <div>
          <span className="muted">Rendimento bruto</span>
          <strong className={temRendimento ? 'pos' : ''}>{formatBRL(projection.interest)}</strong>
        </div>
        {incomeTax && temRendimento && (
          <div>
            <span className="muted">Imposto de renda</span>
            <strong>{formatBRL(projection.tax)}</strong>
          </div>
        )}
        <div>
          <span className="muted">{incomeTax && temRendimento ? 'Saldo bruto' : 'Saldo final'}</span>
          <strong>{formatBRL(projection.grossBalance)}</strong>
        </div>
      </div>

      {temRendimento && (
        <p className="muted small plan-rate-line">
          Rendimento efetivo de {formatRate(Math.round(projection.annualRate * 10_000))} ao ano,
          ou {formatRate(Math.round(taxaMensal))} ao mês.
        </p>
      )}
    </div>
  );
}
