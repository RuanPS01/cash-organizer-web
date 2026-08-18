import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { addCategory, addVariableExpense } from '../services/expenses';
import { formatBRL } from '../utils/money';
import {
  dateFromDayKey,
  dayKey,
  dayKeyLabel,
  monthDayRange,
  monthLabel,
  weekOfMonth,
} from '../utils/dates';
import { MoneyInput, ProgressBar } from './shared';
import { MonthlyComparisonCard } from './MonthlyComparisonCard';
import type { MonthData } from '../hooks/useMonthData';
import type { Category } from '../types';

export function AddExpenseScreen(props: {
  compartmentId: string;
  currentMonth: string;
  categories: Category[];
  data: MonthData;
}) {
  const { compartmentId, currentMonth, categories, data } = props;
  // Pré-seleção: a categoria padrão do compartimento (Avulso, até o usuário
  // transferir o papel para outra); por segurança, cai na primeira da lista.
  const defaultCategory = categories.find((c) => c.isDefault) ?? categories[0];
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cents, setCents] = useState(0);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIdeal, setNewCatIdeal] = useState(0);
  // Data do lançamento (YYYY-MM-DD): começa no dia atual e só muda se o
  // usuário personalizar pelo botão de calendário.
  const today = dayKey();
  const [date, setDate] = useState(today);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isToday = date === today;

  // O seletor cobre o mês em aberto; se ele estiver atrasado em relação ao
  // calendário, o dia de hoje continua selecionável.
  const dateRange = useMemo(() => {
    const { min, max } = monthDayRange(currentMonth);
    return { min: min < today ? min : today, max: max > today ? max : today };
  }, [currentMonth, today]);

  // Digitar direto no campo permite datas fora do intervalo; guardamos sempre
  // um dia válido (vazio volta para hoje).
  const pickDate = (value: string) => {
    if (!value) return setDate(today);
    if (value < dateRange.min) return setDate(dateRange.min);
    if (value > dateRange.max) return setDate(dateRange.max);
    setDate(value);
  };

  const selected =
    categories.find((c) => c.id === categoryId) ?? defaultCategory ?? null;

  const currentWeek = weekOfMonth();

  const info = useMemo(() => {
    const entry = data.categoryEntries.find((c) => c.id === selected?.id);
    const ideal = entry?.idealAmount ?? selected?.idealAmount ?? 0;
    const catExpenses = data.expenses.filter((e) => e.categoryId === selected?.id);
    const spentMonth = catExpenses.reduce((s, e) => s + e.amount, 0);
    const spentWeek = catExpenses
      .filter((e) => e.week === currentWeek)
      .reduce((s, e) => s + e.amount, 0);
    const weeklyIdeal = Math.round(ideal / 4);
    const fixedTotal = data.fixedEntries.reduce((s, f) => s + f.amount, 0);
    const varTotal = data.expenses.reduce((s, e) => s + e.amount, 0);
    return {
      ideal,
      weeklyIdeal,
      spentMonth,
      spentWeek,
      remainingMonth: ideal - spentMonth,
      remainingWeek: weeklyIdeal - spentWeek,
      fixedTotal,
      varTotal,
    };
  }, [data, selected, currentWeek]);

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
        date: isToday ? undefined : dateFromDayKey(date),
      });
      setFlash(
        `${formatBRL(cents)} em "${selected.name}" adicionado${
          isToday ? '' : ` em ${dayKeyLabel(date)}`
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
        <h2>Novo gasto</h2>
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
            <input
              placeholder="Nome da categoria"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
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
          <input
            className="desc-input"
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className={`btn icon date-btn${isToday ? '' : ' active'}`}
            aria-label={
              isToday ? 'Escolher a data do gasto' : `Data do gasto: ${dayKeyLabel(date)}`
            }
            aria-expanded={showDatePicker}
            title={isToday ? 'Escolher a data do gasto' : `Data do gasto: ${dayKeyLabel(date)}`}
            onClick={() => setShowDatePicker((v) => !v)}
          >
            <CalendarDays size={18} aria-hidden />
          </button>
        </div>

        {showDatePicker && (
          <div className="date-picker">
            <input
              type="date"
              aria-label="Data do gasto"
              value={date}
              min={dateRange.min}
              max={dateRange.max}
              onChange={(e) => pickDate(e.target.value)}
            />
            <button
              type="button"
              className="btn small"
              disabled={isToday}
              onClick={() => setDate(today)}
            >
              Hoje
            </button>
          </div>
        )}

        {!isToday && (
          <p className="muted small date-hint">
            Lançando em <strong>{dayKeyLabel(date)}</strong> · semana{' '}
            {weekOfMonth(dateFromDayKey(date))}
          </p>
        )}
        <button className="btn primary block" type="submit" disabled={busy || cents <= 0}>
          {busy ? 'Salvando…' : `Adicionar em "${selected?.name ?? '…'}"`}
        </button>
        {flash && <p className="flash">{flash}</p>}
      </form>

      {selected && (
        <section className="info card">
          <h3>
            {selected.name} · semana {currentWeek}
          </h3>
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
              Sem gasto ideal definido para esta categoria. Gasto no mês:{' '}
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

      <MonthlyComparisonCard
        compartmentId={compartmentId}
        viewMonth={currentMonth}
        data={data}
      />
    </div>
  );
}
