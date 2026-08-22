import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import {
  addCategory,
  addFixedExpense,
  moveCategory,
  removeCategory,
  removeFixedExpense,
  renameCategory,
  saveCategoryIdeal,
  saveFixedExpense,
  setDefaultCategory,
} from '../services/expenses';
import type { FixedExpenseInput } from '../services/expenses';
import { formatBRL } from '../utils/money';
import { EditableMoney, EditableText, MoneyInput, ConfirmModal } from './shared';
import type { MonthData } from '../hooks/useMonthData';
import type { Category, FixedExpense } from '../types';

function parsePositiveInt(text: string): number | null {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Modal de criação/edição de gasto fixo com todos os campos. */
function FixedExpenseModal(props: {
  initial: FixedExpense | null;
  busy: boolean;
  onSave: (input: FixedExpenseInput) => void;
  onCancel: () => void;
}) {
  const { initial } = props;
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [ideal, setIdeal] = useState(initial?.idealAmount ?? 0);
  const [instCur, setInstCur] = useState(
    initial?.installmentCurrent ? String(initial.installmentCurrent) : '',
  );
  const [instTot, setInstTot] = useState(
    initial?.installmentTotal ? String(initial.installmentTotal) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Informe o nome do gasto fixo.');
      return;
    }
    if (amount <= 0) {
      setError('Informe o valor do gasto fixo.');
      return;
    }
    const hasCur = instCur.trim() !== '';
    const hasTot = instTot.trim() !== '';
    let installmentCurrent: number | null = null;
    let installmentTotal: number | null = null;
    if (hasCur || hasTot) {
      if (!hasTot) {
        setError('Informe até qual parcela vai (ex.: 2 de 4).');
        return;
      }
      installmentCurrent = hasCur ? parsePositiveInt(instCur) : 1;
      installmentTotal = parsePositiveInt(instTot);
      if (!installmentCurrent || !installmentTotal || installmentCurrent > installmentTotal) {
        setError('Parcela inválida: a atual deve ser de 1 até a parcela final.');
        return;
      }
    }
    props.onSave({
      name,
      amount,
      idealAmount: ideal || undefined,
      description: description || undefined,
      installmentCurrent,
      installmentTotal,
    });
  };

  return (
    <ConfirmModal
      title={initial ? 'Editar gasto fixo' : 'Novo gasto fixo'}
      confirmLabel="Salvar"
      busy={props.busy}
      onConfirm={submit}
      onCancel={props.onCancel}
    >
      <div className="modal-form">
        <span className="field">
          <input
            placeholder="Nome (ex.: Aluguel)"
            value={name}
            autoFocus={!initial}
            onChange={(e) => setName(e.target.value)}
          />
        </span>
        <span className="field">
          <input
            placeholder="Comentário/descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </span>
        <div className="inline-pair">
          <MoneyInput valueCents={amount} onChange={setAmount} placeholder="Valor" />
          <MoneyInput valueCents={ideal} onChange={setIdeal} placeholder="Ideal (opcional)" />
        </div>
        <div className="inline-pair installments">
          <span className="muted small">Parcela (opcional):</span>
          <span className="field">
            <input
              inputMode="numeric"
              placeholder="2"
              value={instCur}
              onChange={(e) => setInstCur(e.target.value.replace(/\D/g, ''))}
            />
          </span>
          <span className="muted">de</span>
          <span className="field">
            <input
              inputMode="numeric"
              placeholder="4"
              value={instTot}
              onChange={(e) => setInstTot(e.target.value.replace(/\D/g, ''))}
            />
          </span>
        </div>
        <p className="card-hint">
          Em gastos parcelados, a parcela avança a cada virada de mês; após a última, o gasto sai
          dos próximos meses automaticamente.
        </p>
        {error && <p className="form-error">{error}</p>}
      </div>
    </ConfirmModal>
  );
}

export function ManageScreen(props: {
  compartmentId: string;
  currentMonth: string;
  fixedExpenses: FixedExpense[];
  categories: Category[];
  monthData: MonthData;
}) {
  const { compartmentId, currentMonth, fixedExpenses, categories, monthData } = props;

  const totals = useMemo(
    () => ({
      fixedAmount: fixedExpenses.reduce((s, f) => s + f.amount, 0),
      fixedIdeal: fixedExpenses.reduce((s, f) => s + (f.idealAmount || f.amount), 0),
      varIdeal: categories.reduce((s, c) => s + c.idealAmount, 0),
      varSpent: monthData.expenses.reduce((s, e) => s + e.amount, 0),
    }),
    [fixedExpenses, categories, monthData.expenses],
  );

  const [fixedModal, setFixedModal] = useState<'closed' | 'new' | FixedExpense>('closed');
  const [catName, setCatName] = useState('');
  const [catIdeal, setCatIdeal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<
    { kind: 'fixed'; item: FixedExpense } | { kind: 'category'; item: Category } | null
  >(null);

  const saveFixed = async (input: FixedExpenseInput) => {
    setBusy(true);
    try {
      if (fixedModal === 'new') {
        await addFixedExpense(compartmentId, currentMonth, input);
      } else if (fixedModal !== 'closed') {
        await saveFixedExpense(compartmentId, currentMonth, fixedModal.id, input);
      }
      setFixedModal('closed');
    } finally {
      setBusy(false);
    }
  };

  const inlineSaveFixed = (f: FixedExpense, patch: Partial<FixedExpenseInput>) =>
    saveFixedExpense(compartmentId, currentMonth, f.id, {
      name: f.name,
      amount: f.amount,
      idealAmount: f.idealAmount,
      description: f.description,
      installmentCurrent: f.installmentCurrent,
      installmentTotal: f.installmentTotal,
      ...patch,
    });

  const submitCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!catName.trim() || busy) return;
    setBusy(true);
    try {
      await addCategory(compartmentId, currentMonth, { name: catName, idealAmount: catIdeal });
      setCatName('');
      setCatIdeal(0);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      if (removeTarget.kind === 'fixed') {
        await removeFixedExpense(compartmentId, currentMonth, removeTarget.item.id);
      } else {
        await removeCategory(compartmentId, currentMonth, removeTarget.item.id);
      }
      setRemoveTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h2 className="h2-gold">Gerenciar</h2>
      </header>

      <section className="card">
        <h3>Gastos fixos</h3>
        <p className="card-hint">
          O valor fixo é usado como gasto ideal automaticamente, a menos que você defina outro
          ideal. Novos fixos entram no mês corrente em aberto.
        </p>
        <div className="section-totals">
          <span>
            <span className="muted small">Total valor</span>
            <strong>{formatBRL(totals.fixedAmount)}</strong>
          </span>
          <span>
            <span className="muted small">Total ideal</span>
            <strong>{formatBRL(totals.fixedIdeal)}</strong>
          </span>
        </div>
        <ul className="manage-list">
          {fixedExpenses.map((f) => (
            <li key={f.id}>
              <div className="row-main">
                <span className="name">
                  {f.name}
                  {f.installmentTotal ? (
                    <span className="badge installment">
                      {f.installmentCurrent ?? 1}/{f.installmentTotal}
                    </span>
                  ) : null}
                </span>
                <span className="values">
                  <span className="pair">
                    <span className="muted small">valor</span>
                    <EditableMoney
                      valueCents={f.amount}
                      onSave={(v) => inlineSaveFixed(f, { amount: v })}
                    />
                  </span>
                  <span className="pair">
                    <span className="muted small">ideal</span>
                    <EditableMoney
                      valueCents={f.idealAmount}
                      muted
                      onSave={(v) => inlineSaveFixed(f, { idealAmount: v })}
                    />
                  </span>
                </span>
                {f.description && <span className="row-desc muted small">{f.description}</span>}
              </div>
              <button
                className="btn icon"
                title="Editar gasto fixo"
                onClick={() => setFixedModal(f)}
              >
                <Pencil size={15} aria-hidden />
              </button>
              <button
                className="btn icon danger"
                title="Remover gasto fixo"
                onClick={() => setRemoveTarget({ kind: 'fixed', item: f })}
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
          {fixedExpenses.length === 0 && <li className="muted">Nenhum gasto fixo ainda.</li>}
        </ul>
        <button className="btn primary" onClick={() => setFixedModal('new')}>
          <Plus size={16} aria-hidden /> Novo gasto fixo
        </button>
      </section>

      <section className="card">
        <h3>Categorias de gastos variáveis</h3>
        <p className="card-hint">
          Defina o gasto ideal do mês por categoria. Use as setas para mudar a ordem (refletida
          nos chips de novo gasto). A categoria <strong>padrão</strong> vem pré-selecionada ao
          adicionar um gasto; use "tornar padrão" para trocar.
        </p>
        <div className="section-totals">
          <span>
            <span className="muted small">Gasto no mês</span>
            <strong>{formatBRL(totals.varSpent)}</strong>
          </span>
          <span>
            <span className="muted small">Total ideal</span>
            <strong>{formatBRL(totals.varIdeal)}</strong>
          </span>
        </div>
        <ul className="manage-list">
          {categories.map((c, i) => {
            return (
              <li key={c.id}>
                <div className="row-main">
                  <span className="name">
                    <EditableText
                      value={c.name}
                      onSave={(name) => renameCategory(compartmentId, currentMonth, c.id, name)}
                    />
                    {c.isDefault ? (
                      <span className="badge padrao">padrão</span>
                    ) : (
                      <button
                        className="mini-btn"
                        title="Tornar esta a categoria padrão (pré-selecionada ao adicionar gasto)"
                        onClick={() => setDefaultCategory(compartmentId, categories, c.id)}
                      >
                        tornar padrão
                      </button>
                    )}
                  </span>
                  <span className="values">
                    <span className="pair">
                      <span className="muted small">ideal</span>
                      <EditableMoney
                        valueCents={c.idealAmount}
                        onSave={(v) => saveCategoryIdeal(compartmentId, currentMonth, c.id, v)}
                      />
                    </span>
                  </span>
                </div>
                <button
                  className="btn icon"
                  title="Mover para cima"
                  disabled={i === 0}
                  onClick={() => moveCategory(compartmentId, categories, c.id, 'up')}
                >
                  <ChevronUp size={15} aria-hidden />
                </button>
                <button
                  className="btn icon"
                  title="Mover para baixo"
                  disabled={i === categories.length - 1}
                  onClick={() => moveCategory(compartmentId, categories, c.id, 'down')}
                >
                  <ChevronDown size={15} aria-hidden />
                </button>
                {!c.isDefault ? (
                  <button
                    className="btn icon danger"
                    title="Remover categoria"
                    onClick={() => setRemoveTarget({ kind: 'category', item: c })}
                  >
                    <X size={16} aria-hidden />
                  </button>
                ) : (
                  <span className="btn-placeholder" />
                )}
              </li>
            );
          })}
        </ul>
        <form className="inline-form" onSubmit={submitCategory}>
          <span className="field">
            <input
              placeholder="Nome (ex.: Mercado)"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
          </span>
          <MoneyInput valueCents={catIdeal} onChange={setCatIdeal} placeholder="Ideal do mês" />
          <button className="btn primary" type="submit" disabled={busy}>
            Adicionar
          </button>
        </form>
      </section>

      {fixedModal !== 'closed' && (
        <FixedExpenseModal
          initial={fixedModal === 'new' ? null : fixedModal}
          busy={busy}
          onSave={saveFixed}
          onCancel={() => setFixedModal('closed')}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title={removeTarget.kind === 'fixed' ? 'Remover gasto fixo?' : 'Remover categoria?'}
          confirmLabel="Remover"
          busy={busy}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        >
          {removeTarget.kind === 'fixed' ? (
            <p>
              <strong>{removeTarget.item.name}</strong> será removido do mês atual em aberto e não
              aparecerá nos próximos meses. Meses já fechados não são alterados.
            </p>
          ) : (
            <p>
              <strong>{removeTarget.item.name}</strong> não estará mais disponível para novos
              gastos. Se já houver lançamentos neste mês, a linha permanece na tabela até o mês
              virar; caso contrário, é removida agora.
            </p>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}
