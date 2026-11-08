import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import {
  AI_PROVIDER_LABEL,
  DEFAULT_AI_MODELS,
  DEFAULT_OLLAMA_URL,
  MAX_AI_MODEL_CHAIN,
  listModels,
} from '../services/aiProviders';
import type { AiEntryHealth, AiModelOption } from '../services/aiProviders';
import { AI_PROVIDERS } from '../types';
import type { AiModelEntry, AiProvider } from '../types';

const CUSTOM = '__custom__';

// Espera a digitação da chave parar antes de consultar a lista do provedor:
// sem isso cada tecla viraria uma chamada.
const LIST_DEBOUNCE_MS = 700;

/**
 * Seletor de modelo: "nome customizado", o padrão do provedor e a lista
 * consultada ao vivo no provedor com a chave em mãos (ou o catálogo embutido,
 * quando a consulta não responde).
 */
function AiModelSelect(props: {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  value: string;
  onChange: (model: string) => void;
}) {
  const { provider, apiKey, baseUrl, value } = props;
  const [list, setList] = useState<{ models: AiModelOption[]; live: boolean } | null>(null);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setList(null);
    const timer = setTimeout(() => {
      listModels(provider, apiKey, baseUrl).then((r) => {
        if (!cancelled) setList(r);
      });
    }, LIST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [provider, apiKey, baseUrl]);

  const models = list?.models ?? [];
  // Modelo gravado que não está na lista (nome customizado, ou modelo novo que
  // o catálogo embutido não conhece) abre direto no campo de texto.
  const inList = value === '' || models.some((m) => m.id === value);
  const showCustom = custom || (list !== null && !inList);
  const selectValue = showCustom ? CUSTOM : value;

  return (
    <>
      <span className="field">
        <select
          value={selectValue}
          aria-label="Modelo"
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true);
              return;
            }
            setCustom(false);
            props.onChange(e.target.value);
          }}
        >
          <option value={CUSTOM}>Nome customizado</option>
          <option value="">Padrão do provedor ({DEFAULT_AI_MODELS[provider]})</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name === m.id ? m.id : `${m.name} (${m.id})`}
            </option>
          ))}
          {list === null && value && !inList && <option value={value}>{value}</option>}
        </select>
      </span>
      {showCustom && (
        <span className="field">
          <input
            placeholder="Nome exato do modelo (ex.: gemini-3.5-flash)"
            value={value}
            autoCapitalize="none"
            onChange={(e) => props.onChange(e.target.value.trim())}
          />
        </span>
      )}
      <span className="muted small">
        {list === null
          ? 'Consultando a lista do provedor…'
          : list.live
            ? 'Lista consultada agora no provedor.'
            : 'Lista embutida: pode haver modelo fora dela (use o nome customizado).'}
      </span>
    </>
  );
}

/** Posição do item anterior do mesmo provedor que tem chave, ou -1. */
function inheritedFrom(chain: AiModelEntry[], index: number): number {
  const entry = chain[index];
  for (let i = index - 1; i >= 0; i--) {
    const prev = chain[i];
    if (prev.provider !== entry.provider) continue;
    const cred = entry.provider === 'ollama' ? prev.baseUrl : prev.apiKey;
    if (cred.trim()) return i;
  }
  return -1;
}

/**
 * Editor da fila de modelos: o principal e até cinco reservas. Reserva nova
 * nasce com o provedor do principal; trocar o provedor de um item zera modelo
 * e chave. Reserva do mesmo provedor de um item anterior mostra "Chave já
 * preenchida no modelo N" e herda a chave, até o usuário pedir outra.
 */
export function AiModelChain(props: {
  chain: AiModelEntry[];
  health: AiEntryHealth[];
  onChange: (chain: AiModelEntry[]) => void;
}) {
  const { chain, health } = props;
  // Itens em que o usuário pediu "Usar outra chave", mesmo herdando.
  const [ownKey, setOwnKey] = useState<Set<number>>(new Set());

  const update = (index: number, patch: Partial<AiModelEntry>) =>
    props.onChange(chain.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const remove = (index: number) => {
    props.onChange(chain.filter((_, i) => i !== index));
    setOwnKey(new Set());
  };

  const add = () =>
    props.onChange([...chain, { provider: chain[0]?.provider ?? 'gemini', model: '', apiKey: '', baseUrl: '' }]);

  return (
    <div className="ai-chain">
      {chain.map((entry, i) => {
        const from = inheritedFrom(chain, i);
        const inherits = i > 0 && from >= 0 && !entry.apiKey && !entry.baseUrl && !ownKey.has(i);
        const effectiveKey = entry.apiKey || (from >= 0 ? chain[from].apiKey : '');
        const effectiveUrl = entry.baseUrl || (from >= 0 ? chain[from].baseUrl : '');
        const problem = health.find((h) => h.position === i);
        return (
          <div key={i} className="ai-model">
            <div className="ai-model-head">
              <span className="ai-model-num">{i + 1}</span>
              <strong>{i === 0 ? 'Modelo principal' : `Modelo ${i + 1} (reserva)`}</strong>
              {i > 0 && (
                <button
                  type="button"
                  className="btn icon danger"
                  title="Remover este modelo da fila"
                  onClick={() => remove(i)}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </div>

            <div className="ai-model-grid">
              <label>
                Provedor
                <span className="field">
                  <select
                    value={entry.provider}
                    onChange={(e) => {
                      update(i, { provider: e.target.value as AiProvider, model: '', apiKey: '', baseUrl: '' });
                      setOwnKey((s) => {
                        const n = new Set(s);
                        n.delete(i);
                        return n;
                      });
                    }}
                  >
                    {AI_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {AI_PROVIDER_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              <div className="ai-model-field">
                <span className="plan-field-label">Modelo</span>
                <AiModelSelect
                  provider={entry.provider}
                  apiKey={effectiveKey}
                  baseUrl={effectiveUrl}
                  value={entry.model}
                  onChange={(model) => update(i, { model })}
                />
              </div>
            </div>

            {inherits ? (
              <div className="ai-inherit">
                <span className="muted small">
                  <KeyRound size={14} aria-hidden />{' '}
                  {entry.provider === 'ollama' ? 'Endereço' : 'Chave'} já preenchida no modelo {from + 1}
                </span>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setOwnKey((s) => new Set(s).add(i))}
                >
                  {entry.provider === 'ollama' ? 'Usar outro endereço' : 'Usar outra chave'}
                </button>
              </div>
            ) : entry.provider === 'ollama' ? (
              <label>
                Endereço do Ollama
                <span className="field">
                  <input
                    value={entry.baseUrl}
                    placeholder={DEFAULT_OLLAMA_URL}
                    inputMode="url"
                    autoCapitalize="none"
                    onChange={(e) => update(i, { baseUrl: e.target.value })}
                  />
                </span>
                <span className="muted small ai-key-hint">
                  O navegador chama o Ollama direto: ele precisa aceitar a origem deste app
                  (variável OLLAMA_ORIGINS no servidor do Ollama).
                </span>
              </label>
            ) : (
              <label>
                Chave de API
                <span className="field">
                  <input
                    type="password"
                    value={entry.apiKey}
                    placeholder="Cole a chave do provedor"
                    autoComplete="off"
                    autoCapitalize="none"
                    onChange={(e) => update(i, { apiKey: e.target.value.trim() })}
                  />
                </span>
                <span className="muted small ai-key-hint">
                  Guardada cifrada com a senha deste compartimento; usada apenas para chamar a IA
                  deste provedor, direto do seu navegador.
                </span>
              </label>
            )}

            {problem && (
              <p className="form-error small">
                Fora da frente da fila por alguns minutos:{' '}
                {problem.kind === 'model'
                  ? 'o provedor não encontrou o modelo'
                  : problem.kind === 'credential'
                    ? 'a chave foi recusada'
                    : 'limite de uso ou provedor ocupado'}{' '}
                ({problem.message})
              </p>
            )}
          </div>
        );
      })}

      {chain.length < MAX_AI_MODEL_CHAIN && (
        <button type="button" className="btn ghost" onClick={add}>
          <Plus size={16} aria-hidden /> Adicionar modelo reserva
        </button>
      )}
    </div>
  );
}
