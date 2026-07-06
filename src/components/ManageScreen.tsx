import { useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import {
  addCategory,
  addFixedExpense,
  removeCategory,
  removeFixedExpense,
  updateCategory,
  updateFixedExpense,
} from '../services/expenses';
import { EditableMoney, MoneyInput, ConfirmModal } from './shared';
import type { Category, FixedExpense } from '../types';

export function ManageScreen(props: {
  compartmentId: string;
  currentMonth: string;
  fixedExpenses: FixedExpense[];
  categories: Category[];
}) {
  const { compartmentId, currentMonth, fixedExpenses, categories } = props;

  const [fixedName, setFixedName] = useState('');
  const [fixedAmount, setFixedAmount] = useState(0);
  const [fixedIdeal, setFixedIdeal] = useState(0);
  const [catName, setCatName] = useState('');
  const [catIdeal, setCatIdeal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<
    { kind: 'fixed'; item: FixedExpense } | { kind: 'category'; item: Category } | null
  >(null);

  const submitFixed = async (e: FormEvent) => {
    e.preventDefault();
    if (!fixedName.trim() || fixedAmount <= 0 || busy) return;
    setBusy(true);
    try {
      await addFixedExpense(compartmentId, currentMonth, {
        name: fixedName,
        amount: fixedAmount,
        idealAmount: fixedIdeal || undefined,
      });
      setFixedName('');
      setFixedAmount(0);
      setFixedIdeal(0);
    } finally {
      setBusy(false);
    }
  };

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
        <h2>Gerenciar</h2>
      </header>

      <section className="card">
        <h3>Gastos fixos</h3>
        <p className="muted small">
          O valor fixo é usado como gasto ideal automaticamente, a menos que você defina outro
          ideal. Novos fixos entram no mês corrente em aberto.
        </p>
        <ul className="manage-list">
          {fixedExpenses.map((f) => (
            <li key={f.id}>
              <span className="name">{f.name}</span>
              <span className="values">
                <span className="muted small">valor</span>
                <EditableMoney
                  valueCents={f.amount}
                  onSave={(v) => updateFixedExpense(compartmentId, f.id, { amount: v })}
                />
                <span className="muted small">ideal</span>
                <EditableMoney
                  valueCents={f.idealAmount}
                  muted
                  onSave={(v) => updateFixedExpense(compartmentId, f.id, { idealAmount: v })}
                />
              </span>
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
        <form className="inline-form" onSubmit={submitFixed}>
          <input
            placeholder="Nome (ex.: Aluguel)"
            value={fixedName}
            onChange={(e) => setFixedName(e.target.value)}
          />
          <MoneyInput valueCents={fixedAmount} onChange={setFixedAmount} placeholder="Valor" />
          <MoneyInput
            valueCents={fixedIdeal}
            onChange={setFixedIdeal}
            placeholder="Ideal (opcional)"
          />
          <button className="btn primary" type="submit" disabled={busy}>
            Adicionar
          </button>
        </form>
      </section>

      <section className="card">
        <h3>Categorias de gastos variáveis</h3>
        <p className="muted small">
          Defina o gasto ideal do mês por categoria. Ele é usado nos limites semanais e mensais.
        </p>
        <ul className="manage-list">
          {categories.map((c) => (
            <li key={c.id}>
              <span className="name">
                {c.name}
                {c.isDefault && <span className="badge open">padrão</span>}
              </span>
              <span className="values">
                <span className="muted small">ideal</span>
                <EditableMoney
                  valueCents={c.idealAmount}
                  onSave={(v) => updateCategory(compartmentId, c.id, { idealAmount: v })}
                />
              </span>
              {!c.isDefault && (
                <button
                  className="btn icon danger"
                  title="Remover categoria"
                  onClick={() => setRemoveTarget({ kind: 'category', item: c })}
                >
                  <X size={16} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={submitCategory}>
          <input
            placeholder="Nome (ex.: Mercado)"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
          <MoneyInput valueCents={catIdeal} onChange={setCatIdeal} placeholder="Ideal do mês" />
          <button className="btn primary" type="submit" disabled={busy}>
            Adicionar
          </button>
        </form>
      </section>

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
