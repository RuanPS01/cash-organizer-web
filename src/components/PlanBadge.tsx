import { PiggyBank } from 'lucide-react';
import { remainingMonthsLabel } from '../utils/projection';

/**
 * Selo do gasto fixo de planejamento: diz que a conta veio de um planejamento
 * e quantos meses ainda faltam depois deste. Aparece nas três listas de gasto
 * fixo (tela Gerenciar, aba Pagamento e histórico do mês), ao lado do selo da
 * parcela, que continua sendo o mesmo de qualquer gasto parcelado.
 */
export function PlanBadge(props: { current?: number | null; total?: number | null }) {
  const { current, total } = props;
  return (
    <span className="badge plan" title="Gasto fixo de planejamento">
      <PiggyBank size={12} aria-hidden />
      planejamento
      {total ? ` · ${remainingMonthsLabel(current ?? 1, total)}` : ''}
    </span>
  );
}
