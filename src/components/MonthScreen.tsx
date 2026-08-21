import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { closeMonth, computeTotals, setOpenMonth } from '../services/months';
import {
  deleteVariableExpense,
  updateCategoryEntry,
  updateFixedEntry,
} from '../services/expenses';
import { formatBRL } from '../utils/money';
import { dayLabel, monthLabel, nextMonthKey, prevMonthKey } from '../utils/dates';
import { useMonthData } from '../hooks/useMonthData';
import { ConfirmModal, EditableMoney } from './shared';
import { StatsView } from './StatsView';
import { ENTRY_STATUSES, IGNORED_STATUS } from '../types';
import type { EntryStatus } from '../types';

const STATUS_CLASS: Record<EntryStatus, string> = {
  Pendente: 'st-pending',
  'Parcialmente pago': 'st-partial',
  'Agendado/Automático': 'st-scheduled',
  Pago: 'st-paid',
  'Sem gasto': 'st-none',
  'Não disponível ainda': 'st-unavailable',
  Ignorar: 'st-ignored',
};

function StatusSelect(props: {
  value: EntryStatus;
  disabled: boolean;
  onChange: (s: EntryStatus) => void;
}) {
  return (
    <select
      className={`status-select ${STATUS_CLASS[props.value] ?? ''}`}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value as EntryStatus)}
    >
      {ENTRY_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function MonthScreen(props: {
  compartmentId: string;
  currentMonth: string;
  mode: 'payment' | 'stats';
  onCurrentMonthChange: (next: string) => void;
}) {
  const { compartmentId, currentMonth, mode } = props;
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [openStep, setOpenStep] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useMonthData(compartmentId, viewMonth);
  const isCurrent = viewMonth === currentMonth;
  const editable = isCurrent && data.month?.status === 'open';

  const totals = useMemo(
    () => computeTotals(data.fixedEntries, data.categoryEntries, data.expenses),
    [data],
  );
  const pendingCount = useMemo(
    () =>
      [...data.fixedEntries, ...data.categoryEntries].filter((e) => e.status === 'Pendente')
        .length,
    [data],
  );

  const doCloseMonth = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await closeMonth(
        compartmentId,
        currentMonth,
        data.fixedEntries,
        data.categoryEntries,
        data.expenses,
      );
      setConfirmClose(false);
      setViewMonth(next);
      props.onCurrentMonthChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao virar o mês.');
      setConfirmClose(false);
    } finally {
      setBusy(false);
    }
  };

  const doSetOpenMonth = async (reinitialize: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setOpenMonth(compartmentId, viewMonth, reinitialize);
      props.onCurrentMonthChange(viewMonth);
      setOpenStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao definir o mês em aberto.');
      setOpenStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen-header month-nav">
        <button
          className="btn icon"
          aria-label="Mês anterior"
          onClick={() => setViewMonth(prevMonthKey(viewMonth))}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="month-title">
          <h2>{monthLabel(viewMonth)}</h2>
          {data.month?.status === 'closed' && <span className="badge closed">Fechado</span>}
          {editable && <span className="badge open">Em aberto</span>}
        </div>
        <button
          className="btn icon"
          aria-label="Próximo mês"
          onClick={() => setViewMonth(nextMonthKey(viewMonth))}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </header>

      {!isCurrent && !data.loading && (
        <button className="btn ghost small center-self" onClick={() => setOpenStep(1)}>
          Definir {monthLabel(viewMonth)} como mês em aberto
        </button>
      )}

      {mode === 'stats' ? (
        <StatsView compartmentId={compartmentId} viewMonth={viewMonth} data={data} />
      ) : data.loading ? (
        <p className="muted center">Carregando…</p>
      ) : !data.month ? (
        <p className="muted center">Sem dados para este mês.</p>
      ) : (
        <>
          <section className="card table-card">
            <h3>Gastos fixos</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th className="num hide-narrow">Ideal</th>
                    <th className="num">Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fixedEntries.map((f) => (
                    <tr key={f.id} className={f.status === IGNORED_STATUS ? 'row-ignored' : ''}>
                      <td>
                        {f.name}
                        {f.installmentTotal ? (
                          <span className="badge installment">
                            {f.installmentCurrent ?? 1}/{f.installmentTotal}
                          </span>
                        ) : null}
                        {f.description && (
                          <span className="row-desc muted small">{f.description}</span>
                        )}
                        <span className="cell-sub">
                          ideal
                          <EditableMoney
                            valueCents={f.idealAmount}
                            disabled={!editable}
                            muted
                            onSave={(v) =>
                              updateFixedEntry(compartmentId, viewMonth, f.id, { idealAmount: v })
                            }
                          />
                        </span>
                      </td>
                      <td className="num hide-narrow">
                        <EditableMoney
                          valueCents={f.idealAmount}
                          disabled={!editable}
                          muted
                          onSave={(v) =>
                            updateFixedEntry(compartmentId, viewMonth, f.id, { idealAmount: v })
                          }
                        />
                      </td>
                      <td className="num">
                        <EditableMoney
                          valueCents={f.amount}
                          disabled={!editable}
                          onSave={(v) =>
                            updateFixedEntry(compartmentId, viewMonth, f.id, { amount: v })
                          }
                        />
                      </td>
                      <td>
                        <StatusSelect
                          value={f.status}
                          disabled={!editable}
                          onChange={(s) =>
                            updateFixedEntry(compartmentId, viewMonth, f.id, { status: s })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {data.fixedEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        Nenhum gasto fixo cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card table-card">
            <h3>Gastos variáveis (por categoria)</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="num hide-narrow">Ideal</th>
                    <th className="num">Soma</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categoryEntries.map((c) => {
                    const catExpenses = data.expenses.filter((e) => e.categoryId === c.id);
                    const sum = catExpenses.reduce((s, e) => s + e.amount, 0);
                    const isOpen = expanded === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className={c.status === IGNORED_STATUS ? 'row-ignored' : ''}>
                          <td>
                            <button
                              className="link-btn"
                              onClick={() => setExpanded(isOpen ? null : c.id)}
                            >
                              {isOpen ? (
                                <ChevronDown size={14} aria-hidden />
                              ) : (
                                <ChevronRight size={14} aria-hidden />
                              )}{' '}
                              {c.name}
                              <span className="muted"> ({catExpenses.length})</span>
                            </button>
                            <span className="cell-sub">
                              ideal
                              <EditableMoney
                                valueCents={c.idealAmount}
                                disabled={!editable}
                                muted
                                onSave={(v) =>
                                  updateCategoryEntry(compartmentId, viewMonth, c.id, {
                                    idealAmount: v,
                                  })
                                }
                              />
                            </span>
                          </td>
                          <td className="num hide-narrow">
                            <EditableMoney
                              valueCents={c.idealAmount}
                              disabled={!editable}
                              muted
                              onSave={(v) =>
                                updateCategoryEntry(compartmentId, viewMonth, c.id, {
                                  idealAmount: v,
                                })
                              }
                            />
                          </td>
                          <td className="num">
                            <strong>{formatBRL(sum)}</strong>
                          </td>
                          <td>
                            <StatusSelect
                              value={c.status}
                              disabled={!editable}
                              onChange={(s) =>
                                updateCategoryEntry(compartmentId, viewMonth, c.id, { status: s })
                              }
                            />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="details-row">
                            <td colSpan={4}>
                              {catExpenses.length === 0 ? (
                                <p className="muted">Nenhum lançamento nesta categoria.</p>
                              ) : (
                                <ul className="expense-list">
                                  {catExpenses.map((e) => (
                                    <li key={e.id}>
                                      <span className="muted when">
                                        {dayLabel(e.createdAt)} · sem {e.week}
                                      </span>
                                      <span className="desc">
                                        {e.description || 'Sem descrição'}
                                      </span>
                                      <strong>{formatBRL(e.amount)}</strong>
                                      {editable && (
                                        <button
                                          className="btn icon danger"
                                          title="Excluir lançamento"
                                          onClick={() =>
                                            deleteVariableExpense(compartmentId, viewMonth, e.id)
                                          }
                                        >
                                          <X size={14} aria-hidden />
                                        </button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {data.categoryEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        Nenhuma categoria neste mês.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card totals-card">
            <div className="totals-grid">
              <div>
                <span className="muted">Ideal (fixos + variáveis)</span>
                <strong>{formatBRL(totals.fixedIdeal + totals.varIdeal)}</strong>
              </div>
              <div>
                <span className="muted">Atual (fixos + variáveis)</span>
                <strong
                  className={
                    totals.fixedActual + totals.varActual > totals.fixedIdeal + totals.varIdeal
                      ? 'neg'
                      : 'pos'
                  }
                >
                  {formatBRL(totals.fixedActual + totals.varActual)}
                </strong>
              </div>
              <div>
                <span className="muted">Fixos</span>
                <strong>{formatBRL(totals.fixedActual)}</strong>
              </div>
              <div>
                <span className="muted">Variáveis</span>
                <strong>{formatBRL(totals.varActual)}</strong>
              </div>
            </div>

            {editable && (
              <>
                <button
                  className="btn primary block"
                  disabled={pendingCount > 0 || busy}
                  onClick={() => setConfirmClose(true)}
                >
                  Virar mês
                </button>
                {pendingCount > 0 && (
                  <p className="muted center small">
                    {pendingCount} item(ns) com status "Pendente". Atualize-os para poder virar o
                    mês.
                  </p>
                )}
              </>
            )}
            {error && <p className="form-error">{error}</p>}
          </section>
        </>
      )}

      {confirmClose && (
        <ConfirmModal
          title="Virar o mês?"
          confirmLabel="Virar mês"
          busy={busy}
          onConfirm={doCloseMonth}
          onCancel={() => setConfirmClose(false)}
        >
          <p>
            O mês de <strong>{monthLabel(currentMonth)}</strong> será fechado como pago/quitado e o
            próximo mês será iniciado mantendo os gastos fixos e as categorias.
          </p>
          <p className="muted small">
            Gastos parcelados avançam uma parcela; os que estiverem na última saem do próximo mês.
          </p>
        </ConfirmModal>
      )}

      {openStep === 1 && !data.month && (
        <ConfirmModal
          title="Definir mês em aberto?"
          confirmLabel="Definir como mês em aberto"
          busy={busy}
          onConfirm={() => doSetOpenMonth(false)}
          onCancel={() => setOpenStep(0)}
        >
          <p>
            <strong>{monthLabel(viewMonth)}</strong> será iniciado com os gastos fixos e categorias
            do cadastro e passará a ser o mês em aberto, recebendo os novos lançamentos.
          </p>
          <p className="muted small">
            O mês em aberto atual ({monthLabel(currentMonth)}) deixa de receber lançamentos, mas
            os dados dele são mantidos.
          </p>
        </ConfirmModal>
      )}

      {openStep === 1 && data.month && (
        <ConfirmModal
          title="Definir mês em aberto?"
          confirmLabel="Continuar"
          busy={busy}
          onConfirm={() => setOpenStep(2)}
          onCancel={() => setOpenStep(0)}
        >
          <p>
            <strong>{monthLabel(viewMonth)}</strong> já possui informações ({data.fixedEntries.length}{' '}
            gasto(s) fixo(s), {data.categoryEntries.length} categoria(s) e {data.expenses.length}{' '}
            lançamento(s)).
          </p>
          <p>
            Para defini-lo como mês em aberto, essas informações serão <strong>substituídas</strong>{' '}
            pelos cadastros atuais de gastos fixos e categorias.
          </p>
        </ConfirmModal>
      )}

      {openStep === 2 && (
        <ConfirmModal
          title="Tem certeza?"
          confirmLabel="Substituir e abrir mês"
          busy={busy}
          onConfirm={() => doSetOpenMonth(true)}
          onCancel={() => setOpenStep(0)}
        >
          <p>
            Os dados existentes de <strong>{monthLabel(viewMonth)}</strong>, incluindo os{' '}
            {data.expenses.length} lançamento(s), serão apagados e o mês será reiniciado.{' '}
            <strong>Esta ação não pode ser desfeita.</strong>
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
