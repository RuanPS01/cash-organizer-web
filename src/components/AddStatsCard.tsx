import { useMemo, useState } from 'react';
import { CalendarSync } from 'lucide-react';
import { monthWeek, setCurrentWeek } from '../services/months';
import type { ViewPrefs } from '../services/compartments';
import { formatBRL } from '../utils/money';
import { dayKey, isSunday } from '../utils/dates';
import { writeErrorMessage } from '../utils/errors';
import { ConfirmModal, ProgressBar } from './shared';
import { MonthSummaryCard } from './MonthSummaryCard';
import type { MonthData } from '../hooks/useMonthData';
import { MONTH_WEEKS } from '../types';
import type { Category, Origin } from '../types';

/** Gasto acompanhado de uma categoria ou de uma origem no mês e na semana. */
interface Acompanhamento {
  ideal: number;
  weeklyIdeal: number;
  spentWeek: number;
  spentMonth: number;
}

/**
 * Restante da semana e do mês do que está sendo acompanhado, com as barras.
 * É o mesmo bloco para a categoria e para a origem: os dois comparam gasto
 * contra ideal, e só muda de onde vem o número.
 */
function AcompanhamentoRows(props: { info: Acompanhamento }) {
  const { ideal, weeklyIdeal, spentWeek, spentMonth } = props.info;
  const remainingWeek = weeklyIdeal - spentWeek;
  const remainingMonth = ideal - spentMonth;
  return (
    <>
      <div className="info-row">
        <span>Semana ({formatBRL(weeklyIdeal)}/sem)</span>
        <strong className={remainingWeek < 0 ? 'neg' : ''}>
          {remainingWeek >= 0
            ? `restam ${formatBRL(remainingWeek)}`
            : `${formatBRL(-remainingWeek)} acima`}
        </strong>
      </div>
      <ProgressBar ratio={weeklyIdeal > 0 ? spentWeek / weeklyIdeal : 0} />
      <div className="info-row">
        <span>Mês ({formatBRL(ideal)} ideal)</span>
        <strong className={remainingMonth < 0 ? 'neg' : ''}>
          {remainingMonth >= 0
            ? `restam ${formatBRL(remainingMonth)}`
            : `${formatBRL(-remainingMonth)} acima`}
        </strong>
      </div>
      <ProgressBar ratio={ideal > 0 ? spentMonth / ideal : 0} />
    </>
  );
}

/**
 * Card de estatísticas da aba Adicionar: a semana corrente com o botão de
 * virar e três abas de leitura (resumo do mês, gasto por categoria e gasto por
 * origem). A aba escolhida e o que cada uma acompanha ficam gravados no
 * compartimento, então a tela reabre como o usuário deixou.
 *
 * A semana e o aviso de domingo ficam fora das abas de propósito: o lembrete
 * de virar a semana não pode depender de o usuário estar na aba certa.
 */
export function AddStatsCard(props: {
  compartmentId: string;
  currentMonth: string;
  categories: Category[];
  origins: Origin[];
  data: MonthData;
  prefs: ViewPrefs;
  onPrefsChange: (patch: Partial<ViewPrefs>) => void;
}) {
  const { compartmentId, currentMonth, categories, origins, data, prefs } = props;
  const [busy, setBusy] = useState(false);
  const [confirmWeek, setConfirmWeek] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  // A semana é do mês, não do calendário: ela vira no botão, não no dia 8.
  const currentWeek = monthWeek(data.month);
  const monthOpen = data.month?.status === 'open';
  const canTurnWeek = monthOpen && currentWeek < MONTH_WEEKS;
  // No domingo o app lembra de virar a semana, mas não insiste depois que ela
  // já virou no mesmo dia.
  const turnedToday =
    data.month?.weekChangedAt !== undefined &&
    dayKey(new Date(data.month.weekChangedAt)) === dayKey();
  const suggestTurn = canTurnWeek && isSunday() && !turnedToday;

  // Sem origem cadastrada a aba de origem não tem o que mostrar, então some e
  // a leitura cai no resumo do mês, que é o padrão do card.
  const hasOrigins = origins.length > 0;
  const tab = prefs.addStatsTab === 'origin' && !hasOrigins ? 'month' : prefs.addStatsTab;

  // O card tem categoria e origem próprias: os chips de cima escolhem onde o
  // gasto entra, estes seletores escolhem o que olhar. Sem escolha guardada,
  // vale a padrão de cada cadastro.
  const viewCategory =
    categories.find((c) => c.id === prefs.weekCategoryId) ??
    categories.find((c) => c.isDefault) ??
    categories[0] ??
    null;
  const viewOrigin =
    origins.find((o) => o.id === prefs.weekOriginId) ??
    origins.find((o) => o.isDefault) ??
    origins[0] ??
    null;

  const categoryInfo: Acompanhamento = useMemo(() => {
    const entry = data.categoryEntries.find((c) => c.id === viewCategory?.id);
    const ideal = entry?.idealAmount ?? viewCategory?.idealAmount ?? 0;
    const lancamentos = data.expenses.filter((e) => e.categoryId === viewCategory?.id);
    return {
      ideal,
      weeklyIdeal: Math.round(ideal / MONTH_WEEKS),
      spentMonth: lancamentos.reduce((s, e) => s + e.amount, 0),
      spentWeek: lancamentos
        .filter((e) => e.week === currentWeek)
        .reduce((s, e) => s + e.amount, 0),
    };
  }, [data.categoryEntries, data.expenses, viewCategory, currentWeek]);

  // O gasto do mês da origem é o mesmo total da aba Pagamento (os gastos fixos
  // dela mais os lançamentos variáveis), para as duas telas não discordarem. A
  // semana só pode contar os lançamentos: gasto fixo é do mês inteiro e não
  // tem semana, e é por isso que a linha de aviso abaixo existe.
  const originInfo = useMemo(() => {
    const entry = data.originEntries.find((o) => o.id === viewOrigin?.id);
    const ideal = entry?.idealAmount ?? viewOrigin?.idealAmount ?? 0;
    const lancamentos = data.expenses.filter((e) => e.originId === viewOrigin?.id);
    const fixed = viewOrigin
      ? data.fixedEntries
          .filter((f) => f.originId === viewOrigin.id)
          .reduce((s, f) => s + f.amount, 0)
      : 0;
    return {
      ideal,
      weeklyIdeal: Math.round(ideal / MONTH_WEEKS),
      spentMonth: fixed + lancamentos.reduce((s, e) => s + e.amount, 0),
      spentWeek: lancamentos
        .filter((e) => e.week === currentWeek)
        .reduce((s, e) => s + e.amount, 0),
      fixed,
    };
  }, [data.originEntries, data.expenses, data.fixedEntries, viewOrigin, currentWeek]);

  const turnWeek = async () => {
    if (!canTurnWeek || busy) return;
    setBusy(true);
    setWeekError(null);
    try {
      await setCurrentWeek(compartmentId, currentMonth, currentWeek + 1);
      setConfirmWeek(false);
    } catch (err) {
      setWeekError(writeErrorMessage(err));
      setConfirmWeek(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    // O modal fica fora do .card de propósito: clip-path recorta qualquer
    // descendente, inclusive position: fixed.
    <>
      <section className="info card">
        <div className="info-head">
          <h3>Semana {currentWeek}</h3>
          <button
            type="button"
            className="btn small"
            disabled={!canTurnWeek || busy}
            title={
              currentWeek >= MONTH_WEEKS
                ? 'Última semana do mês: a semana 1 volta ao virar o mês'
                : `Passar para a semana ${currentWeek + 1}`
            }
            onClick={() => setConfirmWeek(true)}
          >
            <CalendarSync size={15} aria-hidden /> Virar semana
          </button>
        </div>

        {suggestTurn && (
          <p className="week-hint">
            Hoje é domingo. Se a sua semana virou, toque em "Virar semana" para os próximos
            gastos entrarem na semana {currentWeek + 1}.
          </p>
        )}
        {weekError && <p className="form-error">{weekError}</p>}

        <div className="subtabs stats-tabs" role="tablist" aria-label="Estatísticas do mês">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'month'}
            className={`subtab${tab === 'month' ? ' active' : ''}`}
            onClick={() => props.onPrefsChange({ addStatsTab: 'month' })}
          >
            Resumo do mês
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'category'}
            className={`subtab stacked${tab === 'category' ? ' active' : ''}`}
            onClick={() => props.onPrefsChange({ addStatsTab: 'category' })}
          >
            Gasto por Categoria
            <span className="subtab-week">Semana {currentWeek}</span>
          </button>
          {hasOrigins && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'origin'}
              className={`subtab stacked${tab === 'origin' ? ' active' : ''}`}
              onClick={() => props.onPrefsChange({ addStatsTab: 'origin' })}
            >
              Gasto por Origem
              <span className="subtab-week">Semana {currentWeek}</span>
            </button>
          )}
        </div>

        {/* Qualquer valor fora das três abas cai no resumo, que é o padrão. */}
        {tab === 'category' ? (
          <>
            <label className="info-category">
              Categoria acompanhada
              <span className="field">
                <select
                  value={viewCategory?.id ?? ''}
                  disabled={!viewCategory}
                  onChange={(e) => props.onPrefsChange({ weekCategoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {!viewCategory ? (
              <p className="muted">Nenhuma categoria cadastrada.</p>
            ) : categoryInfo.ideal > 0 ? (
              <AcompanhamentoRows info={categoryInfo} />
            ) : (
              <p className="muted">
                Sem gasto ideal definido para "{viewCategory.name}". Gasto no mês:{' '}
                <strong>{formatBRL(categoryInfo.spentMonth)}</strong>
              </p>
            )}
          </>
        ) : tab === 'origin' ? (
          <>
            <label className="info-category">
              Origem acompanhada
              <span className="field">
                <select
                  value={viewOrigin?.id ?? ''}
                  disabled={!viewOrigin}
                  onChange={(e) => props.onPrefsChange({ weekOriginId: e.target.value })}
                >
                  {origins.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {!viewOrigin ? (
              <p className="muted">Nenhuma origem cadastrada.</p>
            ) : originInfo.ideal > 0 ? (
              <AcompanhamentoRows info={originInfo} />
            ) : (
              <p className="muted">
                Sem gasto ideal definido para "{viewOrigin.name}". Gasto no mês:{' '}
                <strong>{formatBRL(originInfo.spentMonth)}</strong>
              </p>
            )}
            {viewOrigin && originInfo.fixed > 0 && (
              <p className="muted small">
                O mês inclui {formatBRL(originInfo.fixed)} de gastos fixos desta origem. A semana
                conta só os lançamentos variáveis, porque gasto fixo é do mês inteiro.
              </p>
            )}
          </>
        ) : (
          <MonthSummaryCard viewMonth={currentMonth} data={data} embedded />
        )}
      </section>

      {confirmWeek && (
        <ConfirmModal
          title="Virar a semana?"
          confirmLabel={`Virar para a semana ${currentWeek + 1}`}
          busy={busy}
          onConfirm={turnWeek}
          onCancel={() => setConfirmWeek(false)}
        >
          <p>
            O mês passa da <strong>semana {currentWeek}</strong> para a{' '}
            <strong>semana {currentWeek + 1}</strong>. Os próximos gastos entram na semana nova.
          </p>
          <p className="muted small">
            Os lançamentos que já estão na semana {currentWeek} continuam nela. A semana volta
            para 1 quando o mês virar.
          </p>
        </ConfirmModal>
      )}
    </>
  );
}
