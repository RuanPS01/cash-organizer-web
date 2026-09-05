import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { digitsToCents, formatBRL } from '../utils/money';

// ---------------------------------------------------------------------------
// Marca do app
// ---------------------------------------------------------------------------

/**
 * Ladrilho da marca, igual ao ícone do PWA instalado: fundo preto, moldura
 * chanfrada de ouro e a carteira em gradiente de ouro. O glifo é o mesmo do
 * lucide-react, mas escrito à mão porque o componente de ícone só aceita cor
 * sólida em currentColor, e a marca precisa do gradiente.
 */
export function BrandMark(props: { big?: boolean }) {
  const lado = props.big ? 34 : 17;
  return (
    <span className={props.big ? 'brand-mark big' : 'brand-mark'} aria-hidden>
      <svg
        width={lado}
        height={lado}
        viewBox="0 0 24 24"
        fill="none"
        stroke="url(#marca-ouro)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <linearGradient id="marca-ouro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8dc" />
            <stop offset="42%" stopColor="#e7c95f" />
            <stop offset="74%" stopColor="#b78f24" />
            <stop offset="100%" stopColor="#f2e0a2" />
          </linearGradient>
        </defs>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal de confirmação
// ---------------------------------------------------------------------------

export function ConfirmModal(props: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={props.busy ? undefined : props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{props.title}</h3>
        <div className="modal-body">{props.children}</div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={props.onCancel} disabled={props.busy}>
            {props.cancelLabel ?? 'Cancelar'}
          </button>
          <button className="btn primary" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? 'Aguarde…' : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campo de valor monetário (digitação por dígitos, sempre formatado)
// ---------------------------------------------------------------------------

export function MoneyInput(props: {
  valueCents: number;
  onChange: (cents: number) => void;
  placeholder?: string;
  big?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  // A moldura chanfrada vem do invólucro .field: input não aceita
  // pseudo-elemento, e é o ::before que desenha o miolo escuro por dentro da
  // moldura em ouro. Com "big" o invólucro vira a placa de valor.
  return (
    <span className={props.big ? 'field plate' : 'field'}>
      <input
        id={props.id}
        className={props.big ? 'money-input big' : 'money-input'}
        inputMode="numeric"
        autoFocus={props.autoFocus}
        placeholder={props.placeholder ?? 'R$ 0,00'}
        value={props.valueCents > 0 ? formatBRL(props.valueCents) : ''}
        onChange={(e) => props.onChange(digitsToCents(e.target.value))}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Valor monetário editável (clique para editar, Enter/blur salva)
// ---------------------------------------------------------------------------

export function EditableMoney(props: {
  valueCents: number;
  onSave: (cents: number) => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [cents, setCents] = useState(props.valueCents);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        className={`money-cell${props.muted ? ' muted' : ''}`}
        disabled={props.disabled}
        onClick={() => {
          setCents(props.valueCents);
          setEditing(true);
        }}
        title={props.disabled ? undefined : 'Toque para editar'}
      >
        {formatBRL(props.valueCents)}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (cents !== props.valueCents) props.onSave(cents);
  };

  return (
    <span className="field inline">
      <input
        ref={inputRef}
        className="money-cell-input"
        inputMode="numeric"
        value={cents > 0 ? formatBRL(cents) : ''}
        placeholder="R$ 0,00"
        onChange={(e) => setCents(digitsToCents(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Texto editável (clique para editar, Enter/blur salva; vazio cancela)
// ---------------------------------------------------------------------------

export function EditableText(props: {
  value: string;
  onSave: (value: string) => void;
  disabled?: boolean;
  /** Texto exibido quando o valor está vazio (ex.: "Sem descrição"). */
  placeholder?: string;
  /** Aceita salvar vazio; sem isto, campo vazio cancela a edição. */
  allowEmpty?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(props.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button
        className={`money-cell text-cell${props.value ? '' : ' muted'}`}
        disabled={props.disabled}
        onClick={() => {
          setText(props.value);
          setEditing(true);
        }}
        title={props.disabled ? undefined : 'Toque para editar'}
      >
        {props.value || props.placeholder || ''}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (!trimmed && !props.allowEmpty) return;
    if (trimmed !== props.value) props.onSave(trimmed);
  };

  return (
    <span className="field inline">
      <input
        ref={inputRef}
        className="money-cell-input text-cell-input"
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Barra de progresso simples (usada nas estatísticas e no informe)
// ---------------------------------------------------------------------------

export function ProgressBar(props: { ratio: number; danger?: boolean }) {
  const pct = Math.max(0, Math.min(1, props.ratio)) * 100;
  const over = props.danger ?? props.ratio > 1;
  return (
    <div className="progress">
      <div
        className={`progress-fill${over ? ' over' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
