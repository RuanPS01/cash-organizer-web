import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, CalendarSync, Eraser, Plus } from 'lucide-react';
import { addCategory, addVariableExpense } from '../services/expenses';
import { computeTotals, monthWeek, setCurrentWeek } from '../services/months';
import { formatBRL } from '../utils/money';
import {
  dateFromDayKey,
  dayKey,
  dayKeyFullLabel,
  dayKeyLabel,
  isSunday,
  monthLabel,
} from '../utils/dates';
import { writeErrorMessage } from '../utils/errors';
import { ConfirmModal, MoneyInput, ProgressBar } from './shared';
import { MonthSummaryCard } from './MonthSummaryCard';
import { ExpenseHistory } from './ExpenseHistory';
import { OriginIcon } from './OriginIcon';
import type { MonthData } from '../hooks/useMonthData';
import { MONTH_WEEKS } from '../types';
import type { Category, Origin } from '../types';

export function AddExpenseScreen(props: {
  compartmentId: string;
  currentMonth: string;
  categories: Category[];
  origins: Origin[];
  data: MonthData;
  /** Categoria acompanhada no card da semana, guardada no compartimento. */
  weekCategoryId: string | null;
  onWeekCategoryChange: (categoryId: string) => void;
}) {
  const { compartmentId, currentMonth, categories, origins, data } = props;
  // Pré-seleção: a categoria padrão do compartimento (Avulso, até o usuário
  // transferir o papel para outra); por segurança, cai na primeira da lista.
  const defaultCategory = categories.find((c) => c.isDefault) ?? categories[0];
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Mesma regra da categoria para a origem do gasto: a padrão vem
  // pré-selecionada e, sem padrão definida, vale a primeira da lista.
  const defaultOrigin = origins.find((o) => o.isDefault) ?? origins[0];
  const [originId, setOriginId] = useState<string | null>(null);
  const [cents, setCents] = useState(0);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [confirmWeek, setConfirmWeek] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIdeal, setNewCatIdeal] = useState(0);
  // Data do lançamento (YYYY-MM-DD): começa no dia atual e só muda se o
  // usuário escolher outra no botão de calendário.
  const today = dayKey();
  const [date, setDate] = useState(today);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const isToday = date === today;
  const dateSummary = isToday
    ? `Data do gasto: hoje (${dayKeyLabel(date)}). Toque para escolher outra.`
    : `Data do gasto: ${dayKeyFullLabel(date)}. Toque para alterar.`;

  // Qualquer dia é aceito (o mês do app é só a referência da fatura); limpar o
  // campo volta para hoje.
  const pickDate = (value: string) => setDate(value || today);

  // No celular o toque cai no input nativo (invisível sobre o botão) e já abre
  // o seletor; no desktop, o clique sozinho não abre, daí o showPicker.
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el || typeof el.showPicker !== 'function') return;
    try {
      el.showPicker();
    } catch {
      // Navegadores recusam showPicker fora de um gesto do usuário ou quando o
      // seletor já está aberto; nesse caso o comportamento nativo basta.
    }
  };

  const selected =
    categories.find((c) => c.id === categoryId) ?? defaultCategory ?? null;
  const selectedOrigin = origins.find((o) => o.id === originId) ?? defaultOrigin ?? null;

  // A semana é do mês, não do calendário: ela vira no botão, não no dia 8.
  const currentWeek = monthWeek(data.month);
  const monthOpen = data.month?.status === 'open';
  const canTurnWeek = monthOpen && currentWeek < MONTH_WEEKS;
  // No domingo o app lembra de virar a semana, mas não insiste depois que ela
  // já virou no mesmo dia.
  const turnedToday =
    data.month?.weekChangedAt !== undefined &&
    dayKey(new Date(data.month.weekChangedAt)) === today;
  const suggestTurn = canTurnWeek && isSunday() && !turnedToday;

  // O card de acompanhamento tem categoria própria, guardada no compartimento:
  // o chip de cima escolhe onde o gasto entra, este seletor escolhe o que
  // olhar. Sem escolha guardada, vale a categoria padrão.
  const viewCategory =
    categories.find((c) => c.id === props.weekCategoryId) ?? defaultCategory ?? null;

  const info = useMemo(() => {
    const entry = data.categoryEntries.find((c) => c.id === viewCategory?.id);
    const ideal = entry?.idealAmount ?? viewCategory?.idealAmount ?? 0;
    const catExpenses = data.expenses.filter((e) => e.categoryId === viewCategory?.id);
    const spentMonth = catExpenses.reduce((s, e) => s + e.amount, 0);
    const spentWeek = catExpenses
      .filter((e) => e.week === currentWeek)
      .reduce((s, e) => s + e.amount, 0);
    const weeklyIdeal = Math.round(ideal / MONTH_WEEKS);
    // Totais do mês pelo mesmo cálculo da aba de pagamento (linhas com status
    // "Ignorar" ficam de fora).
    const totals = computeTotals(
      data.fixedEntries,
      data.categoryEntries,
      data.expenses,
      data.originEntries,
    );
    return {
      ideal,
      weeklyIdeal,
      spentMonth,
      spentWeek,
      remainingMonth: ideal - spentMonth,
      remainingWeek: weeklyIdeal - spentWeek,
      fixedTotal: totals.fixedActual,
      varTotal: totals.varActual,
    };
  }, [data, viewCategory, currentWeek]);

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || cents <= 0 || busy) return;
    setBusy(true);
    try {
      await addVariableExpense(compartmentId, currentMonth, {
        categoryId: selected.id,
        categoryName: selected.name,
        amount: cents,
        description,
        week: currentWeek,
        date: isToday ? undefined : dateFromDayKey(date),
        originId: selectedOrigin?.id ?? null,
        originName: selectedOrigin?.name,
      });
      setFlash(
        `${formatBRL(cents)} em "${selected.name}" adicionado${
          isToday ? '' : ` em ${dayKeyFullLabel(date)}`
        }!`,
      );
      setCents(0);
      setDescription('');
      setTimeout(() => setFlash(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  const createCategory = async (e: FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const id = await addCategory(compartmentId, currentMonth, {
        name,
        idealAmount: newCatIdeal,
      });
      setCategoryId(id);
      setShowNewCategory(false);
      setNewCatName('');
      setNewCatIdeal(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h2 className="h2-gold">Novo gasto</h2>
        <span className="muted">{monthLabel(currentMonth)}</span>
      </header>

      <form className="add-form card" onSubmit={submit}>
        <div className="chip-row" role="radiogroup" aria-label="Categoria">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip${selected?.id === c.id ? ' selected' : ''}`}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
          <button
            type="button"
            className="chip new"
            onClick={() => setShowNewCategory((v) => !v)}
          >
            <Plus size={14} aria-hidden /> categoria
          </button>
        </div>

        {showNewCategory && (
          <div className="new-category">
            <span className="field">
              <input
                placeholder="Nome da categoria"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
            </span>
            <MoneyInput
              valueCents={newCatIdeal}
              onChange={setNewCatIdeal}
              placeholder="Gasto ideal/mês"
            />
            <button className="btn small" type="button" onClick={createCategory} disabled={busy}>
              Criar
            </button>
          </div>
        )}

        <MoneyInput valueCents={cents} onChange={setCents} big autoFocus />
        <div className="desc-row">
          <span className="field">
            <input
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </span>
          {/* O input nativo fica invisível por cima do botão: o toque real
              abre o calendário do sistema, sem campos extras na tela. */}
          <div className={`btn icon date-btn${isToday ? '' : ' custom'}`}>
            <CalendarDays size={18} aria-hidden />
            <input
              ref={dateInputRef}
              type="date"
              className="date-native"
              aria-label={dateSummary}
              title={dateSummary}
              value={date}
              onClick={openDatePicker}
              onChange={(e) => {
                // "Limpar" no seletor do celular devolve valor vazio: volta
                // para hoje e reescreve o campo, já que o estado pode não
                // mudar (e aí não haveria re-render para corrigi-lo).
                if (!e.target.value) e.target.value = today;
                pickDate(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className="btn icon date-clear"
            aria-label="Limpar a data escolhida e voltar para hoje"
            title="Limpar a data escolhida e voltar para hoje"
            disabled={isToday}
            onClick={() => setDate(today)}
          >
            <Eraser size={18} aria-hidden />
          </button>
        </div>

        <p className={`date-status${isToday ? '' : ' custom'}`}>
          Data:{' '}
          <strong>{isToday ? `hoje (${dayKeyLabel(date)})` : dayKeyFullLabel(date)}</strong>
        </p>

        {origins.length > 0 && (
          <div className="origin-picker">
            <span className="origin-label">Origem</span>
            <div className="chip-row" role="radiogroup" aria-label="Origem do gasto">
              {origins.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`chip${selectedOrigin?.id === o.id ? ' selected' : ''}`}
                  onClick={() => setOriginId(o.id)}
                >
                  <OriginIcon icon={o.icon} color={o.color} />
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn primary block" type="submit" disabled={busy || cents <= 0}>
          {busy ? 'Salvando…' : `Adicionar em "${selected?.name ?? '…'}"`}
        </button>
        {flash && <p className="flash">{flash}</p>}
      </form>

      {viewCategory && (
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

          <label className="info-category">
            Categoria acompanhada
            <span className="field">
              <select
                value={viewCategory.id}
                onChange={(e) => props.onWeekCategoryChange(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          {info.ideal > 0 ? (
            <>
              <div className="info-row">
                <span>Semana ({formatBRL(info.weeklyIdeal)}/sem)</span>
                <strong className={info.remainingWeek < 0 ? 'neg' : ''}>
                  {info.remainingWeek >= 0
                    ? `restam ${formatBRL(info.remainingWeek)}`
                    : `${formatBRL(-info.remainingWeek)} acima`}
                </strong>
              </div>
              <ProgressBar ratio={info.weeklyIdeal > 0 ? info.spentWeek / info.weeklyIdeal : 0} />
              <div className="info-row">
                <span>Mês ({formatBRL(info.ideal)} ideal)</span>
                <strong className={info.remainingMonth < 0 ? 'neg' : ''}>
                  {info.remainingMonth >= 0
                    ? `restam ${formatBRL(info.remainingMonth)}`
                    : `${formatBRL(-info.remainingMonth)} acima`}
                </strong>
              </div>
              <ProgressBar ratio={info.ideal > 0 ? info.spentMonth / info.ideal : 0} />
            </>
          ) : (
            <p className="muted">
              Sem gasto ideal definido para "{viewCategory.name}". Gasto no mês:{' '}
              <strong>{formatBRL(info.spentMonth)}</strong>
            </p>
          )}
          <div className="info-totals">
            <div>
              <span className="muted">Fixos do mês</span>
              <strong>{formatBRL(info.fixedTotal)}</strong>
            </div>
            <div>
              <span className="muted">Variáveis do mês</span>
              <strong>{formatBRL(info.varTotal)}</strong>
            </div>
          </div>
        </section>
      )}

      <MonthSummaryCard viewMonth={currentMonth} data={data} />

      <ExpenseHistory
        compartmentId={compartmentId}
        ym={currentMonth}
        data={data}
        categories={categories}
        origins={origins}
      />

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
    </div>
  );
}
