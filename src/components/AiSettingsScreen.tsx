import { useEffect, useState } from 'react';
import { ChevronLeft, KeyRound, ListChecks, Sparkles } from 'lucide-react';
import { DEFAULT_AI_INSTRUCTIONS, removeAiSettings, saveAiSettings, testAiChain } from '../services/ai';
import { AI_PROVIDER_LABEL, aiChainUsable, chainHealth, providerMessage } from '../services/aiProviders';
import type { AiEntryHealth } from '../services/aiProviders';
import { compartmentSecret } from '../services/session';
import { useAiConfig } from '../hooks/useMonthData';
import { writeErrorMessage } from '../utils/errors';
import { ConfirmModal } from './shared';
import { AiModelChain } from './AiModelChain';
import type { AiInstructions, AiModelEntry } from '../types';

type Tab = 'provider' | 'instructions';

/**
 * Configurações de IA, aberta pelo botão do topo: a fila de modelos (provedor,
 * modelo e chave de cada um) e as instruções usadas para organizar a fatura.
 * Tudo vale para o compartimento inteiro, em qualquer aparelho, e as chaves
 * ficam cifradas com a senha dele.
 */
export function AiSettingsScreen(props: { compartmentId: string; onBack: () => void }) {
  const { compartmentId } = props;
  const { loading, config } = useAiConfig(compartmentId);
  const [tab, setTab] = useState<Tab>('provider');
  const [chain, setChain] = useState<AiModelEntry[]>(config.chain);
  const [instructions, setInstructions] = useState<AiInstructions>(config.instructions);
  const [dirty, setDirty] = useState(false);
  const [health, setHealth] = useState<AiEntryHealth[]>([]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // A configuração chega por assinatura: enquanto o usuário não mexeu, a tela
  // acompanha o que está gravado (inclusive o que outro aparelho salvou).
  useEffect(() => {
    if (dirty) return;
    setChain(config.chain);
    setInstructions(config.instructions);
  }, [config, dirty]);

  useEffect(() => {
    let cancelled = false;
    chainHealth(chain).then((h) => {
      if (!cancelled) setHealth(h);
    });
    return () => {
      cancelled = true;
    };
  }, [chain, testing]);

  const changeChain = (next: AiModelEntry[]) => {
    setChain(next);
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    const secret = compartmentSecret(compartmentId);
    if (!secret) {
      setMessage({ kind: 'error', text: 'Saia e entre de novo no compartimento para gravar as chaves.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveAiSettings(compartmentId, secret, { chain, instructions });
      setDirty(false);
      setMessage({ kind: 'ok', text: 'Configuração salva.' });
    } catch (err) {
      setMessage({ kind: 'error', text: writeErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const r = await testAiChain(chain);
      setMessage({ kind: 'ok', text: `Respondeu: ${AI_PROVIDER_LABEL[r.provider]}, modelo ${r.model}.` });
    } catch (err) {
      setMessage({ kind: 'error', text: providerMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeAiSettings(compartmentId);
      setDirty(false);
      setConfirmRemove(false);
      setMessage({ kind: 'ok', text: 'Configuração removida. A importação segue funcionando sem IA.' });
    } catch (err) {
      setMessage({ kind: 'error', text: writeErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const usable = aiChainUsable(chain);

  return (
    <div className="screen">
      <header className="subpage-header">
        <button className="btn icon" onClick={props.onBack} aria-label="Voltar" title="Voltar">
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="subpage-title">
          <h2 className="h2-gold ai-title">
            <Sparkles size={20} aria-hidden /> Configurações de IA
          </h2>
          <span className="muted small">
            Provedor, modelos e instruções usadas para organizar as faturas importadas.
          </span>
        </div>
      </header>

      <div className="subtabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'provider'}
          className={`subtab${tab === 'provider' ? ' active' : ''}`}
          onClick={() => setTab('provider')}
        >
          <KeyRound size={14} aria-hidden /> Provedor e credenciais
        </button>
        <button
          role="tab"
          aria-selected={tab === 'instructions'}
          className={`subtab${tab === 'instructions' ? ' active' : ''}`}
          onClick={() => setTab('instructions')}
        >
          <ListChecks size={14} aria-hidden /> Instruções
        </button>
      </div>

      {tab === 'provider' && (
        <section className="card">
          <h3>Provedor e credenciais</h3>
          <p className="card-hint">
            Configure o provedor de IA, o modelo e a chave de API usados para sugerir a categoria e
            a descrição de cada compra na importação da fatura. A chamada sai direto deste
            navegador para o provedor.
          </p>
          {config.locked && (
            <p className="form-error">
              Alguma chave gravada não abriu com a senha deste compartimento. Digite a chave de novo
              e salve.
            </p>
          )}
          <span className="settings-subtitle">Modelos</span>
          <p className="muted small ai-chain-hint">
            Quando um modelo atinge o limite de uso ou falha, o app tenta o próximo da lista
            sozinho. O modelo que bateu no limite sai da frente por alguns minutos, e as próximas
            chamadas já começam pelo seguinte.
          </p>
          {loading ? (
            <p className="muted">Carregando…</p>
          ) : (
            <AiModelChain chain={chain} health={health} onChange={changeChain} />
          )}
        </section>
      )}

      {tab === 'instructions' && (
        <section className="card">
          <h3>Instruções para organizar a fatura</h3>
          <p className="card-hint">
            Regras suas que a IA segue ao escolher a categoria e escrever a descrição de cada
            compra, uma por linha (ex.: "Uber e 99 vão em Transporte"). A IA também olha o que
            você já importou, então não precisa repetir o que o histórico já mostra.
          </p>
          <span className="field">
            <textarea
              className="ai-instructions"
              rows={8}
              maxLength={4000}
              value={instructions.categorize}
              onChange={(e) => {
                setInstructions({ categorize: e.target.value });
                setDirty(true);
                setMessage(null);
              }}
            />
          </span>
          <button
            type="button"
            className="mini-btn ai-restore"
            onClick={() => {
              setInstructions(DEFAULT_AI_INSTRUCTIONS);
              setDirty(true);
            }}
          >
            Restaurar padrão sugerido
          </button>
        </section>
      )}

      {message && <p className={message.kind === 'ok' ? 'flash' : 'form-error'}>{message.text}</p>}

      <div className="ai-actions">
        {config.saved && (
          <button className="btn ghost" onClick={() => setConfirmRemove(true)} disabled={busy}>
            Remover
          </button>
        )}
        <button className="btn" onClick={test} disabled={!usable || testing || busy}>
          {testing ? 'Testando…' : 'Testar'}
        </button>
        <button className="btn primary" onClick={save} disabled={busy || loading || (!dirty && config.saved)}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remover configuração de IA?"
          confirmLabel="Remover"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmRemove(false)}
        >
          <p>
            As chaves e as instruções saem do compartimento, em todos os aparelhos. A importação de
            fatura continua funcionando, com as sugestões vindo só do histórico.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
