import { useMemo } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { formatBRL } from '../utils/money';
import { dayKeyLabel } from '../utils/dates';
import { STATEMENT_FORMAT_LABEL } from '../utils/statement';
import type { DraftRow, ImportDraft, SuggestionSource } from '../services/imports';
import { OriginIcon } from './OriginIcon';
import type { Category, Origin } from '../types';

/** Como a IA está indo na organização da fatura aberta. */
export type AiRunState =
  | { status: 'off' }
  | { status: 'running' }
  | { status: 'done'; model: string }
  | { status: 'failed'; message: string };

const SOURCE_LABEL: Record<SuggestionSource, string> = {
  history: 'histórico',
  bank: 'categoria do banco',
  ai: 'IA',
  default: 'padrão',
};

// O valor do seletor junta categoria existente e categoria nova sugerida pela
// IA, que ainda não tem id: "c:" mais o id, ou "n:" mais o nome.
function selectValue(row: DraftRow): string {
  if (row.categoryId) return `c:${row.categoryId}`;
  if (row.newCategory) return `n:${row.newCategory}`;
  return '';
}

/**
 * Revisão da fatura importada: uma linha por compra nova, com a descrição
 * editável, a categoria (sugerida pelo histórico, pela categoria do banco ou
 * pela IA) e a caixa que decide se ela entra. Compra parcelada entra como
 * gasto fixo parcelado, e pode virar lançamento só desta parcela. Compras que
 * já estavam no app não aparecem: o resumo de cima só conta quantas eram.
 */
export function ImportReview(props: {
  draft: ImportDraft;
  categories: Category[];
  origin: Origin | null;
  ai: AiRunState;
  busy: boolean;
  error: string | null;
  onRowChange: (id: number, patch: Partial<DraftRow>) => void;
  onToggleAll: (include: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { draft, categories, origin, ai, busy } = props;
  const rows = draft.rows;

  // Categorias novas sugeridas em qualquer linha ficam disponíveis em todas:
  // a IA pode ter sugerido "Pet" para uma compra e o usuário querer o mesmo
  // nome em outra.
  const suggestedNew = useMemo(() => {
    const names = new Map<string, string>();
    for (const r of rows) {
      if (r.newCategory && !categories.some((c) => c.name.toLowerCase() === r.newCategory?.toLowerCase())) {
        names.set(r.newCategory.toLowerCase(), r.newCategory);
      }
    }
    return [...names.values()];
  }, [rows, categories]);

  const totals = useMemo(() => {
    let expenses = 0;
    let expensesSum = 0;
    let fixed = 0;
    let fixedSum = 0;
    for (const r of rows) {
      if (!r.include) continue;
      if (r.kind === 'fixed') {
        fixed++;
        fixedSum += r.item.amount;
      } else {
        expenses++;
        expensesSum += r.item.amount;
      }
    }
    return { expenses, expensesSum, fixed, fixedSum };
  }, [rows]);

  const included = totals.expenses + totals.fixed;
  const allIncluded = rows.length > 0 && rows.every((r) => r.include);

  const changeCategory = (row: DraftRow, value: string) => {
    if (value.startsWith('c:')) {
      props.onRowChange(row.id, { categoryId: value.slice(2), newCategory: null });
    } else if (value.startsWith('n:')) {
      props.onRowChange(row.id, { categoryId: null, newCategory: value.slice(2) });
    }
  };

  return (
    <section className="card import-review">
      <div className="import-review-head">
        <h3>Revisar fatura</h3>
        <span className="muted small">
          {draft.fileName} · {STATEMENT_FORMAT_LABEL[draft.format]}
        </span>
      </div>

      <p className="card-hint">
        Confira a categoria de cada compra e toque em importar. Compra desmarcada não entra e{' '}
        <strong>não volta</strong> nas próximas importações. Compra parcelada entra como{' '}
        <strong>gasto fixo parcelado</strong>, e as próximas parcelas já ficam nos meses seguintes.
      </p>

      <div className="import-summary">
        <span>
          <strong>{rows.length}</strong> {rows.length === 1 ? 'compra nova' : 'compras novas'}
        </span>
        {draft.alreadyImported > 0 && (
          <span>
            <strong>{draft.alreadyImported}</strong> já no app
          </span>
        )}
        {draft.credits > 0 && (
          <span>
            <strong>{draft.credits}</strong> {draft.credits === 1 ? 'pagamento ou crédito' : 'pagamentos e créditos'} fora
          </span>
        )}
        {draft.invalid > 0 && (
          <span className="neg">
            <strong>{draft.invalid}</strong> {draft.invalid === 1 ? 'linha ilegível' : 'linhas ilegíveis'}
          </span>
        )}
      </div>

      <p className="import-origin">
        Origem:{' '}
        {origin ? (
          <span className="badge origin">
            <OriginIcon icon={origin.icon} color={origin.color} />
            {origin.name}
          </span>
        ) : (
          <span className="badge origin empty">sem origem</span>
        )}
      </p>

      {ai.status !== 'off' && (
        <p className={`import-ai-status${ai.status === 'failed' ? ' neg' : ''}`}>
          <Sparkles size={14} aria-hidden />
          {ai.status === 'running' && 'Organizando com IA…'}
          {ai.status === 'done' && `Categorias e descrições sugeridas por ${ai.model}.`}
          {ai.status === 'failed' &&
            `A IA não respondeu (${ai.message}). As sugestões vieram do histórico.`}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="muted">
          Nada novo nesta fatura: todas as compras já estavam no app ou foram ignoradas antes.
        </p>
      ) : (
        <>
          <div className="bulk-bar">
            <button
              type="button"
              className={`check-box${allIncluded ? ' checked' : ''}`}
              aria-label={allIncluded ? 'Desmarcar todas' : 'Marcar todas'}
              onClick={() => props.onToggleAll(!allIncluded)}
            >
              {allIncluded && <Check size={14} aria-hidden />}
            </button>
            <span className="muted small">
              {included} de {rows.length} marcadas
            </span>
          </div>

          <ul className="review-list">
            {rows.map((row) => {
              const { item } = row;
              const original = item.rawTitle !== row.description ? item.rawTitle : null;
              return (
                <li key={row.id} className={row.include ? '' : 'row-off'}>
                  <button
                    type="button"
                    className={`check-box${row.include ? ' checked' : ''}`}
                    aria-label={row.include ? 'Não importar esta compra' : 'Importar esta compra'}
                    onClick={() => props.onRowChange(row.id, { include: !row.include })}
                  >
                    {row.include && <Check size={14} aria-hidden />}
                  </button>

                  <span className="field inline review-desc">
                    <input
                      value={row.description}
                      aria-label="Descrição"
                      maxLength={120}
                      disabled={!row.include}
                      onChange={(e) => props.onRowChange(row.id, { description: e.target.value })}
                    />
                  </span>

                  <strong className="review-value">{formatBRL(item.amount)}</strong>

                  <span className="review-meta">
                    <span className="when">{dayKeyLabel(item.date)}</span>
                    {original && <span className="review-original">{original}</span>}
                    {item.card && <span className="review-original">{item.card}</span>}
                    {row.possibleDuplicate && (
                      <span className="badge miss">parece já lançada à mão</span>
                    )}
                  </span>

                  <span className="review-class">
                    {item.installment && (
                      <span className="review-kind" role="radiogroup" aria-label="Como importar a parcela">
                        <button
                          type="button"
                          className={`chip${row.kind === 'fixed' ? ' selected' : ''}`}
                          disabled={!row.include}
                          onClick={() => props.onRowChange(row.id, { kind: 'fixed' })}
                        >
                          Fixo {item.installment.current}/{item.installment.total}
                        </button>
                        <button
                          type="button"
                          className={`chip${row.kind === 'expense' ? ' selected' : ''}`}
                          disabled={!row.include}
                          onClick={() => props.onRowChange(row.id, { kind: 'expense' })}
                        >
                          Só esta parcela
                        </button>
                      </span>
                    )}
                    {row.kind === 'expense' && (
                      <>
                        <span className="field review-category">
                          <select
                            value={selectValue(row)}
                            aria-label="Categoria"
                            disabled={!row.include}
                            onChange={(e) => changeCategory(row, e.target.value)}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={`c:${c.id}`}>
                                {c.name}
                              </option>
                            ))}
                            {suggestedNew.map((name) => (
                              <option key={name} value={`n:${name}`}>
                                Nova: {name}
                              </option>
                            ))}
                          </select>
                        </span>
                        {row.include && row.source !== 'default' && (
                          <span className={`badge source${row.source === 'ai' ? ' ai' : ''}`}>
                            {SOURCE_LABEL[row.source]}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="import-totals">
            <span>
              <span className="muted small">Variáveis ({totals.expenses})</span>
              <strong>{formatBRL(totals.expensesSum)}</strong>
            </span>
            <span>
              <span className="muted small">Fixos parcelados ({totals.fixed})</span>
              <strong>{formatBRL(totals.fixedSum)}</strong>
            </span>
          </div>
        </>
      )}

      {props.error && <p className="form-error">{props.error}</p>}

      <div className="import-actions">
        <button type="button" className="btn ghost" onClick={props.onCancel} disabled={busy}>
          {rows.length === 0 ? 'Fechar' : 'Cancelar'}
        </button>
        {rows.length > 0 && (
          <button type="button" className="btn primary" onClick={props.onConfirm} disabled={busy}>
            {busy
              ? 'Importando…'
              : included === 0
                ? 'Ignorar todas'
                : `Importar ${included} ${included === 1 ? 'compra' : 'compras'}`}
          </button>
        )}
      </div>
    </section>
  );
}
