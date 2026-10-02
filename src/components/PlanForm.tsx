import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { addPlan, savePlan } from '../services/plans';
import type { PlanFixedSync, PlanInput } from '../services/plans';
import {
  MAX_PLAN_MONTHS,
  annualRateOf,
  digitsToRate,
  formatPlanRate,
  formatRate,
  projectPlan,
} from '../utils/projection';
import { addMonthsKey, monthLabel } from '../utils/dates';
import { writeErrorMessage } from '../utils/errors';
import { MoneyInput } from './shared';
import { PLAN_KIND_TEXT, PlanSummary } from './PlanSummary';
import type { FixedExpense, Plan, PlanDurationUnit, PlanKind, PlanRateMode } from '../types';

const RATE_MODE_LABELS: Record<PlanRateMode, string> = {
  none: 'Sem rendimento',
  annual: 'Taxa ao ano',
  cdi: '% do CDI',
};

/**
 * Campo de taxa, digitado pelos dígitos como os de valor ("1065" vira 10,65).
 * O símbolo fica fora do valor do input, ao lado dele: com "%" no fim do texto,
 * o apagar do teclado tiraria só o símbolo e o número nunca diminuiria.
 */
function RateField(props: {
  label: string;
  suffix: string;
  value: number;
  onChange: (hundredths: number) => void;
}) {
  return (
    <label>
      {props.label}
      <span className="field rate">
        <input
          inputMode="numeric"
          placeholder="0,00"
          value={props.value > 0 ? formatRate(props.value).replace('%', '') : ''}
          onChange={(e) => props.onChange(digitsToRate(e.target.value))}
        />
        <span className="rate-suffix">{props.suffix}</span>
      </span>
    </label>
  );
}

/**
 * Subpágina de criação e edição de um planejamento. O resultado aparece ao
 * vivo abaixo do formulário, com o mesmo resumo da visualização do plano:
 * quem está decidindo o prazo ou a taxa vê o efeito antes de salvar.
 *
 * O rendimento fica em uma seção recolhível porque é opcional: o plano mais
 * simples (guardar um valor por um tempo) não precisa dele, e a seção aberta
 * dobraria a altura do formulário no celular.
 */
export function PlanForm(props: {
  compartmentId: string;
  currentMonth: string;
  kind: PlanKind;
  initial: Plan | null;
  /** Gasto fixo de planejamento do plano em edição, quando ele está no mês. */
  linked: FixedExpense | null;
  onSaved: (id: string, sync: PlanFixedSync) => void;
  onCancel: () => void;
}) {
  const { compartmentId, currentMonth, kind, initial, linked } = props;
  const text = PLAN_KIND_TEXT[kind];

  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(
    (kind === 'accumulate' ? initial?.monthlyAmount : initial?.targetAmount) ?? 0,
  );
  const [initialAmount, setInitialAmount] = useState(initial?.initialAmount ?? 0);
  const [unit, setUnit] = useState<PlanDurationUnit>(initial?.durationUnit ?? 'months');
  const [durationText, setDurationText] = useState(() => {
    if (!initial) return '12';
    const valor =
      initial.durationUnit === 'years' ? initial.durationMonths / 12 : initial.durationMonths;
    return String(valor);
  });
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? currentMonth);
  const [rateMode, setRateMode] = useState<PlanRateMode>(initial?.rateMode ?? 'none');
  const [annualRate, setAnnualRate] = useState(initial?.annualRate ?? 0);
  const [cdiRate, setCdiRate] = useState(initial?.cdiRate ?? 0);
  // 100% do CDI é o ponto de partida mais comum (Tesouro Selic, CDB de
  // liquidez diária); o usuário só mexe se o produto dele pagar diferente.
  const [cdiPercent, setCdiPercent] = useState(initial?.cdiPercent ?? 10_000);
  const [incomeTax, setIncomeTax] = useState(initial?.incomeTax ?? false);
  // Plano que já tem rendimento abre com a seção aberta, para a taxa não ficar
  // escondida justamente de quem a configurou.
  const [yieldOpen, setYieldOpen] = useState(initial ? initial.rateMode !== 'none' : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationValue = Number.parseInt(durationText, 10) || 0;
  const durationMonths = unit === 'years' ? durationValue * 12 : durationValue;
  const durationValid = durationMonths >= 1 && durationMonths <= MAX_PLAN_MONTHS;

  const input: PlanInput = {
    name,
    kind,
    monthlyAmount: kind === 'accumulate' ? amount : 0,
    targetAmount: kind === 'goal' ? amount : 0,
    initialAmount,
    durationMonths,
    durationUnit: unit,
    startMonth,
    rateMode,
    annualRate,
    cdiRate,
    cdiPercent,
    incomeTax,
  };

  // A prévia aparece assim que há valor e prazo: o nome é só para a lista. A
  // conta é recalculada a cada tecla, o que é barato (no máximo 600 meses).
  const projection = amount > 0 && durationValid ? projectPlan(input) : null;

  const validate = (): string | null => {
    if (!name.trim()) return 'Dê um nome ao planejamento.';
    if (amount <= 0) {
      return kind === 'accumulate'
        ? 'Informe quanto vai guardar por mês.'
        : 'Informe o valor que quer alcançar.';
    }
    if (!durationValid) return `Informe o prazo, de 1 mês até ${MAX_PLAN_MONTHS / 12} anos.`;
    if (rateMode === 'annual' && annualRate <= 0) {
      return 'Informe a taxa ao ano, ou escolha "Sem rendimento".';
    }
    if (rateMode === 'cdi' && (cdiRate <= 0 || cdiPercent <= 0)) {
      return 'Informe o CDI ao ano e o percentual do CDI, ou escolha "Sem rendimento".';
    }
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problema = validate();
    if (problema) {
      setError(problema);
      // O rendimento pode estar recolhido justamente com o campo que falta.
      if (rateMode !== 'none') setYieldOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        const sync = await savePlan(compartmentId, currentMonth, initial.id, input, linked);
        props.onSaved(initial.id, sync);
      } else {
        const id = await addPlan(compartmentId, input);
        props.onSaved(id, 'none');
      }
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const efetiva = annualRateOf(input);

  return (
    <div className="screen">
      <header className="subpage-header">
        <button type="button" className="btn icon" aria-label="Voltar" onClick={props.onCancel}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="subpage-title">
          <h2 className="h2-gold">{initial ? 'Editar planejamento' : text.title}</h2>
          <span className="muted small">{text.hint}</span>
        </div>
      </header>

      <form id="plan-form" className="card plan-form" onSubmit={submit} noValidate>
        <label>
          Nome do planejamento
          <span className="field">
            <input
              placeholder={kind === 'accumulate' ? 'Ex.: Reserva de emergência' : 'Ex.: Viagem de férias'}
              value={name}
              autoFocus={!initial}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </span>
        </label>

        <label>
          {kind === 'accumulate' ? 'Quanto vou guardar por mês' : 'Quanto quero juntar'}
          <MoneyInput valueCents={amount} onChange={setAmount} />
        </label>

        <div className="plan-form-row">
          <label>
            Prazo
            <span className="field">
              <input
                inputMode="numeric"
                placeholder="12"
                value={durationText}
                onChange={(e) => setDurationText(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </span>
          </label>
          <label>
            Em
            <span className="field">
              <select value={unit} onChange={(e) => setUnit(e.target.value as PlanDurationUnit)}>
                <option value="months">Meses</option>
                <option value="years">Anos</option>
              </select>
            </span>
          </label>
        </div>

        <div className="plan-field" role="group" aria-labelledby="plan-start-label">
          <span id="plan-start-label" className="plan-field-label">
            Primeiro mês
          </span>
          <div className="month-stepper">
            <button
              type="button"
              className="btn icon"
              aria-label="Mês anterior"
              onClick={() => setStartMonth(addMonthsKey(startMonth, -1))}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <strong>{monthLabel(startMonth)}</strong>
            <button
              type="button"
              className="btn icon"
              aria-label="Próximo mês"
              onClick={() => setStartMonth(addMonthsKey(startMonth, 1))}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          {durationValid && (
            <span className="muted small">
              Último mês: {monthLabel(addMonthsKey(startMonth, durationMonths - 1))}
            </span>
          )}
        </div>

        <label>
          Valor que já tenho guardado (opcional)
          <MoneyInput valueCents={initialAmount} onChange={setInitialAmount} />
        </label>

        <section className={`plan-collapse${yieldOpen ? ' open' : ''}`}>
          <button
            type="button"
            className="plan-collapse-head"
            aria-expanded={yieldOpen}
            aria-controls="plan-yield"
            onClick={() => setYieldOpen((v) => !v)}
          >
            <span className="plan-collapse-title">
              Rendimento <span className="muted">(opcional)</span>
            </span>
            <span className="plan-collapse-summary">
              {formatPlanRate(input)}
              {rateMode !== 'none' && incomeTax ? ', com IR' : ''}
            </span>
            <ChevronDown size={16} className="plan-collapse-chevron" aria-hidden />
          </button>

          {yieldOpen && (
            <div id="plan-yield" className="plan-collapse-body">
              <p className="card-hint">
                Simula um investimento de renda fixa. Para <strong>Tesouro Prefixado</strong> ou{' '}
                <strong>CDB prefixado</strong>, use a taxa ao ano. Para <strong>CDB pós-fixado</strong>{' '}
                ou <strong>Tesouro Selic</strong>, use o percentual do CDI (o Tesouro Selic rende
                perto de 100% do CDI).
              </p>
              <div className="chip-row" role="radiogroup" aria-label="Tipo de rendimento">
                {(Object.keys(RATE_MODE_LABELS) as PlanRateMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={rateMode === mode}
                    className={`chip${rateMode === mode ? ' selected' : ''}`}
                    onClick={() => setRateMode(mode)}
                  >
                    {RATE_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>

              {rateMode === 'annual' && (
                <RateField
                  label="Taxa ao ano"
                  suffix="% ao ano"
                  value={annualRate}
                  onChange={setAnnualRate}
                />
              )}
              {rateMode === 'cdi' && (
                <div className="plan-form-row">
                  <RateField label="CDI ao ano" suffix="%" value={cdiRate} onChange={setCdiRate} />
                  <RateField
                    label="Percentual do CDI"
                    suffix="%"
                    value={cdiPercent}
                    onChange={setCdiPercent}
                  />
                </div>
              )}

              {rateMode !== 'none' && (
                <>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={incomeTax}
                    className="plan-check"
                    onClick={() => setIncomeTax((v) => !v)}
                  >
                    <span className={`check-box${incomeTax ? ' checked' : ''}`} aria-hidden>
                      {incomeTax && <Check size={12} aria-hidden />}
                    </span>
                    Descontar o imposto de renda no resgate (tabela regressiva)
                  </button>
                  <p className="card-hint">
                    {efetiva > 0 &&
                      `Rendimento efetivo de ${formatRate(Math.round(efetiva * 10_000))} ao ano. `}
                    O imposto vai de 22,5% a 15% conforme o tempo de cada depósito aplicado. LCI e
                    LCA são isentas: deixe desligado. A simulação usa a taxa constante no prazo
                    inteiro e não considera taxa de custódia.
                  </p>
                </>
              )}
              {rateMode === 'cdi' && (
                <p className="card-hint">
                  O CDI muda com a taxa Selic: use o valor atual, que o seu banco ou o site do
                  Banco Central informam.
                </p>
              )}
            </div>
          )}
        </section>

        {linked && (
          <p className="card-hint">
            Este planejamento está no mês como <strong>gasto fixo de planejamento</strong>: salvar
            atualiza o nome, o valor e as parcelas dele. Se o mês em aberto ficar fora do prazo, ele
            sai do mês.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
      </form>

      {projection && (
        <section className="card">
          <h3>Resultado</h3>
          <PlanSummary
            kind={kind}
            projection={projection}
            targetAmount={input.targetAmount}
            durationMonths={durationMonths}
            durationUnit={unit}
            incomeTax={incomeTax && rateMode !== 'none'}
          />
        </section>
      )}

      <div className="plan-actions">
        <button type="button" className="btn ghost" onClick={props.onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" form="plan-form" className="btn primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
