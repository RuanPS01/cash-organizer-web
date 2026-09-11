import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import {
  addOrigin,
  moveOrigin,
  removeOrigin,
  saveOrigin,
  setDefaultOrigin,
} from '../services/origins';
import type { OriginInput } from '../services/origins';
import { ConfirmModal } from './shared';
import { writeErrorMessage } from '../utils/errors';
import {
  ORIGIN_COLOR_LABELS,
  ORIGIN_COLOR_OPTIONS,
  ORIGIN_ICON_LABELS,
  ORIGIN_ICON_OPTIONS,
  OriginIcon,
} from './OriginIcon';
import type { Origin, OriginColorKey, OriginIconKey } from '../types';

/**
 * Modal de criação e edição da origem: nome, grade de ícones e fileira de
 * tons. A fileira mostra o próprio ícone escolhido em cada tom, para o
 * usuário ver o resultado antes de salvar (é assim que se diferencia um
 * cartão de outro na lista).
 */
function OriginModal(props: {
  initial: Origin | null;
  busy: boolean;
  /** Falha vinda da gravação; o modal segue aberto para não perder o que foi digitado. */
  saveError: string | null;
  onSave: (input: OriginInput) => void;
  onCancel: () => void;
}) {
  const { initial } = props;
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState<OriginIconKey>(initial?.icon ?? 'card');
  const [color, setColor] = useState<OriginColorKey>(initial?.color ?? 'gold');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Informe o nome da origem.');
      return;
    }
    props.onSave({ name, icon, color });
  };

  return (
    <ConfirmModal
      title={initial ? 'Editar origem' : 'Nova origem'}
      confirmLabel="Salvar"
      busy={props.busy}
      onConfirm={submit}
      onCancel={props.onCancel}
    >
      <div className="modal-form">
        <span className="field">
          <input
            placeholder="Nome (ex.: Cartão C6 (Crédito))"
            value={name}
            autoFocus={!initial}
            onChange={(e) => setName(e.target.value)}
          />
        </span>

        <span className="origin-preview">
          <OriginIcon icon={icon} color={color} size={18} />
          {name.trim() || 'Prévia da origem'}
        </span>

        <span className="muted small">Ícone</span>
        <div className="icon-grid" role="radiogroup" aria-label="Ícone da origem">
          {ORIGIN_ICON_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={icon === key}
              className={`icon-option${icon === key ? ' selected' : ''}`}
              title={ORIGIN_ICON_LABELS[key]}
              onClick={() => setIcon(key)}
            >
              <OriginIcon icon={key} color={color} size={20} />
              <span>{ORIGIN_ICON_LABELS[key]}</span>
            </button>
          ))}
        </div>

        <span className="muted small">Cor do ícone</span>
        <div className="color-row" role="radiogroup" aria-label="Cor do ícone">
          {ORIGIN_COLOR_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={color === key}
              className={`color-swatch${color === key ? ' selected' : ''}`}
              title={ORIGIN_COLOR_LABELS[key]}
              onClick={() => setColor(key)}
            >
              <OriginIcon icon={icon} color={key} size={18} />
            </button>
          ))}
        </div>

        {(error ?? props.saveError) && (
          <p className="form-error">{error ?? props.saveError}</p>
        )}
      </div>
    </ConfirmModal>
  );
}

/**
 * Cadastro das origens do gasto (de onde o dinheiro saiu). A primeira origem
 * criada já nasce como padrão, para que o seletor da tela de novo gasto nunca
 * fique sem pré-seleção.
 */
export function ManageOrigins(props: {
  compartmentId: string;
  currentMonth: string;
  origins: Origin[];
}) {
  const { compartmentId, currentMonth, origins } = props;
  const [modal, setModal] = useState<'closed' | 'new' | Origin>('closed');
  const [removeTarget, setRemoveTarget] = useState<Origin | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sem este catch a gravação recusada (regra do Firestore que ainda não
  // libera a coleção, por exemplo) apagava o "Aguarde…" e deixava o modal
  // aberto sem dizer nada, como se o botão não tivesse funcionado.
  const save = async (input: OriginInput) => {
    setBusy(true);
    setError(null);
    try {
      if (modal === 'new') {
        await addOrigin(compartmentId, currentMonth, {
          ...input,
          isDefault: origins.length === 0,
        });
      } else if (modal !== 'closed') {
        await saveOrigin(compartmentId, currentMonth, modal.id, input);
      }
      setModal('closed');
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    setError(null);
    try {
      await removeOrigin(compartmentId, currentMonth, removeTarget.id);
      setRemoveTarget(null);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openModal = (target: 'new' | Origin) => {
    setError(null);
    setModal(target);
  };

  return (
    // O modal fica fora do .card de propósito: clip-path recorta qualquer
    // descendente, inclusive position: fixed, e o modal apareceria cortado
    // pelos limites do card.
    <>
      <section className="card">
        <h3>Origens do gasto</h3>
        <p className="card-hint">
          A origem diz de onde o dinheiro saiu (cartão, Pix, dinheiro), aparece no seletor da tela
          de novo gasto e no cadastro do gasto fixo, e é por ela que a aba Pagamento acompanha o
          que já foi pago no mês. A origem <strong>padrão</strong> vem pré-selecionada; use
          "tornar padrão" para trocar.
        </p>
        <ul className="manage-list">
          {origins.map((o, i) => (
            <li key={o.id}>
              <div className="row-main">
                <span className="name">
                  <OriginIcon icon={o.icon} color={o.color} size={16} />
                  {o.name}
                  {o.isDefault ? (
                    <span className="badge padrao">padrão</span>
                  ) : (
                    <button
                      className="mini-btn"
                      title="Tornar esta a origem padrão (pré-selecionada ao adicionar gasto)"
                      onClick={() => setDefaultOrigin(compartmentId, origins, o.id)}
                    >
                      tornar padrão
                    </button>
                  )}
                </span>
              </div>
              {/* Os quatro botões vão num grupo só: em telas estreitas eles
                  descem juntos para a linha de baixo, sem quebrar no meio. */}
              <span className="row-actions">
                <button className="btn icon" title="Editar origem" onClick={() => openModal(o)}>
                  <Pencil size={15} aria-hidden />
                </button>
                <button
                  className="btn icon"
                  title="Mover para cima"
                  disabled={i === 0}
                  onClick={() => moveOrigin(compartmentId, origins, o.id, 'up')}
                >
                  <ChevronUp size={15} aria-hidden />
                </button>
                <button
                  className="btn icon"
                  title="Mover para baixo"
                  disabled={i === origins.length - 1}
                  onClick={() => moveOrigin(compartmentId, origins, o.id, 'down')}
                >
                  <ChevronDown size={15} aria-hidden />
                </button>
                <button
                  className="btn icon danger"
                  title="Remover origem"
                  onClick={() => setRemoveTarget(o)}
                >
                  <X size={16} aria-hidden />
                </button>
              </span>
            </li>
          ))}
          {origins.length === 0 && (
            <li className="muted">
              Nenhuma origem cadastrada. Sem origem, o seletor não aparece na tela de novo gasto e
              a aba Pagamento fica só com os gastos fixos.
            </li>
          )}
        </ul>
        <button className="btn primary" onClick={() => openModal('new')}>
          <Plus size={16} aria-hidden /> Nova origem
        </button>
        {modal === 'closed' && !removeTarget && error && <p className="form-error">{error}</p>}
      </section>

      {modal !== 'closed' && (
        <OriginModal
          initial={modal === 'new' ? null : modal}
          busy={busy}
          saveError={error}
          onSave={save}
          onCancel={() => setModal('closed')}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remover origem?"
          confirmLabel="Remover"
          busy={busy}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        >
          <p>
            <strong>{removeTarget.name}</strong> não estará mais disponível para novos gastos. Os
            lançamentos que já usaram essa origem continuam com o nome dela no histórico.
          </p>
          <p className="muted small">
            No mês em aberto, a linha dela na aba Pagamento some se nada tiver saído dessa origem;
            com gasto no mês, a linha fica até o mês virar.
          </p>
          {error && <p className="form-error">{error}</p>}
        </ConfirmModal>
      )}
    </>
  );
}
