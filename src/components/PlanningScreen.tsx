import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Coins, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePlans } from '../hooks/useMonthData';
import type { MonthData } from '../hooks/useMonthData';
import type { PlanFixedSync } from '../services/plans';
import { projectPlanForMonth } from '../services/months';
import { formatBRL } from '../utils/money';
import { monthLabel } from '../utils/dates';
import { formatDuration, formatPlanRate } from '../utils/projection';
import { PLAN_KIND_TEXT } from './PlanSummary';
import { PlanForm } from './PlanForm';
import { PlanView } from './PlanView';
import { PLAN_KINDS } from '../types';
import type { FixedEntry, FixedExpense, Origin, Plan, PlanKind } from '../types';

const PLAN_KIND_ICON: Record<PlanKind, LucideIcon> = {
  accumulate: Coins,
  goal: Target,
};

/**
 * Subpágina aberta na aba. Não há router no app, então a navegação entre a
 * lista, o formulário e a visualização é estado da tela; sair da aba volta
 * para a lista.
 */
type Page =
  | { kind: 'list' }
  | { kind: 'form'; planKind: PlanKind; planId: string | null }
  | { kind: 'view'; planId: string };

/** Recado de quando o plano salvo estava no mês como gasto fixo de planejamento. */
const SYNC_NOTICE: Record<PlanFixedSync, string | null> = {
  none: null,
  updated: 'Planejamento salvo. O gasto fixo de planejamento foi atualizado junto.',
  removed:
    'Planejamento salvo. Não há mais valor a guardar no mês em aberto, e o gasto fixo de planejamento saiu dos gastos fixos.',
};

/**
 * Linha da lista: o número que responde a pergunta de cada tipo de plano, já
 * com o que aconteceu nos meses quando o plano está em curso.
 */
function PlanListItem(props: {
  plan: Plan;
  currentMonth: string;
  linked: boolean;
  line: FixedEntry | null;
  onOpen: () => void;
}) {
  const { plan } = props;
  const projection = useMemo(
    () => projectPlanForMonth(plan, props.currentMonth, props.linked, props.line),
    [plan, props.currentMonth, props.linked, props.line],
  );
  const fim = projection.months[projection.months.length - 1];
  const comImposto = plan.incomeTax && projection.annualRate > 0;
  const Icon = PLAN_KIND_ICON[plan.kind];
  return (
    <li>
      <button type="button" className="plan-item" onClick={props.onOpen}>
        <span className="plan-item-icon" aria-hidden>
          <Icon size={18} />
        </span>
        <span className="plan-item-text">
          <span className="plan-item-name">
            {plan.name}
            <span className="badge kind">{PLAN_KIND_TEXT[plan.kind].badge}</span>
            {props.linked ? (
              <span className="badge plan">em curso</span>
            ) : plan.trackedFrom ? (
              <span className="badge kind">concluído</span>
            ) : null}
          </span>
          <span className="plan-item-meta">
            {plan.kind === 'accumulate'
              ? `${formatBRL(plan.monthlyAmount)} por mês`
              : `meta de ${formatBRL(plan.targetAmount)}`}{' '}
            · {formatDuration(plan)} · {formatPlanRate(plan)}
          </span>
          {projection.extraMonths > 0 && fim && (
            <span className="plan-item-meta neg">
              fim em {monthLabel(fim.ym)}, {projection.extraMonths}{' '}
              {projection.extraMonths === 1 ? 'mês' : 'meses'} a mais
            </span>
          )}
        </span>
        <span className="plan-item-value">
          {plan.kind === 'accumulate' ? (
            <>
              <strong>{formatBRL(comImposto ? projection.netBalance : projection.grossBalance)}</strong>
              <span className="muted">no fim</span>
            </>
          ) : (
            <>
              <strong>{formatBRL(projection.monthlyDeposit)}</strong>
              <span className="muted">por mês</span>
            </>
          )}
        </span>
        <ChevronRight size={16} className="plan-item-chevron" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Aba Planejamento: projeções no tempo do que se guarda por mês. A lista é a
 * página inicial da aba, com os dois tipos de plano para criar em cima; o
 * formulário e a visualização são subpáginas dela.
 */
export function PlanningScreen(props: {
  compartmentId: string;
  currentMonth: string;
  /** Cadastro de gastos fixos ativos: é por ele que o plano sabe se está no mês. */
  fixedExpenses: FixedExpense[];
  origins: Origin[];
  /** Mês em aberto: é a linha do gasto fixo de planejamento que diz como o mês está indo. */
  monthData: MonthData;
}) {
  const { compartmentId, currentMonth, fixedExpenses, origins, monthData } = props;
  const { loading, plans } = usePlans(compartmentId);
  const [page, setPage] = useState<Page>({ kind: 'list' });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  // O vínculo mora no gasto fixo (`planId`), e o cadastro só traz os ativos:
  // gasto fixo removido ou que chegou à última parcela já não conta como no mês.
  const linkedByPlan = useMemo(() => {
    const mapa = new Map<string, FixedExpense>();
    for (const f of fixedExpenses) if (f.planId) mapa.set(f.planId, f);
    return mapa;
  }, [fixedExpenses]);

  // A linha do mês em aberto de cada plano em curso: pulada ou paga em parte, ela
  // já muda a projeção antes de o mês virar.
  const lineByFixed = useMemo(
    () => new Map(monthData.fixedEntries.map((f) => [f.id, f])),
    [monthData.fixedEntries],
  );
  const lineOf = (plan: Plan) => {
    const linked = linkedByPlan.get(plan.id);
    return linked ? (lineByFixed.get(linked.id) ?? null) : null;
  };

  // A subpágina guarda só o id: o plano vem da assinatura, então a tela mostra
  // na hora o que foi salvo (aqui ou em outro aparelho).
  const pagePlan =
    page.kind !== 'list' && page.planId ? (plans.find((p) => p.id === page.planId) ?? null) : null;

  // Plano que sumiu da lista (excluído em outro aparelho) leva de volta à lista:
  // a edição dele, sem o plano, viraria a criação de um plano novo.
  useEffect(() => {
    if (page.kind !== 'list' && page.planId && !loading && !pagePlan) setPage({ kind: 'list' });
  }, [page, loading, pagePlan]);

  const scrollTop = () => window.scrollTo({ top: 0 });
  const go = (next: Page) => {
    setPage(next);
    scrollTop();
  };

  if (page.kind === 'form') {
    return (
      <PlanForm
        // A chave recria o formulário ao trocar de plano, para o estado inicial
        // vir do plano certo.
        key={page.planId ?? `novo-${page.planKind}`}
        compartmentId={compartmentId}
        currentMonth={currentMonth}
        kind={pagePlan?.kind ?? page.planKind}
        initial={pagePlan}
        linked={pagePlan ? (linkedByPlan.get(pagePlan.id) ?? null) : null}
        line={pagePlan ? lineOf(pagePlan) : null}
        onSaved={(id, sync) => {
          setNotice(SYNC_NOTICE[sync] ?? 'Planejamento salvo.');
          go({ kind: 'view', planId: id });
        }}
        onCancel={() => go(page.planId ? { kind: 'view', planId: page.planId } : { kind: 'list' })}
      />
    );
  }

  if (page.kind === 'view' && pagePlan) {
    return (
      <PlanView
        key={pagePlan.id}
        compartmentId={compartmentId}
        currentMonth={currentMonth}
        plan={pagePlan}
        linked={linkedByPlan.get(pagePlan.id) ?? null}
        line={lineOf(pagePlan)}
        origins={origins}
        notice={notice}
        onBack={() => go({ kind: 'list' })}
        onEdit={() => go({ kind: 'form', planKind: pagePlan.kind, planId: pagePlan.id })}
        onRemoved={() => go({ kind: 'list' })}
      />
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h2 className="h2-gold">Planejamento</h2>
      </header>

      <section className="card">
        <h3>Novo planejamento</h3>
        <p className="card-hint">
          Projete no tempo o que você guarda por mês, com rendimento de renda fixa opcional. O
          planejamento não mexe no mês até você tocar em "Incluir no gasto fixo" na tela dele; a
          partir daí ele fica em curso e acompanha o que foi pago a cada mês.
        </p>
        <div className="plan-kinds">
          {PLAN_KINDS.map((kind) => {
            const Icon = PLAN_KIND_ICON[kind];
            return (
              <button
                key={kind}
                type="button"
                className="plan-kind-option"
                onClick={() => go({ kind: 'form', planKind: kind, planId: null })}
              >
                <span className="plan-kind-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <span className="plan-kind-title">{PLAN_KIND_TEXT[kind].title}</span>
                <span className="plan-kind-hint">{PLAN_KIND_TEXT[kind].hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>Seus planejamentos</h3>
        {loading ? (
          <p className="muted">Carregando…</p>
        ) : plans.length === 0 ? (
          <p className="muted">
            Nenhum planejamento ainda. Escolha um dos tipos acima para criar o primeiro.
          </p>
        ) : (
          <ul className="plan-list">
            {plans.map((p) => (
              <PlanListItem
                key={p.id}
                plan={p}
                currentMonth={currentMonth}
                linked={linkedByPlan.has(p.id)}
                line={lineOf(p)}
                onOpen={() => go({ kind: 'view', planId: p.id })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
