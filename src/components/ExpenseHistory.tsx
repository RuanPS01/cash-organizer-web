import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  deleteVariableExpense,
  removeFixedExpense,
  updateFixedEntry,
  updateVariableExpense,
} from '../services/expenses';
import { formatBRL } from '../utils/money';
import { dateFromDayKey, dayLabel } from '../utils/dates';
import { writeErrorMessage } from '../utils/errors';
import { ConfirmModal, EditableMoney, EditableText } from './shared';
import { OriginIcon } from './OriginIcon';
import { IGNORED_STATUS, STATUS_CLASS } from '../types';
import type { MonthData } from '../hooks/useMonthData';
import type { Category, FixedEntry, Origin, VariableExpense } from '../types';

type Tab = 'variable' | 'fixed';

// dateFromDayKey copia só o horário do Date recebido: com estes dois marcos o
// filtro de data pega o dia inteiro escolhido, das 00:00:00 às 23:59:59.
const DAY_START = new Date(2000, 0, 1, 0, 0, 0, 0);
const DAY_END = new Date(2000, 0, 1, 23, 59, 59, 999);

/**
 * Busca sem acento e sem caixa: quem procura "cafe" precisa achar "Café",
 * senão a barra parece quebrada em metade das descrições em português.
 */
function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Selo da origem do lançamento, com o glifo no tom escolhido no cadastro. */
function OriginBadge(props: { origin?: Origin; name: string }) {
  return (
    <span className="badge origin">
      <OriginIcon icon={props.origin?.icon} color={props.origin?.color} />
      {props.origin?.name ?? props.name}
    </span>
  );
}

/**
 * Histórico do mês em aberto, com as duas naturezas de gasto em subabas:
 * os lançamentos variáveis (padrão, do mais recente para o mais antigo) e as
 * linhas de gasto fixo. Valor e descrição são editáveis no lugar e a remoção
 * passa por confirmação.
 */
export function ExpenseHistory(props: {
  compartmentId: string;
  ym: string;
  data: MonthData;
  categories: Category[];
  origins: Origin[];
}) {
  const { compartmentId, ym, data, categories, origins } = props;
  const [tab, setTab] = useState<Tab>('variable');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<
    { kind: 'expense'; item: VariableExpense } | { kind: 'fixed'; item: FixedEntry } | null
  >(null);

  // A edição no lugar não tem botão de confirmar: sem este catch, uma gravação
  // recusada faria o valor voltar ao anterior na tela sem explicar por quê.
  const run = (promise: Promise<void>) => {
    setError(null);
    promise.catch((err) => setError(writeErrorMessage(err)));
  };

  const editable = data.month?.status === 'open';
  const originById = useMemo(() => new Map(origins.map((o) => [o.id, o])), [origins]);
  const filtersOn =
    categoryFilter !== 'all' || originFilter !== 'all' || from !== '' || to !== '';

  const expenses = useMemo(() => {
    const term = foldText(search.trim());
    const start = from ? dateFromDayKey(from, DAY_START).getTime() : null;
    const end = to ? dateFromDayKey(to, DAY_END).getTime() : null;
    return data.expenses
      .filter((e) => {
        if (categoryFilter !== 'all' && e.categoryId !== categoryFilter) return false;
        if (originFilter === 'none' && e.originId) return false;
        if (originFilter !== 'all' && originFilter !== 'none' && e.originId !== originFilter) {
          return false;
        }
        if (start !== null && e.createdAt < start) return false;
        if (end !== null && e.createdAt > end) return false;
        if (!term) return true;
        const originName = e.originId ? (originById.get(e.originId)?.name ?? e.originName) : '';
        return foldText(
          `${e.description} ${e.categoryName} ${originName ?? ''} ${e.originName ?? ''}`,
        ).includes(term);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [data.expenses, search, categoryFilter, originFilter, from, to, originById]);

  const fixedEntries = useMemo(() => {
    const term = foldText(search.trim());
    if (!term) return data.fixedEntries;
    return data.fixedEntries.filter((f) =>
      foldText(`${f.name} ${f.description ?? ''}`).includes(term),
    );
  }, [data.fixedEntries, search]);

  const shownTotal =
    tab === 'variable'
      ? expenses.reduce((s, e) => s + e.amount, 0)
      : fixedEntries
          .filter((f) => f.status !== IGNORED_STATUS)
          .reduce((s, f) => s + f.amount, 0);

  const clearFilters = () => {
    setCategoryFilter('all');
    setOriginFilter('all');
    setFrom('');
    setTo('');
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    setError(null);
    try {
      if (removeTarget.kind === 'expense') {
        await deleteVariableExpense(compartmentId, ym, removeTarget.item.id);
      } else {
        await removeFixedExpense(compartmentId, ym, removeTarget.item.id);
      }
      setRemoveTarget(null);
    } catch (err) {
      setError(writeErrorMessage(err));
      setRemoveTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    // O modal de confirmação fica fora do .card de propósito: clip-path
    // recorta qualquer descendente, inclusive position: fixed, e o modal
    // apareceria cortado pelos limites do card.
    <>
      <section className="card history-card">
        <h3>Histórico do mês</h3>

        <div className="subtabs" role="tablist" aria-label="Natureza do gasto">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'variable'}
            className={`subtab${tab === 'variable' ? ' active' : ''}`}
            onClick={() => setTab('variable')}
          >
            Variáveis <span className="count">{data.expenses.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'fixed'}
            className={`subtab${tab === 'fixed' ? ' active' : ''}`}
            onClick={() => setTab('fixed')}
          >
            Fixos <span className="count">{data.fixedEntries.length}</span>
          </button>
        </div>

        <div className="history-search">
          <span className="field search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder={tab === 'variable' ? 'Buscar no histórico' : 'Buscar gasto fixo'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
          {tab === 'variable' && (
            <button
              type="button"
              className={`btn icon${showFilters || filtersOn ? ' custom' : ''}`}
              title="Filtrar por categoria, origem e data"
              aria-label="Filtrar por categoria, origem e data"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal size={18} aria-hidden />
            </button>
          )}
        </div>

        {tab === 'variable' && showFilters && (
          <div className="history-filters">
            <label>
              Categoria
              <span className="field">
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="all">Todas</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label>
              Origem
              <span className="field">
                <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)}>
                  <option value="all">Todas</option>
                  {origins.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  <option value="none">Sem origem</option>
                </select>
              </span>
            </label>
            <label>
              De
              <span className="field">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </span>
            </label>
            <label>
              Até
              <span className="field">
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </span>
            </label>
            <button
              type="button"
              className="btn ghost small"
              disabled={!filtersOn}
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          </div>
        )}

        <p className="history-summary">
          <span className="muted">
            {tab === 'variable'
              ? `${expenses.length} lançamento(s)`
              : `${fixedEntries.length} gasto(s) fixo(s)`}
          </span>
          <strong>{formatBRL(shownTotal)}</strong>
        </p>

        {tab === 'variable' ? (
          <ul className="history-list">
            {expenses.map((e) => (
              <li key={e.id}>
                <span className="history-desc">
                  <EditableText
                    value={e.description}
                    placeholder="Sem descrição"
                    allowEmpty
                    disabled={!editable}
                    onSave={(description) =>
                      run(updateVariableExpense(compartmentId, ym, e.id, { description }))
                    }
                  />
                </span>
                <span className="history-meta">
                  <span className="when">
                    {dayLabel(e.createdAt)} · sem {e.week}
                  </span>
                  <span className="badge cat">{e.categoryName}</span>
                  {(e.originId || e.originName) && (
                    <OriginBadge
                      origin={e.originId ? originById.get(e.originId) : undefined}
                      name={e.originName ?? ''}
                    />
                  )}
                </span>
                <span className="history-value">
                  <EditableMoney
                    valueCents={e.amount}
                    disabled={!editable}
                    onSave={(amount) =>
                      run(updateVariableExpense(compartmentId, ym, e.id, { amount }))
                    }
                  />
                </span>
                {editable && (
                  <button
                    type="button"
                    className="btn icon danger"
                    title="Excluir lançamento"
                    aria-label={`Excluir lançamento de ${formatBRL(e.amount)}`}
                    onClick={() => setRemoveTarget({ kind: 'expense', item: e })}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
            {expenses.length === 0 && (
              <li className="history-empty muted">
                {data.expenses.length === 0
                  ? 'Nenhum lançamento neste mês ainda.'
                  : 'Nenhum lançamento encontrado com esses filtros.'}
              </li>
            )}
          </ul>
        ) : (
          <ul className="history-list">
            {fixedEntries.map((f) => (
              <li key={f.id} className={`fixed-row${f.status === IGNORED_STATUS ? ' row-ignored' : ''}`}>
                <span className="history-desc">
                  <span className="history-name">
                    {f.name}
                    {f.installmentTotal ? (
                      <span className="badge installment">
                        {f.installmentCurrent ?? 1}/{f.installmentTotal}
                      </span>
                    ) : null}
                  </span>
                  <EditableText
                    value={f.description ?? ''}
                    placeholder="Sem descrição"
                    allowEmpty
                    disabled={!editable}
                    onSave={(description) =>
                      run(updateFixedEntry(compartmentId, ym, f.id, { description }))
                    }
                  />
                </span>
                <span className="history-meta">
                  <span className={`badge status ${STATUS_CLASS[f.status]}`}>{f.status}</span>
                  <span className="when">ideal {formatBRL(f.idealAmount)}</span>
                </span>
                <span className="history-value">
                  <EditableMoney
                    valueCents={f.amount}
                    disabled={!editable}
                    onSave={(amount) => run(updateFixedEntry(compartmentId, ym, f.id, { amount }))}
                  />
                </span>
                {editable && (
                  <button
                    type="button"
                    className="btn icon danger"
                    title="Remover gasto fixo do mês"
                    aria-label={`Remover ${f.name} do mês`}
                    onClick={() => setRemoveTarget({ kind: 'fixed', item: f })}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
            {fixedEntries.length === 0 && (
              <li className="history-empty muted">
                {data.fixedEntries.length === 0
                  ? 'Nenhum gasto fixo neste mês.'
                  : 'Nenhum gasto fixo encontrado com essa busca.'}
              </li>
            )}
          </ul>
        )}
        {error && <p className="form-error">{error}</p>}
      </section>

      {removeTarget && (
        <ConfirmModal
          title={removeTarget.kind === 'expense' ? 'Excluir lançamento?' : 'Remover gasto fixo?'}
          confirmLabel={removeTarget.kind === 'expense' ? 'Excluir' : 'Remover'}
          busy={busy}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        >
          {removeTarget.kind === 'expense' ? (
            <p>
              O lançamento de <strong>{formatBRL(removeTarget.item.amount)}</strong> em "
              {removeTarget.item.categoryName}" sai do histórico do mês. Esta ação não pode ser
              desfeita.
            </p>
          ) : (
            <>
              <p>
                <strong>{removeTarget.item.name}</strong> será removido do mês atual em aberto e
                não aparecerá nos próximos meses.
              </p>
              <p className="muted small">
                Meses já fechados não são alterados. Para trazê-lo de volta, cadastre o gasto fixo
                de novo na aba Gerenciar.
              </p>
            </>
          )}
        </ConfirmModal>
      )}
    </>
  );
}
