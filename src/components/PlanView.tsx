import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { addPlanFixedExpense, removePlan, setPlanFixedExpense } from '../services/plans';
import { removeFixedExpense } from '../services/expenses';
import { formatBRL } from '../utils/money';
import { monthLabel } from '../utils/dates';
import { writeErrorMessage } from '../utils/errors';
import {
  formatDuration,
  formatPlanRate,
  planMonthPosition,
  projectPlan,
  remainingMonthsLabel,
} from '../utils/projection';
import type { ProjectionMonth } from '../utils/projection';
import { ConfirmModal } from './shared';
import { OriginIcon } from './OriginIcon';
import { PlanChart } from './PlanChart';
import { PLAN_KIND_TEXT, PlanSummary } from './PlanSummary';
import type { FixedExpense, Origin, Plan } from '../types';

/**
 * Escolha da origem do gasto fixo de planejamento, no mesmo formato do cadastro
 * de gasto fixo da tela Gerenciar: a padrão já vem escolhida e "Sem origem"
 * deixa o gasto sem uma.
 */
function IncludeModal(props: {
  plan: Plan;
  deposit: number;
  index: number;
  origins: Origin[];
  currentMonth: string;
  busy: boolean;
  error: string | null;
  onConfirm: (origin: { originId: string | null; originName: string }) => void;
  onCancel: () => void;
}) {
  const { origins } = props;
  const padrao = origins.find((o) => o.isDefault) ?? origins[0];
  const [originId, setOriginId] = useState<string | null>(padrao?.id ?? null);

  const confirm = () => {
    const origin = origins.find((o) => o.id === originId);
    props.onConfirm({ originId: origin?.id ?? null, originName: origin?.name ?? '' });
  };

  return (
    <ConfirmModal
      title="Incluir no mês?"
      confirmLabel="Incluir"
      busy={props.busy}
      onConfirm={confirm}
      onCancel={props.onCancel}
    >
      <div className="modal-form">
        <p>
          <strong>{props.plan.name}</strong> entra em {monthLabel(props.currentMonth)} como gasto
          fixo de planejamento de <strong>{formatBRL(props.deposit)}</strong>, parcela{' '}
          {props.index} de {props.plan.durationMonths} (
          {remainingMonthsLabel(props.index, props.plan.durationMonths)}).
        </p>
        {origins.length > 0 && (
          <div className="origin-picker">
            <span className="origin-label">De onde sai o dinheiro</span>
            <div className="chip-row" role="radiogroup" aria-label="Origem do gasto fixo">
              {origins.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={originId === o.id}
                  className={`chip${originId === o.id ? ' selected' : ''}`}
                  onClick={() => setOriginId(o.id)}
                >
                  <OriginIcon icon={o.icon} color={o.color} />
                  {o.name}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={originId === null}
                className={`chip${originId === null ? ' selected' : ''}`}
                onClick={() => setOriginId(null)}
              >
                Sem origem
              </button>
            </div>
          </div>
        )}
        <p className="card-hint">
          A partir daqui ele é um gasto fixo como os outros: aparece na aba Pagamento, avança a
          parcela a cada virada de mês e sai sozinho depois da última.
        </p>
        {props.error && <p className="form-error">{props.error}</p>}
      </div>
    </ConfirmModal>
  );
}

/** Os meses da projeção agrupados por ano, na ordem do plano. */
function groupByYear(months: ProjectionMonth[]): { year: string; months: ProjectionMonth[] }[] {
  const grupos: { year: string; months: ProjectionMonth[] }[] = [];
  for (const m of months) {
    const year = m.ym.slice(0, 4);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.year === year) ultimo.months.push(m);
    else grupos.push({ year, months: [m] });
  }
  return grupos;
}

/**
 * Subpágina de visualização do planejamento: o resultado, o gráfico da
 * projeção, a inclusão do valor mensal no mês em aberto e a listagem mês a mês.
 *
 * Não existe saldo real acompanhado aqui, e isso é de propósito: o app é de
 * controle do mês, e o plano é a conta do que acontece se o valor for guardado
 * todo mês. O vínculo com o mês é o gasto fixo de planejamento.
 */
export function PlanView(props: {
  compartmentId: string;
  currentMonth: string;
  plan: Plan;
  /** Gasto fixo de planejamento ativo do plano, quando ele está no mês. */
  linked: FixedExpense | null;
  origins: Origin[];
  /** Recado vindo do formulário (o que aconteceu com o gasto fixo ao salvar). */
  notice: string | null;
  onBack: () => void;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const { compartmentId, currentMonth, plan, linked, origins } = props;
  const projection = useMemo(() => projectPlan(plan), [plan]);
  const position = planMonthPosition(plan, currentMonth);
  const deposit = projection.monthlyDeposit;
  const temRendimento = projection.annualRate > 0;
  const comImposto = plan.incomeTax && temRendimento;
  const anos = useMemo(() => groupByYear(projection.months), [projection]);
  const ultimoMes = projection.months[projection.months.length - 1];

  // Abre o ano do mês em aberto quando ele cai no prazo; senão, o primeiro.
  const [openYears, setOpenYears] = useState<Set<string>>(
    () => new Set([position.kind === 'during' ? currentMonth.slice(0, 4) : plan.startMonth.slice(0, 4)]),
  );
  const [modal, setModal] = useState<'include' | 'unlink' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedOrigin = linked?.originId ? origins.find((o) => o.id === linked.originId) : undefined;
  // O valor do gasto fixo pode ter sido ajustado à mão na tela Gerenciar ou o
  // mês de referência pode ter sido movido; nesses casos a tela mostra a
  // diferença e oferece voltar ao planejado, sem corrigir sozinha.
  const divergente =
    linked !== null &&
    (linked.amount !== deposit ||
      linked.installmentTotal !== plan.durationMonths ||
      (position.kind === 'during' && linked.installmentCurrent !== position.index));

  const toggleYear = (year: string) =>
    setOpenYears((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(year)) proximo.add(year);
      return proximo;
    });

  const run = async (acao: () => Promise<unknown>, depois?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await acao();
      setModal(null);
      depois?.();
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openModal = (alvo: 'include' | 'unlink' | 'remove') => {
    setError(null);
    setModal(alvo);
  };

  return (
    <div className="screen">
      <header className="subpage-header">
        <button type="button" className="btn icon" aria-label="Voltar" onClick={props.onBack}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="subpage-title">
          <h2 className="h2-gold">{plan.name}</h2>
          <span className="muted small">
            <span className="badge kind">{PLAN_KIND_TEXT[plan.kind].badge}</span>{' '}
            {formatDuration(plan)} · {formatPlanRate(plan)}
            {comImposto ? ' com IR' : ''} · de {monthLabel(plan.startMonth)} a{' '}
            {monthLabel(ultimoMes.ym)}
          </span>
        </div>
      </header>

      {props.notice && <p className="flash">{props.notice}</p>}

      <section className="card">
        <h3>Resultado</h3>
        <PlanSummary
          kind={plan.kind}
          projection={projection}
          targetAmount={plan.targetAmount}
          durationMonths={plan.durationMonths}
          durationUnit={plan.durationUnit}
          incomeTax={comImposto}
        />
      </section>

      <section className="card">
        <h3>{temRendimento ? 'Projeção do saldo' : 'Projeção do total guardado'}</h3>
        <PlanChart months={projection.months} showDeposited={temRendimento} />
      </section>

      <section className="card plan-link">
        <h3>No mês</h3>
        {linked ? (
          <>
            <p className="card-hint">
              Está em {monthLabel(currentMonth)} como <strong>gasto fixo de planejamento</strong>,
              e avança uma parcela a cada virada de mês.
            </p>
            <div className="section-totals">
              <span>
                <span className="muted small">Valor no mês</span>
                <strong>{formatBRL(linked.amount)}</strong>
              </span>
              {linked.installmentTotal ? (
                <span>
                  <span className="muted small">Parcela</span>
                  <strong>
                    {linked.installmentCurrent ?? 1} de {linked.installmentTotal}
                  </strong>
                </span>
              ) : null}
              {linked.installmentTotal ? (
                <span>
                  <span className="muted small">Depois deste mês</span>
                  <strong>
                    {remainingMonthsLabel(linked.installmentCurrent ?? 1, linked.installmentTotal)}
                  </strong>
                </span>
              ) : null}
            </div>
            {(linked.originId || linked.originName) && (
              <p className="plan-link-origin">
                <span className="badge origin">
                  <OriginIcon icon={linkedOrigin?.icon} color={linkedOrigin?.color} />
                  {linkedOrigin?.name ?? linked.originName}
                </span>
              </p>
            )}
            {divergente && (
              <p className="card-hint">
                O gasto fixo está diferente do planejado ({formatBRL(deposit)} por mês
                {position.kind === 'during'
                  ? `, parcela ${position.index} de ${plan.durationMonths}`
                  : ''}
                ): ele foi ajustado na tela Gerenciar ou o mês de referência mudou.
              </p>
            )}
            <div className="plan-link-actions">
              {divergente && (
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() =>
                    run(() => setPlanFixedExpense(compartmentId, currentMonth, plan.id, plan, linked))
                  }
                >
                  Usar o valor planejado
                </button>
              )}
              <button
                type="button"
                className="btn ghost small"
                disabled={busy}
                onClick={() => openModal('unlink')}
              >
                Tirar do mês
              </button>
            </div>
          </>
        ) : deposit <= 0 ? (
          <p className="card-hint">
            Não há valor mensal a guardar: o valor que já está guardado alcança a meta.
          </p>
        ) : position.kind === 'before' ? (
          <p className="card-hint">
            O planejamento começa em {monthLabel(plan.startMonth)}. A inclusão no mês fica
            disponível quando o mês em aberto chegar lá, ou ao mudar o primeiro mês na edição.
          </p>
        ) : position.kind === 'after' ? (
          <p className="card-hint">
            O prazo deste planejamento terminou em {monthLabel(ultimoMes.ym)}.
          </p>
        ) : (
          <>
            <p className="card-hint">
              Inclua <strong>{formatBRL(deposit)}</strong> no mês em aberto (
              {monthLabel(currentMonth)}) como gasto fixo de planejamento: ele entra como parcela{' '}
              {position.index} de {plan.durationMonths} ({remainingMonthsLabel(position.index, plan.durationMonths)}),
              avança sozinho a cada virada de mês e sai depois da última.
            </p>
            <button type="button" className="btn primary" onClick={() => openModal('include')}>
              <Plus size={16} aria-hidden /> Incluir no mês
            </button>
          </>
        )}
        {!modal && error && <p className="form-error">{error}</p>}
      </section>

      <section className="card plan-months">
        <h3>Mês a mês</h3>
        <p className="card-hint">
          Depósito no fim de cada mês{temRendimento ? ', com o rendimento do mês sobre o saldo' : ''}.
          O saldo é a projeção, não o valor guardado de fato.
        </p>
        <ul className="plan-years">
          {anos.map((grupo) => {
            const aberto = openYears.has(grupo.year);
            const fim = grupo.months[grupo.months.length - 1];
            return (
              <li key={grupo.year} className="plan-year">
                <button
                  type="button"
                  className={`plan-year-head${aberto ? ' open' : ''}`}
                  aria-expanded={aberto}
                  onClick={() => toggleYear(grupo.year)}
                >
                  <ChevronDown size={15} className="plan-collapse-chevron" aria-hidden />
                  <strong>{grupo.year}</strong>
                  <span className="muted small">
                    {grupo.months.length === 1 ? '1 mês' : `${grupo.months.length} meses`}
                  </span>
                  <span className="plan-year-value">{formatBRL(fim.balance)}</span>
                </button>
                {aberto && (
                  <ul className="plan-month-list">
                    {grupo.months.map((m) => {
                      const atual = m.ym === currentMonth;
                      return (
                        <li key={m.ym} className={atual ? 'current' : ''}>
                          <span className="plan-month-name">
                            {monthLabel(m.ym)}
                            {atual && <span className="badge week">atual</span>}
                          </span>
                          <span className="plan-month-meta">
                            mês {m.index} · depósito {formatBRL(m.deposit)}
                            {temRendimento ? ` · rendimento ${formatBRL(m.interest)}` : ''}
                          </span>
                          <span className="plan-month-value">{formatBRL(m.balance)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="plan-actions">
        <button type="button" className="btn icon danger" title="Excluir planejamento" aria-label="Excluir planejamento" onClick={() => openModal('remove')}>
          <Trash2 size={16} aria-hidden />
        </button>
        <button type="button" className="btn" onClick={props.onEdit}>
          <Pencil size={15} aria-hidden /> Editar
        </button>
      </div>

      {modal === 'include' && position.kind === 'during' && (
        <IncludeModal
          plan={plan}
          deposit={deposit}
          index={position.index}
          origins={origins}
          currentMonth={currentMonth}
          busy={busy}
          error={error}
          onConfirm={(origin) =>
            run(() => addPlanFixedExpense(compartmentId, currentMonth, plan, origin))
          }
          onCancel={() => setModal(null)}
        />
      )}

      {modal === 'unlink' && linked && (
        <ConfirmModal
          title="Tirar do mês?"
          confirmLabel="Tirar do mês"
          busy={busy}
          onConfirm={() => run(() => removeFixedExpense(compartmentId, currentMonth, linked.id))}
          onCancel={() => setModal(null)}
        >
          <p>
            O gasto fixo de planejamento <strong>{linked.name}</strong> sai do mês em aberto e dos
            próximos meses. O planejamento continua salvo e pode ser incluído de novo.
          </p>
          <p className="muted small">Meses já fechados não mudam.</p>
          {error && <p className="form-error">{error}</p>}
        </ConfirmModal>
      )}

      {modal === 'remove' && (
        <ConfirmModal
          title="Excluir planejamento?"
          confirmLabel="Excluir"
          busy={busy}
          onConfirm={() =>
            run(() => removePlan(compartmentId, currentMonth, plan.id, linked), props.onRemoved)
          }
          onCancel={() => setModal(null)}
        >
          <p>
            <strong>{plan.name}</strong> sai da lista de planejamentos.
          </p>
          {linked && (
            <p>
              O gasto fixo de planejamento dele também sai do mês em aberto e dos próximos meses.
            </p>
          )}
          <p className="muted small">Meses já fechados não mudam.</p>
          {error && <p className="form-error">{error}</p>}
        </ConfirmModal>
      )}
    </div>
  );
}
