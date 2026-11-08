import { useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { Check, FileUp } from 'lucide-react';
import { readStatementFile, StatementError } from '../utils/statement';
import { ZipError } from '../utils/zip';
import { writeErrorMessage } from '../utils/errors';
import { commitImport, prepareImport } from '../services/imports';
import type { DraftRow, ImportDraft } from '../services/imports';
import { categorizeWithAi } from '../services/ai';
import { aiChainUsable, providerMessage } from '../services/aiProviders';
import { monthWeek } from '../services/months';
import { useAiConfig } from '../hooks/useMonthData';
import type { MonthData } from '../hooks/useMonthData';
import { ImportReview } from './ImportReview';
import type { AiRunState } from './ImportReview';
import { OriginIcon } from './OriginIcon';
import type { Category, Origin } from '../types';

/** Arquivo lido, aguardando a senha do ZIP. */
interface PendingFile {
  name: string;
  bytes: Uint8Array;
  wrong: boolean;
}

// Arquivo de fatura passa longe disso; o teto evita travar a aba com um
// anexo errado (um PDF de 30 MB, por exemplo).
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Importação de fatura da aba Adicionar: escolhe a origem (a mesma para a
 * fatura inteira), recebe o CSV ou o ZIP com o CSV dentro, monta
 * a revisão sem o que já estava no app e grava o que o usuário confirmar.
 * Com a IA configurada e ligada, as categorias e descrições vêm sugeridas.
 */
export function StatementImport(props: {
  compartmentId: string;
  currentMonth: string;
  categories: Category[];
  origins: Origin[];
  data: MonthData;
  onOpenAiSettings: () => void;
}) {
  const { compartmentId, currentMonth, categories, origins, data } = props;
  const ai = useAiConfig(compartmentId);
  const aiReady = aiChainUsable(ai.config.chain);

  const defaultOrigin = origins.find((o) => o.isDefault) ?? origins[0];
  const [originId, setOriginId] = useState<string | null>(null);
  const origin = origins.find((o) => o.id === originId) ?? defaultOrigin ?? null;
  const [useAi, setUseAi] = useState(true);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [password, setPassword] = useState('');
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [aiState, setAiState] = useState<AiRunState>({ status: 'off' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Linhas que o usuário já mexeu: a sugestão da IA que chega depois não
  // passa por cima da escolha dele.
  const touched = useRef(new Set<number>());
  // Cada leitura ganha um número: a resposta da IA de uma fatura anterior,
  // que chegue depois de o usuário abrir outra, é descartada.
  const run = useRef(0);

  const reset = () => {
    run.current++;
    setDraft(null);
    setPending(null);
    setPassword('');
    setAiState({ status: 'off' });
    setReviewError(null);
    touched.current = new Set();
  };

  const runAi = async (current: ImportDraft, mine: number) => {
    setAiState({ status: 'running' });
    try {
      const { suggestions, model } = await categorizeWithAi(ai.config.chain, {
        categories: categories.map((c) => c.name),
        examples: current.examples,
        instructions: ai.config.instructions.categorize,
        items: current.rows.map((r) => ({
          title: r.item.title,
          amount: r.item.amount,
          date: r.item.date,
          installment: r.item.installment,
          bankCategory: r.item.bankCategory,
        })),
      });
      if (run.current !== mine) return;
      setDraft((d) => {
        if (!d) return d;
        const rows = d.rows.map((row, i): DraftRow => {
          const s = suggestions[i];
          if (!s || touched.current.has(row.id)) return row;
          const next: DraftRow = { ...row, description: s.description ?? row.description };
          // A escolha que veio do histórico é do próprio usuário: a IA só
          // completa o que o histórico não sabia.
          if (row.source === 'history') return next;
          if (s.categoryIndex !== null && categories[s.categoryIndex]) {
            return { ...next, categoryId: categories[s.categoryIndex].id, newCategory: null, source: 'ai' };
          }
          if (s.newCategory) return { ...next, categoryId: null, newCategory: s.newCategory, source: 'ai' };
          return next;
        });
        return { ...d, rows };
      });
      setAiState({ status: 'done', model });
    } catch (err) {
      if (run.current !== mine) return;
      setAiState({ status: 'failed', message: providerMessage(err) });
    }
  };

  /** Lê o arquivo (pedindo a senha se for ZIP protegido) e abre a revisão. */
  const openFile = async (name: string, bytes: Uint8Array, zipPassword?: string) => {
    reset();
    const mine = run.current;
    setError(null);
    setFlash(null);
    if (bytes.length > MAX_FILE_BYTES) {
      setError('O arquivo passa de 5 MB e não parece uma fatura em CSV.');
      return;
    }
    setBusy(true);
    try {
      const statement = await readStatementFile(name, bytes, zipPassword);
      if (statement.items.length === 0) {
        setError(
          statement.credits > 0
            ? 'A fatura só tem pagamentos e créditos: nenhuma compra para importar.'
            : 'Nenhuma compra encontrada no arquivo.',
        );
        return;
      }
      const prepared = await prepareImport(compartmentId, currentMonth, name, statement, {
        categories,
        monthExpenses: data.expenses,
      });
      if (run.current !== mine) return;
      setDraft(prepared);
      const hasWork = prepared.rows.length > 0;
      if (hasWork && useAi && aiReady) void runAi(prepared, mine);
    } catch (err) {
      if (err instanceof ZipError && err.kind === 'password') {
        setPending({ name, bytes, wrong: Boolean(zipPassword) });
        setPassword('');
      } else if (err instanceof ZipError || err instanceof StatementError) {
        setError(err.message);
      } else {
        setError(writeErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await openFile(file.name, bytes);
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!pending || !password) return;
    void openFile(pending.name, pending.bytes, password);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void pickFile(e.dataTransfer.files[0]);
  };

  const changeRow = (id: number, patch: Partial<DraftRow>) => {
    touched.current.add(id);
    setDraft((d) => (d ? { ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : d));
  };

  const toggleAll = (include: boolean) =>
    setDraft((d) => (d ? { ...d, rows: d.rows.map((r) => ({ ...r, include })) } : d));

  const confirm = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setReviewError(null);
    try {
      const result = await commitImport(compartmentId, currentMonth, {
        rows: draft.rows,
        origin: origin ? { id: origin.id, name: origin.name } : null,
        week: monthWeek(data.month),
        categories,
        format: draft.format,
      });
      reset();
      const parts = [
        result.expenses > 0 && `${result.expenses} ${result.expenses === 1 ? 'gasto variável' : 'gastos variáveis'}`,
        result.fixed > 0 && `${result.fixed} ${result.fixed === 1 ? 'fixo parcelado' : 'fixos parcelados'}`,
        result.skipped > 0 && `${result.skipped} ${result.skipped === 1 ? 'ignorada' : 'ignoradas'}`,
        result.newCategories > 0 &&
          `${result.newCategories} ${result.newCategories === 1 ? 'categoria nova' : 'categorias novas'}`,
      ].filter(Boolean);
      setFlash(`Fatura importada: ${parts.join(', ')}.`);
      setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      setReviewError(err instanceof Error && !('code' in err) ? err.message : writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card import-card">
        {origins.length > 0 && (
          <div className="origin-picker">
            <span className="origin-label">Origem da fatura</span>
            <div className="chip-row" role="radiogroup" aria-label="Origem da fatura">
              {origins.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`chip${origin?.id === o.id ? ' selected' : ''}`}
                  onClick={() => setOriginId(o.id)}
                  disabled={busy}
                >
                  <OriginIcon icon={o.icon} color={o.color} />
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <label
          className={`file-drop${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <FileUp size={26} aria-hidden />
          <span className="file-drop-title">{busy ? 'Lendo a fatura…' : 'Anexar fatura'}</span>
          <span className="muted small">CSV ou ZIP com CSV dentro (Nubank, C6 e outros)</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            disabled={busy}
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              // Permite anexar o mesmo arquivo de novo depois de cancelar.
              e.target.value = '';
            }}
          />
        </label>

        {pending && (
          <form className="zip-password" onSubmit={submitPassword}>
            <p className={pending.wrong ? 'neg small' : 'muted small'}>
              {pending.wrong
                ? 'A senha não confere. Tente de novo.'
                : `${pending.name} é um ZIP protegido por senha.`}
            </p>
            <span className="field">
              <input
                type="password"
                placeholder="Senha do ZIP"
                value={password}
                autoFocus
                autoComplete="off"
                onChange={(e) => setPassword(e.target.value)}
              />
            </span>
            <button className="btn small" type="submit" disabled={!password || busy}>
              Abrir
            </button>
          </form>
        )}

        <div className="import-options">
          <button
            type="button"
            className={`plan-check ai-toggle${aiReady ? '' : ' off'}`}
            role="switch"
            aria-checked={aiReady && useAi}
            disabled={!aiReady}
            onClick={() => setUseAi((v) => !v)}
          >
            <span className={`check-box${aiReady && useAi ? ' checked' : ''}`} aria-hidden>
              {aiReady && useAi && <Check size={12} aria-hidden />}
            </span>
            Organizar com IA
          </button>
          {!ai.loading && !aiReady && (
            <button type="button" className="mini-btn" onClick={props.onOpenAiSettings}>
              configurar IA
            </button>
          )}
        </div>
        <p className="muted small import-mode-hint">
          {aiReady && useAi
            ? 'A IA sugere categoria e descrição de cada compra a partir das suas categorias e do que você já importou.'
            : 'Importação direta: a categoria vem do que você já importou e da categoria do banco; o resto cai na categoria padrão.'}
        </p>

        {error && <p className="form-error">{error}</p>}
        {flash && <p className="flash">{flash}</p>}
      </section>

      {draft && (
        <ImportReview
          draft={draft}
          categories={categories}
          origin={origin}
          ai={aiState}
          busy={busy}
          error={reviewError}
          onRowChange={changeRow}
          onToggleAll={toggleAll}
          onConfirm={confirm}
          onCancel={reset}
        />
      )}
    </>
  );
}
