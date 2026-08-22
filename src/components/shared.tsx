import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { digitsToCents, formatBRL } from '../utils/money';

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
        className="money-cell text-cell"
        disabled={props.disabled}
        onClick={() => {
          setText(props.value);
          setEditing(true);
        }}
        title={props.disabled ? undefined : 'Toque para editar'}
      >
        {props.value}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed && trimmed !== props.value) props.onSave(trimmed);
  };

  return (
    <span className="field inline">
      <input
        ref={inputRef}
        className="money-cell-input text-cell-input"
        value={text}
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
