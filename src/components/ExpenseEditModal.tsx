import { useState } from 'react';
import { ConfirmModal, MoneyInput } from './shared';
import { dateFromDayKey, dayKey } from '../utils/dates';
import type { ExpenseEdit } from '../services/expenses';
import type { Category, Origin, VariableExpense } from '../types';

/** Opção de categoria ou de origem no seletor do modal de edição. */
type ClassOption = { id: string; name: string };

/**
 * Mantém na lista a categoria (ou a origem) que o lançamento já usa, mesmo que
 * ela tenha saído do cadastro: sem isso, salvar a descrição de um lançamento
 * antigo trocaria a classificação dele para a primeira opção da lista.
 */
function withCurrent(options: ClassOption[], id: string | null, name: string): ClassOption[] {
  if (!id || options.some((o) => o.id === id)) return options;
  return [...options, { id, name: name || 'Removido do cadastro' }];
}

/**
 * Edição completa de um lançamento: descrição, valor, data, categoria e
 * origem em um formulário só, com um botão de salvar. A data pode ser de
 * outro mês; o lançamento continua no mês em que foi feito, porque o mês do
 * app é a referência da fatura.
 */
export function ExpenseEditModal(props: {
  expense: VariableExpense;
  categories: Category[];
  origins: Origin[];
  busy: boolean;
  saveError: string | null;
  onConfirm: (patch: ExpenseEdit) => void;
  onCancel: () => void;
}) {
  const { expense } = props;
  const diaOriginal = dayKey(new Date(expense.createdAt));
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(expense.amount);
  const [day, setDay] = useState(diaOriginal);
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [originId, setOriginId] = useState(expense.originId ?? '');
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = withCurrent(props.categories, expense.categoryId, expense.categoryName);
  const originOptions = withCurrent(
    props.origins,
    expense.originId ?? null,
    expense.originName ?? '',
  );

  const submit = () => {
    setError(null);
    if (amount <= 0) {
      setError('Informe o valor do lançamento.');
      return;
    }
    const categoria = categoryOptions.find((c) => c.id === categoryId);
    if (!categoria) {
      setError('Escolha a categoria do lançamento.');
      return;
    }
    const origem = originOptions.find((o) => o.id === originId);
    const patch: ExpenseEdit = {
      amount,
      description: description.trim(),
      categoryId: categoria.id,
      categoryName: categoria.name,
      originId: origem?.id ?? null,
      originName: origem?.name ?? '',
    };
    // A data só entra no patch quando muda, e leva a hora original junto: os
    // lançamentos do mesmo dia mantêm a ordem em que foram incluídos.
    if (day !== diaOriginal) patch.date = dateFromDayKey(day, new Date(expense.createdAt));
    props.onConfirm(patch);
  };

  return (
    <ConfirmModal
      title="Editar lançamento"
      confirmLabel="Salvar"
      busy={props.busy}
      onConfirm={submit}
      onCancel={props.onCancel}
    >
      <div className="modal-form">
        <span className="field">
          <input
            placeholder="Descrição (opcional)"
            value={description}
            autoFocus
            onChange={(e) => setDescription(e.target.value)}
          />
        </span>
        <MoneyInput valueCents={amount} onChange={setAmount} placeholder="Valor" />
        <label>
          Data do gasto
          <span className="field">
            <input
              type="date"
              value={day}
              // "Limpar" no seletor do celular devolve valor vazio: volta para
              // a data original em vez de gravar um dia inválido.
              onChange={(e) => setDay(e.target.value || diaOriginal)}
            />
          </span>
        </label>
        <label>
          Categoria
          <span className="field">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categoryOptions.map((c) => (
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
            <select value={originId} onChange={(e) => setOriginId(e.target.value)}>
              <option value="">Sem origem</option>
              {originOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <p className="card-hint">
          A semana acompanha a data escolhida. O lançamento continua no mês em que foi feito,
          mesmo com data de outro mês.
        </p>
        {(error ?? props.saveError) && <p className="form-error">{error ?? props.saveError}</p>}
      </div>
    </ConfirmModal>
  );
}
