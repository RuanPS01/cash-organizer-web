import { useState } from 'react';
import type { FormEvent } from 'react';
import { createCompartment, openCompartment, slugify } from '../services/compartments';
import { saveSession } from '../services/session';
import { ensureMonth } from '../services/months';
import { BrandMark, ConfirmModal } from './shared';
import type { Compartment } from '../types';

export function LoginScreen(props: { onEnter: (compartment: Compartment) => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);

  const finish = async (compartment: Compartment) => {
    await saveSession(name, password, compartment.id);
    await ensureMonth(compartment.id, compartment.currentMonth);
    props.onEnter(compartment);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!slugify(name)) {
      setError('Informe o nome do compartimento.');
      return;
    }
    if (password.length < 4) {
      setError('A senha deve ter pelo menos 4 caracteres.');
      return;
    }
    setBusy(true);
    try {
      const result = await openCompartment(name, password);
      if (result.kind === 'ok') {
        await finish(result.compartment);
      } else if (result.kind === 'wrong-password') {
        setError('Senha incorreta para este compartimento.');
      } else {
        setConfirmCreate(true);
      }
    } catch (err) {
      console.error(err);
      setError('Não foi possível conectar. Verifique sua internet e tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const compartment = await createCompartment(name, password);
      await finish(compartment);
    } catch (err) {
      console.error(err);
      setError('Erro ao criar o compartimento. Tente novamente.');
      setConfirmCreate(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <BrandMark big />
        </div>
        <h1 className="h2-gold">Cash Organizer</h1>
        <p className="login-hint">
          Entre em um <strong>compartimento financeiro</strong>, a subdivisão onde ficam suas
          contas e gastos. Se ele ainda não existir, você poderá criá-lo.
        </p>
        <label>
          Nome do compartimento
          <span className="field">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: casa, pessoal, viagem…"
              autoComplete="username"
            />
          </span>
        </label>
        <label>
          Senha
          <span className="field">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha do compartimento"
              autoComplete="current-password"
            />
          </span>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      {confirmCreate && (
        <ConfirmModal
          title="Criar novo compartimento?"
          confirmLabel="Criar compartimento"
          busy={busy}
          onConfirm={create}
          onCancel={() => setConfirmCreate(false)}
        >
          <p>
            O compartimento <strong>{name.trim()}</strong> ainda não existe. Deseja criá-lo com a
            senha informada?
          </p>
          <p className="muted">Ele já virá com a categoria padrão "Avulso".</p>
        </ConfirmModal>
      )}
    </div>
  );
}
