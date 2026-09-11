import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { closeMonth, computeTotals, setOpenMonth } from '../services/months';
import { setOriginStatus, updateFixedEntry } from '../services/expenses';
import { formatBRL } from '../utils/money';
import { monthLabel, nextMonthKey, prevMonthKey } from '../utils/dates';
import { writeErrorMessage } from '../utils/errors';
import { useMonthData } from '../hooks/useMonthData';
import { ConfirmModal, EditableMoney } from './shared';
import { StatsView } from './StatsView';
import { OriginIcon } from './OriginIcon';
import { ENTRY_STATUSES, IGNORED_STATUS, STATUS_CLASS } from '../types';
import type { EntryStatus, Origin } from '../types';

function StatusSelect(props: {
  value: EntryStatus;
  disabled: boolean;
  onChange: (s: EntryStatus) => void;
}) {
  return (
    <span className={`status-frame ${STATUS_CLASS[props.value] ?? ''}`}>
      <select
        className="status-select"
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
    </span>
  );
}

export function MonthScreen(props: {
  compartmentId: string;
  currentMonth: string;
  mode: 'payment' | 'stats';
  /** Cadastro de origens: a linha do mês guarda só o id e o nome da origem. */
  origins: Origin[];
  onCurrentMonthChange: (next: string) => void;
}) {
  const { compartmentId, currentMonth, mode, origins } = props;
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [confirmClose, setConfirmClose] = useState(false);
  const [openStep, setOpenStep] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useMonthData(compartmentId, viewMonth);
  const originById = useMemo(() => new Map(origins.map((o) => [o.id, o])), [origins]);
  const isCurrent = viewMonth === currentMonth;
  const editable = isCurrent && data.month?.status === 'open';

  // Um mês de onde tudo já foi movido continua com o documento, mas vazio: é o
  // conteúdo, e não a existência do mês, que decide se há algo a substituir.
  const targetHasData =
    data.fixedEntries.length + data.categoryEntries.length + data.expenses.length > 0;

  const totals = useMemo(
    () => computeTotals(data.fixedEntries, data.categoryEntries, data.expenses, data.originEntries),
    [data],
  );
  // Só as linhas que a aba Pagamento resolve bloqueiam a virada: origens e
  // gastos fixos. A linha de categoria existe pelo ideal, ela não é paga.
  const pendingCount = useMemo(
    () =>
      [...data.originEntries, ...data.fixedEntries].filter((e) => e.status === 'Pendente').length,
    [data],
  );

  // Valor de cada origem no mês: os lançamentos variáveis somados por origem e
  // os gastos fixos que saem dela. O ícone e o tom vêm do cadastro, porque a
  // linha do mês guarda só o id, o nome e o status.
  const { originRows, noOrigin } = useMemo(() => {
    const somarPorOrigem = (itens: { originId?: string | null; amount: number }[]) => {
      const porOrigem = new Map<string, number>();
      for (const item of itens) {
        const chave = item.originId ?? '';
        porOrigem.set(chave, (porOrigem.get(chave) ?? 0) + item.amount);
      }
      return porOrigem;
    };
    const variaveis = somarPorOrigem(data.expenses);
    const fixos = somarPorOrigem(data.fixedEntries);
    const linha = (chave: string) => {
      const variable = variaveis.get(chave) ?? 0;
      const fixed = fixos.get(chave) ?? 0;
      // O total é o que o usuário confere quando marca a origem como paga: a
      // fatura do cartão inclui as contas fixas debitadas nele.
      return { variable, fixed, total: variable + fixed };
    };
    return {
      originRows: data.originEntries.map((o) => ({
        id: o.id,
        name: originById.get(o.id)?.name ?? o.name,
        icon: originById.get(o.id)?.icon,
        color: originById.get(o.id)?.color,
        status: o.status,
        ...linha(o.id),
      })),
      noOrigin: linha(''),
    };
  }, [data.expenses, data.fixedEntries, data.originEntries, originById]);

  // A edição de status e de valor não tem botão de confirmar: sem este catch, a
  // gravação recusada voltaria o valor anterior na tela, sem dizer por quê.
  const run = (promise: Promise<void>) => {
    setError(null);
    promise.catch((err) => setError(writeErrorMessage(err)));
  };

  // O status da origem desce para os gastos fixos que saem dela; os ids saem
  // daqui porque a tela já tem as linhas do mês assinadas.
  const changeOriginStatus = (originId: string, status: EntryStatus) =>
    setOriginStatus(
      compartmentId,
      viewMonth,
      originId,
      status,
      data.fixedEntries.filter((f) => f.originId === originId).map((f) => f.id),
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
        data.originEntries,
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

  const doSetOpenMonth = async (replaceTarget: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setOpenMonth(compartmentId, currentMonth, viewMonth, replaceTarget);
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
          <h2 className="h2-gold">{monthLabel(viewMonth)}</h2>
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
          Mover o mês atual para {monthLabel(viewMonth)}
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
            <h3>Origens do gasto</h3>
            <p className="card-hint">
              O total da origem é tudo que saiu dela no mês: os gastos fixos dela mais os
              lançamentos variáveis. Ao trocar o status, os gastos fixos daquela origem recebem o
              mesmo status, e cada um ainda pode ser ajustado na tabela de baixo.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th className="num hide-narrow">Fixos</th>
                    <th className="num hide-narrow">Variáveis</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {originRows.map((o) => (
                    <tr key={o.id} className={o.status === IGNORED_STATUS ? 'row-ignored' : ''}>
                      <td>
                        <span className="origin-cell">
                          <OriginIcon icon={o.icon} color={o.color} size={15} />
                          {o.name}
                        </span>
                        <span className="cell-sub">
                          fixos <span className="sub-value">{formatBRL(o.fixed)}</span> · variáveis{' '}
                          <span className="sub-value">{formatBRL(o.variable)}</span>
                        </span>
                      </td>
                      <td className="num hide-narrow">{formatBRL(o.fixed)}</td>
                      <td className="num hide-narrow">{formatBRL(o.variable)}</td>
                      <td className="num">
                        <strong>{formatBRL(o.total)}</strong>
                      </td>
                      <td>
                        <StatusSelect
                          value={o.status}
                          disabled={!editable}
                          onChange={(s) => run(changeOriginStatus(o.id, s))}
                        />
                      </td>
                    </tr>
                  ))}
                  {/* Lançamento sem origem não tem onde guardar status: entra
                      como linha de leitura, para o dinheiro do mês não sumir da
                      conferência. Dar uma origem a ele no histórico o traz para
                      uma das linhas de cima. */}
                  {noOrigin.total > 0 && (
                    <tr>
                      <td>
                        <span className="muted">Sem origem</span>
                        <span className="cell-sub">
                          fixos <span className="sub-value">{formatBRL(noOrigin.fixed)}</span> ·
                          variáveis{' '}
                          <span className="sub-value">{formatBRL(noOrigin.variable)}</span>
                        </span>
                      </td>
                      <td className="num hide-narrow">{formatBRL(noOrigin.fixed)}</td>
                      <td className="num hide-narrow">{formatBRL(noOrigin.variable)}</td>
                      <td className="num">
                        <strong>{formatBRL(noOrigin.total)}</strong>
                      </td>
                      <td>
                        <span className="muted small">sem status</span>
                      </td>
                    </tr>
                  )}
                  {originRows.length === 0 && noOrigin.total === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nenhuma origem cadastrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

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
                  {data.fixedEntries.map((f) => {
                    const origin = f.originId ? originById.get(f.originId) : undefined;
                    return (
                      <tr key={f.id} className={f.status === IGNORED_STATUS ? 'row-ignored' : ''}>
                        <td>
                          {f.name}
                          {f.installmentTotal ? (
                            <span className="badge installment">
                              {f.installmentCurrent ?? 1}/{f.installmentTotal}
                            </span>
                          ) : null}
                          {f.originId || f.originName ? (
                            <span className="badge origin">
                              <OriginIcon icon={origin?.icon} color={origin?.color} />
                              {origin?.name ?? f.originName}
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
                                run(
                                  updateFixedEntry(compartmentId, viewMonth, f.id, {
                                    idealAmount: v,
                                  }),
                                )
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
                              run(
                                updateFixedEntry(compartmentId, viewMonth, f.id, {
                                  idealAmount: v,
                                }),
                              )
                            }
                          />
                        </td>
                        <td className="num">
                          <EditableMoney
                            valueCents={f.amount}
                            disabled={!editable}
                            onSave={(v) =>
                              run(updateFixedEntry(compartmentId, viewMonth, f.id, { amount: v }))
                            }
                          />
                        </td>
                        <td>
                          <StatusSelect
                            value={f.status}
                            disabled={!editable}
                            onChange={(s) =>
                              run(updateFixedEntry(compartmentId, viewMonth, f.id, { status: s }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
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
            próximo mês será iniciado mantendo os cadastros de gastos fixos, categorias e
            origens.
          </p>
          <p className="muted small">
            Gastos parcelados avançam uma parcela; os que estiverem na última saem do próximo mês.
          </p>
        </ConfirmModal>
      )}

      {openStep === 1 && !targetHasData && (
        <ConfirmModal
          title="Mover o mês para cá?"
          confirmLabel="Mover e abrir o mês"
          busy={busy}
          onConfirm={() => doSetOpenMonth(false)}
          onCancel={() => setOpenStep(0)}
        >
          <p>
            Todo o conteúdo de <strong>{monthLabel(currentMonth)}</strong> (gastos fixos com valor
            e status, categorias, origens com status e lançamentos) será movido para{' '}
            <strong>{monthLabel(viewMonth)}</strong>, que passa a ser o mês em aberto.
          </p>
          <p className="muted small">
            Os cadastros de gastos fixos, categorias e origens não mudam: eles valem para qualquer
            mês. {monthLabel(currentMonth)} fica vazio.
          </p>
        </ConfirmModal>
      )}

      {openStep === 1 && targetHasData && (
        <ConfirmModal
          title="Mover o mês para cá?"
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
            pelo conteúdo de {monthLabel(currentMonth)}, que será movido para cá.
          </p>
        </ConfirmModal>
      )}

      {openStep === 2 && (
        <ConfirmModal
          title="Tem certeza?"
          confirmLabel="Substituir e mover o mês"
          busy={busy}
          onConfirm={() => doSetOpenMonth(true)}
          onCancel={() => setOpenStep(0)}
        >
          <p>
            Os dados existentes de <strong>{monthLabel(viewMonth)}</strong>, incluindo os{' '}
            {data.expenses.length} lançamento(s), serão apagados e substituídos pelo conteúdo de{' '}
            {monthLabel(currentMonth)}. <strong>Esta ação não pode ser desfeita.</strong>
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
