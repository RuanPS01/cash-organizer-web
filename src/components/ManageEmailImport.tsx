import { useState } from 'react';
import { Mail, Pencil, Plus, X } from 'lucide-react';
import {
  DEFAULT_LOOKBACK_DAYS,
  EMAIL_PROVIDER_LABEL,
  connectMailbox,
  emailImportAvailable,
  emailProviderAvailable,
  providerOf,
  saveEmailSettings,
} from '../services/emailImport';
import type { EmailConfig, EmailSenderConfig } from '../services/emailImport';
import { compartmentSecret } from '../services/session';
import { useEmailConfig } from '../hooks/useMonthData';
import { writeErrorMessage } from '../utils/errors';
import { ConfirmModal } from './shared';
import { OriginIcon } from './OriginIcon';
import { EMAIL_PROVIDERS } from '../types';
import type { EmailProvider, Origin } from '../types';

const LOOKBACK_OPTIONS = [15, 30, 45, 60, 90];

/** Modal do remetente de fatura: endereço, origem e senha do ZIP. */
function SenderModal(props: {
  initial: EmailSenderConfig | null;
  origins: Origin[];
  busy: boolean;
  saveError: string | null;
  onSave: (sender: EmailSenderConfig) => void;
  onCancel: () => void;
}) {
  const { initial, origins } = props;
  const [address, setAddress] = useState(initial?.address ?? '');
  const defaultOrigin = origins.find((o) => o.isDefault) ?? origins[0];
  const [originId, setOriginId] = useState<string | null>(
    initial ? initial.originId : (defaultOrigin?.id ?? null),
  );
  const [zipPassword, setZipPassword] = useState(initial?.zipPassword ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const clean = address.trim().toLowerCase();
    if (!clean || /\s/.test(clean)) {
      setError('Informe o endereço do remetente (ex.: todomundo@nubank.com.br) ou só o domínio.');
      return;
    }
    const origin = origins.find((o) => o.id === originId);
    props.onSave({
      address: clean,
      originId: origin?.id ?? null,
      originName: origin?.name ?? '',
      zipPassword,
    });
  };

  return (
    <ConfirmModal
      title={initial ? 'Editar remetente' : 'Novo remetente de fatura'}
      confirmLabel="Salvar"
      busy={props.busy}
      onConfirm={submit}
      onCancel={props.onCancel}
    >
      <div className="modal-form">
        <span className="field">
          <input
            placeholder="Remetente (ex.: nubank.com.br)"
            value={address}
            autoFocus={!initial}
            inputMode="email"
            autoCapitalize="none"
            onChange={(e) => setAddress(e.target.value)}
          />
        </span>
        <p className="muted small">
          Vale o endereço completo ou só o domínio: "c6bank.com.br" casa com qualquer email do C6.
        </p>

        <span className="muted small">Origem da fatura</span>
        <div className="chip-row" role="radiogroup" aria-label="Origem da fatura">
          {origins.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`chip${originId === o.id ? ' selected' : ''}`}
              onClick={() => setOriginId(o.id)}
            >
              <OriginIcon icon={o.icon} color={o.color} />
              {o.name}
            </button>
          ))}
          <button
            type="button"
            className={`chip${originId === null ? ' selected' : ''}`}
            onClick={() => setOriginId(null)}
          >
            Sem origem
          </button>
        </div>

        <span className="field">
          <input
            type="password"
            placeholder="Senha do ZIP (opcional)"
            value={zipPassword}
            autoComplete="off"
            onChange={(e) => setZipPassword(e.target.value)}
          />
        </span>
        <p className="muted small">
          Para banco que manda a fatura em ZIP protegido, como o C6. A senha fica guardada cifrada
          com a senha deste compartimento.
        </p>

        {(error ?? props.saveError) && <p className="form-error">{error ?? props.saveError}</p>}
      </div>
    </ConfirmModal>
  );
}

/**
 * Seção "Faturas por email" da tela Gerenciar: as caixas conectadas (Gmail ou
 * conta Microsoft), os remetentes de fatura (cada um com a origem e a senha do
 * ZIP) e quantos dias para trás a busca olha. A busca em si fica na aba
 * Adicionar.
 */
export function ManageEmailImport(props: { compartmentId: string; origins: Origin[] }) {
  const { compartmentId, origins } = props;
  const { loading, config } = useEmailConfig(compartmentId);
  const [modal, setModal] = useState<'closed' | 'new' | number>('closed');
  const [removeTarget, setRemoveTarget] = useState<{ kind: 'mailbox' | 'sender'; index: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = emailImportAvailable();

  // Toda mudança grava a configuração inteira: é um documento pequeno, e a
  // senha do ZIP precisa ser cifrada de novo junto.
  const persist = async (next: Omit<EmailConfig, 'locked'>) => {
    const secret = compartmentSecret(compartmentId);
    if (!secret) {
      throw new Error('Saia e entre de novo no compartimento para gravar as senhas.');
    }
    await saveEmailSettings(compartmentId, secret, next);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : writeErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Sem espera antes do connectMailbox: a janela de login só abre dentro do
  // gesto do usuário.
  const connect = (provider: EmailProvider) =>
    run(async () => {
      const email = await connectMailbox(provider);
      if (config.mailboxes.some((m) => m.email === email && providerOf(m) === provider)) return;
      await persist({
        ...config,
        mailboxes: [...config.mailboxes, { email, provider, addedAt: Date.now() }],
      });
    });

  const saveSender = async (sender: EmailSenderConfig) => {
    const senders =
      modal === 'new'
        ? [...config.senders, sender]
        : config.senders.map((s, i) => (i === modal ? sender : s));
    const ok = await run(() => persist({ ...config, senders }));
    if (ok) setModal('closed');
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const next =
      removeTarget.kind === 'mailbox'
        ? { ...config, mailboxes: config.mailboxes.filter((_, i) => i !== removeTarget.index) }
        : { ...config, senders: config.senders.filter((_, i) => i !== removeTarget.index) };
    const ok = await run(() => persist(next));
    if (ok) setRemoveTarget(null);
  };

  const setLookback = (days: number) => run(() => persist({ ...config, lookbackDays: days }));

  return (
    <>
      <section className="card">
        <h3>Faturas por email</h3>
        <p className="card-hint">
          Conecte as caixas onde as faturas chegam (Gmail, Outlook ou Hotmail) e cadastre os{' '}
          <strong>remetentes</strong> de cada banco. Na aba Adicionar, o botão de cada caixa
          procura os anexos CSV ou ZIP desses remetentes e abre a mesma revisão da fatura anexada à
          mão. O acesso é só de leitura e a busca roda quando você pede.
        </p>
        {!available && (
          <p className="form-error">
            A busca no email precisa do id do app no Google (VITE_GOOGLE_CLIENT_ID) ou na
            Microsoft (VITE_MICROSOFT_CLIENT_ID) no build. Sem eles, os remetentes ficam
            guardados, mas a busca fica desligada.
          </p>
        )}
        {config.locked && (
          <p className="form-error">
            Alguma senha de ZIP gravada não abriu com a senha deste compartimento. Edite o
            remetente e digite a senha de novo.
          </p>
        )}

        <span className="settings-subtitle">Caixas de email</span>
        <ul className="manage-list">
          {config.mailboxes.map((m, i) => (
            <li key={`${providerOf(m)}:${m.email}`}>
              <div className="row-main">
                <span className="name mailbox-name">
                  <Mail size={15} aria-hidden /> {m.email}
                </span>
                <span className="values">
                  <span className="badge provider">{EMAIL_PROVIDER_LABEL[providerOf(m)]}</span>
                </span>
              </div>
              <span className="row-actions">
                <button
                  className="btn icon danger"
                  title="Desconectar caixa"
                  onClick={() => setRemoveTarget({ kind: 'mailbox', index: i })}
                >
                  <X size={16} aria-hidden />
                </button>
              </span>
            </li>
          ))}
          {!loading && config.mailboxes.length === 0 && (
            <li className="muted">Nenhuma caixa conectada.</li>
          )}
        </ul>
        <div className="mailbox-connect">
          {EMAIL_PROVIDERS.filter(emailProviderAvailable).map((p) => (
            <button key={p} className="btn" onClick={() => connect(p)} disabled={busy}>
              <Plus size={16} aria-hidden /> Conectar {EMAIL_PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>

        <span className="settings-subtitle">Remetentes de fatura</span>
        <ul className="manage-list">
          {config.senders.map((s, i) => {
            const origin = origins.find((o) => o.id === s.originId);
            return (
              <li key={`${s.address}-${i}`}>
                <div className="row-main">
                  <span className="name">{s.address}</span>
                  <span className="values">
                    <span className="badge origin">
                      {origin && <OriginIcon icon={origin.icon} color={origin.color} />}
                      {origin?.name || s.originName || 'sem origem'}
                    </span>
                    {s.zipPassword && <span className="badge installment">ZIP com senha</span>}
                  </span>
                </div>
                <span className="row-actions">
                  <button className="btn icon" title="Editar remetente" onClick={() => setModal(i)}>
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button
                    className="btn icon danger"
                    title="Remover remetente"
                    onClick={() => setRemoveTarget({ kind: 'sender', index: i })}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
          {!loading && config.senders.length === 0 && (
            <li className="muted">Nenhum remetente cadastrado.</li>
          )}
        </ul>
        <div className="settings-row">
          <button className="btn primary" onClick={() => setModal('new')} disabled={busy}>
            <Plus size={16} aria-hidden /> Novo remetente
          </button>
          <label className="settings-inline">
            Buscar nos últimos
            <span className="field">
              <select
                value={config.lookbackDays || DEFAULT_LOOKBACK_DAYS}
                disabled={busy}
                onChange={(e) => setLookback(Number(e.target.value))}
              >
                {LOOKBACK_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
        {modal === 'closed' && !removeTarget && error && <p className="form-error">{error}</p>}
      </section>

      {modal !== 'closed' && (
        <SenderModal
          initial={modal === 'new' ? null : config.senders[modal]}
          origins={origins}
          busy={busy}
          saveError={error}
          onSave={saveSender}
          onCancel={() => setModal('closed')}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title={removeTarget.kind === 'mailbox' ? 'Desconectar caixa?' : 'Remover remetente?'}
          confirmLabel={removeTarget.kind === 'mailbox' ? 'Desconectar' : 'Remover'}
          busy={busy}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        >
          <p>
            {removeTarget.kind === 'mailbox' ? (
              <>
                A caixa <strong>{config.mailboxes[removeTarget.index]?.email}</strong> sai da busca
                de faturas. Para revogar o acesso de vez, remova o app em myaccount.google.com, na
                seção de apps com acesso à conta.
              </>
            ) : (
              <>
                As faturas de <strong>{config.senders[removeTarget.index]?.address}</strong> deixam
                de ser buscadas. O que já foi importado continua no app.
              </>
            )}
          </p>
          {error && <p className="form-error">{error}</p>}
        </ConfirmModal>
      )}
    </>
  );
}
