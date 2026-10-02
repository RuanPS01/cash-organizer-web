import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  addPlanFixedExpense,
  planMonthSchedule,
  removePlan,
  removePlanFixedExpense,
  setPlanFixedExpense,
} from '../services/plans';
import { projectPlanForMonth } from '../services/months';
import { formatBRL } from '../utils/money';
import { addMonthsKey, monthLabel } from '../utils/dates';
import { writeErrorMessage } from '../utils/errors';
import {
  formatDuration,
  formatPlanRate,
  projectPlan,
  remainingMonthsLabel,
} from '../utils/projection';
import type { ProjectionMonth } from '../utils/projection';
import { ConfirmModal } from './shared';
import { OriginIcon } from './OriginIcon';
import { PlanChart } from './PlanChart';
import { PLAN_KIND_TEXT, PlanSummary } from './PlanSummary';
import { IGNORED_STATUS } from '../types';
import type { FixedEntry, FixedExpense, Origin, Plan } from '../types';

/** Onde o mês em aberto cai no plano (ver `planMonthSchedule`). */
type Schedule = { index: number; total: number; planned: number };

/**
 * Inclusão do plano no gasto fixo, com a escolha da origem no mesmo formato do
 * cadastro de gasto fixo da tela Gerenciar: a padrão já vem escolhida e "Sem
 * origem" deixa o gasto sem uma. O modal avisa quando o primeiro mês do plano
 * muda, porque incluir é começar no mês em aberto.
 */
function IncludeModal(props: {
  plan: Plan;
  schedule: Schedule;
  origins: Origin[];
  currentMonth: string;
  /** O plano já foi concluído: incluir de novo recomeça do zero. */
  restart: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (origin: { originId: string | null; originName: string }) => void;
  onCancel: () => void;
}) {
  const { plan, schedule, origins } = props;
  const padrao = origins.find((o) => o.isDefault) ?? origins[0];
  const [originId, setOriginId] = useState<string | null>(padrao?.id ?? null);

  const confirm = () => {
    const origin = origins.find((o) => o.id === originId);
    props.onConfirm({ originId: origin?.id ?? null, originName: origin?.name ?? '' });
  };

  return (
    <ConfirmModal
      title="Incluir no gasto fixo?"
      confirmLabel="Incluir"
      busy={props.busy}
      onConfirm={confirm}
      onCancel={props.onCancel}
    >
      <div className="modal-form">
        <p>
          <strong>{plan.name}</strong> entra nos gastos fixos a partir de{' '}
          {monthLabel(props.currentMonth)}, como gasto fixo de planejamento de{' '}
          <strong>{formatBRL(schedule.planned)}</strong>, parcela {schedule.index} de{' '}
          {schedule.total} ({remainingMonthsLabel(schedule.index, schedule.total)}).
        </p>
        {plan.startMonth !== props.currentMonth && (
          <p className="card-hint">
            O primeiro mês do planejamento passa de {monthLabel(plan.startMonth)} para{' '}
            <strong>{monthLabel(props.currentMonth)}</strong>, e o último fica em{' '}
            {monthLabel(addMonthsKey(props.currentMonth, schedule.total - 1))}.
          </p>
        )}
        {props.restart && (
          <p className="card-hint">
            O planejamento já foi concluído: incluir de novo recomeça o curso, e o histórico dos
            meses do curso anterior é descartado.
          </p>
        )}
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
          A partir daqui o planejamento fica em curso: o gasto aparece na aba Pagamento e avança
          uma parcela a cada virada de mês. Mês pulado (Ignorar ou Sem gasto) ou pago em parte vai
          para o fim do planejamento, que prorroga o prazo e refaz a projeção do rendimento.
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

/** Mês pulado ou pago em parte: é o que aparece em vermelho. */
function isShort(m: ProjectionMonth): boolean {
  return m.state === 'partial' || m.state === 'skipped';
}

/** O depósito do mês por extenso, conforme o que aconteceu nele. */
function depositText(m: ProjectionMonth): string {
  switch (m.state) {
    case 'skipped':
      return `pulado, nada guardado (previsto ${formatBRL(m.planned)})`;
    case 'partial':
      return `guardado ${formatBRL(m.deposit)} de ${formatBRL(m.planned)}`;
    case 'paid':
      return `guardado ${formatBRL(m.deposit)}`;
    case 'assumed':
      return `${formatBRL(m.deposit)}, antes da inclusão`;
    default:
      return `depósito ${formatBRL(m.deposit)}`;
  }
}

/**
 * Subpágina de visualização do planejamento: a situação do plano em curso, o
 * resultado, o gráfico da projeção, o gasto fixo de planejamento e a listagem
 * mês a mês.
 *
 * O plano só mexe no mês depois de "Incluir no gasto fixo". A partir daí ele
 * fica em curso: os meses que já aconteceram entram na conta com o que foi
 * guardado de fato (o Pagamento diz isso), o que faltou vai para o fim, e o
 * gasto fixo acompanha a contagem. Não há saldo real informado pelo usuário: o
 * plano conta com o que foi pago, não com extrato.
 */
export function PlanView(props: {
  compartmentId: string;
  currentMonth: string;
  plan: Plan;
  /** Gasto fixo de planejamento ativo do plano, quando ele está nos gastos fixos. */
  linked: FixedExpense | null;
  /** Linha desse gasto fixo no mês em aberto. */
  line: FixedEntry | null;
  origins: Origin[];
  /** Recado vindo do formulário (o que aconteceu com o gasto fixo ao salvar). */
  notice: string | null;
  onBack: () => void;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const { compartmentId, currentMonth, plan, linked, line, origins } = props;
  const emCurso = linked !== null;
  const concluido = !emCurso && Boolean(plan.trackedFrom);
  const projection = useMemo(
    () => projectPlanForMonth(plan, currentMonth, emCurso, line),
    [plan, currentMonth, emCurso, line],
  );
  const schedule = planMonthSchedule(projection, plan.startMonth, currentMonth);
  const temRendimento = projection.annualRate > 0;
  const comImposto = plan.incomeTax && temRendimento;
  const anos = useMemo(() => groupByYear(projection.months), [projection]);
  const ultimoMes = projection.months[projection.months.length - 1];
  const trackedFrom = plan.trackedFrom ?? (emCurso ? currentMonth : null);

  // Abre o ano do mês em aberto quando ele cai no prazo; senão, o primeiro.
  const [openYears, setOpenYears] = useState<Set<string>>(
    () => new Set([schedule ? currentMonth.slice(0, 4) : plan.startMonth.slice(0, 4)]),
  );
  const [modal, setModal] = useState<'include' | 'unlink' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedOrigin = linked?.originId ? origins.find((o) => o.id === linked.originId) : undefined;
  // Com a edição fora daqui bloqueada, o gasto fixo só fica diferente do plano
  // quando uma sincronização falhou (sem rede, por exemplo) ou o mês de
  // referência foi movido. A tela mostra e oferece acertar.
  const divergente =
    linked !== null &&
    schedule !== null &&
    (linked.amount !== schedule.planned ||
      linked.installmentTotal !== schedule.total ||
      linked.installmentCurrent !== schedule.index);
  // Como o plano entra no gasto fixo se for incluído agora: o primeiro mês passa
  // a ser o mês em aberto, então ele é sempre a parcela 1 do prazo planejado.
  const inclusao = useMemo(
    () =>
      planMonthSchedule(projectPlan({ ...plan, startMonth: currentMonth }), currentMonth, currentMonth),
    [plan, currentMonth],
  );
  // Como o mês em aberto está indo, pela linha da aba Pagamento.
  const mesAtual = schedule ? projection.months[schedule.index - 1] : undefined;

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
            {emCurso && <span className="badge plan">em curso</span>}
            {concluido && <span className="badge kind">concluído</span>}{' '}
            {formatDuration(plan)} · {formatPlanRate(plan)}
            {comImposto ? ' com IR' : ''} · de {monthLabel(plan.startMonth)} a{' '}
            {monthLabel(ultimoMes.ym)}
          </span>
        </div>
      </header>

      {props.notice && <p className="flash">{props.notice}</p>}

      {(emCurso || concluido) && trackedFrom && (
        <section className="card plan-progress">
          <h3>{emCurso ? 'Planejamento em curso' : 'Planejamento concluído'}</h3>
          <p className="card-hint">
            Nos gastos fixos desde {monthLabel(trackedFrom)}
            {concluido ? `, até ${monthLabel(ultimoMes.ym)}` : ''}. A projeção abaixo usa o que foi
            pago em cada mês na aba Pagamento.
          </p>
          {projection.shortMonths > 0 ? (
            <p className="plan-progress-line neg">
              {projection.shortMonths === 1
                ? '1 mês pulado ou pago em parte.'
                : `${projection.shortMonths} meses pulados ou pagos em parte.`}{' '}
              {projection.extraMonths > 0
                ? `O que faltou foi para o fim: o prazo passou de ${monthLabel(
                    projection.originalEnd,
                  )} para ${monthLabel(ultimoMes.ym)} (${
                    projection.extraMonths === 1 ? '1 mês' : `${projection.extraMonths} meses`
                  } a mais)${temRendimento ? ', e o rendimento foi recalculado' : ''}.`
                : 'O que faltou já foi reposto dentro do prazo.'}
            </p>
          ) : (
            <p className="plan-progress-line">
              Todos os meses até agora seguiram o planejado.
            </p>
          )}
        </section>
      )}

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
        <h3>Gasto fixo de planejamento</h3>
        {linked ? (
          <>
            <p className="card-hint">
              Nos gastos fixos e na aba Pagamento, com uma parcela por mês do planejamento. Ele só
              muda por aqui: a tela Gerenciar mostra o gasto sem edição.
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
            {mesAtual && isShort(mesAtual) && (
              <p className="plan-progress-line neg">
                {monthLabel(currentMonth)}:{' '}
                {line?.status === IGNORED_STATUS || mesAtual.deposit === 0
                  ? 'marcado como pulado no Pagamento.'
                  : `pago em parte no Pagamento (${formatBRL(mesAtual.deposit)} de ${formatBRL(
                      mesAtual.planned,
                    )}).`}
              </p>
            )}
            {(linked.originId || linked.originName) && (
              <p className="plan-link-origin">
                <span className="badge origin">
                  <OriginIcon icon={linkedOrigin?.icon} color={linkedOrigin?.color} />
                  {linkedOrigin?.name ?? linked.originName}
                </span>
              </p>
            )}
            {divergente && schedule && (
              <p className="card-hint">
                O gasto fixo está diferente do planejamento ({formatBRL(schedule.planned)} neste
                mês, parcela {schedule.index} de {schedule.total}): a última atualização dele não
                chegou ao banco ou o mês de referência mudou.
              </p>
            )}
            <div className="plan-link-actions">
              {divergente && (
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      setPlanFixedExpense(compartmentId, currentMonth, plan.id, plan, linked),
                    )
                  }
                >
                  Atualizar o gasto fixo
                </button>
              )}
              <button
                type="button"
                className="btn ghost small"
                disabled={busy}
                onClick={() => openModal('unlink')}
              >
                Tirar dos gastos fixos
              </button>
            </div>
          </>
        ) : !inclusao || inclusao.planned <= 0 ? (
          <p className="card-hint">
            Não há valor mensal a guardar: o valor que já está guardado alcança a meta.
          </p>
        ) : (
          <>
            {concluido && (
              <p className="card-hint">
                O gasto fixo de planejamento terminou com a última parcela, em{' '}
                {monthLabel(ultimoMes.ym)}.
              </p>
            )}
            <p className="card-hint">
              O planejamento não mexe no mês até você incluí-lo. Incluir no gasto fixo coloca{' '}
              <strong>{formatBRL(inclusao.planned)}</strong> no mês em aberto (
              {monthLabel(currentMonth)}) como gasto fixo de planejamento, parcela 1 de{' '}
              {inclusao.total}, e o planejamento passa a estar em curso.
              {plan.startMonth !== currentMonth &&
                ` O primeiro mês do planejamento passa a ser ${monthLabel(currentMonth)}.`}
            </p>
            <button type="button" className="btn primary" onClick={() => openModal('include')}>
              <Plus size={16} aria-hidden /> {concluido ? 'Incluir no gasto fixo de novo' : 'Incluir no gasto fixo'}
            </button>
          </>
        )}
        {!modal && error && <p className="form-error">{error}</p>}
      </section>

      <section className="card plan-months">
        <h3>Mês a mês</h3>
        <p className="card-hint">
          Depósito no fim de cada mês{temRendimento ? ', com o rendimento do mês sobre o saldo' : ''}.
          {emCurso || concluido
            ? ' Os meses que já aconteceram mostram o que foi pago; em vermelho, os pulados e os pagos em parte.'
            : ' O saldo é a projeção, não o valor guardado de fato.'}
        </p>
        <ul className="plan-years">
          {anos.map((grupo) => {
            const aberto = openYears.has(grupo.year);
            const fim = grupo.months[grupo.months.length - 1];
            const curtos = grupo.months.filter(isShort).length;
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
                  {curtos > 0 && <span className="badge miss">{curtos} em falta</span>}
                  <span className="plan-year-value">{formatBRL(fim.balance)}</span>
                </button>
                {aberto && (
                  <ul className="plan-month-list">
                    {grupo.months.map((m) => {
                      const atual = m.ym === currentMonth;
                      const curto = isShort(m);
                      return (
                        <li key={m.ym} className={atual ? 'current' : ''}>
                          <span className="plan-month-name">
                            {monthLabel(m.ym)}
                            {atual && <span className="badge week">atual</span>}
                            {curto && (
                              <span className="badge miss">
                                {m.state === 'skipped' ? 'pulado' : 'parcial'}
                              </span>
                            )}
                            {m.extra && <span className="badge kind">mês extra</span>}
                          </span>
                          <span className="plan-month-meta">
                            mês {m.index} ·{' '}
                            <span className={curto ? 'neg' : ''}>{depositText(m)}</span>
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
        <button
          type="button"
          className="btn icon danger"
          title="Excluir planejamento"
          aria-label="Excluir planejamento"
          onClick={() => openModal('remove')}
        >
          <Trash2 size={16} aria-hidden />
        </button>
        <button type="button" className="btn" onClick={props.onEdit}>
          <Pencil size={15} aria-hidden /> Editar
        </button>
      </div>

      {modal === 'include' && inclusao && (
        <IncludeModal
          plan={plan}
          schedule={inclusao}
          origins={origins}
          currentMonth={currentMonth}
          restart={concluido}
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
          title="Tirar dos gastos fixos?"
          confirmLabel="Tirar dos gastos fixos"
          busy={busy}
          onConfirm={() =>
            run(() => removePlanFixedExpense(compartmentId, currentMonth, plan.id, linked.id))
          }
          onCancel={() => setModal(null)}
        >
          <p>
            O gasto fixo de planejamento <strong>{linked.name}</strong> sai do mês em aberto e dos
            próximos meses, e o planejamento deixa de estar em curso: o histórico dos meses pagos,
            pulados e parciais é descartado, e a projeção volta a ser a planejada.
          </p>
          <p className="muted small">
            O planejamento continua salvo e pode ser incluído de novo. Meses já fechados não mudam.
          </p>
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
