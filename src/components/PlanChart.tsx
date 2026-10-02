import { useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { formatBRL, formatBRLCompact } from '../utils/money';
import { monthLabel, monthShortLabel } from '../utils/dates';
import type { ProjectionMonth } from '../utils/projection';

// Sistema de coordenadas do SVG. Ele é esticado para a largura e a altura do
// gráfico (preserveAspectRatio="none") e as linhas usam vector-effect para não
// engrossar junto; o texto fica em HTML por cima, porque texto dentro de um SVG
// esticado sairia deformado, e em um SVG proporcional sairia minúsculo em 360px.
const W = 1000;
const H = 100;

/** Passo "redondo" do eixo (1, 2, 2,5 ou 5 vezes uma potência de 10). */
function niceStep(raw: number): number {
  const potencia = 10 ** Math.floor(Math.log10(raw));
  const f = raw / potencia;
  const redondo = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return redondo * potencia;
}

/** Arredonda a coordenada em duas casas, só para o atributo do SVG ficar curto. */
function coord(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Gráfico da projeção mês a mês: o saldo com rendimento em ouro e, quando há
 * rendimento, o total depositado em grafite como referência, para que a
 * distância entre as duas linhas seja o rendimento. Sem rendimento as duas
 * seriam a mesma linha, e só o saldo aparece.
 *
 * Tocar, passar o mouse ou usar as setas do teclado marca o mês na mira e
 * troca a leitura de cima para ele. A leitura só complementa: todos os valores
 * estão também na listagem mês a mês.
 */
export function PlanChart(props: { months: ProjectionMonth[]; showDeposited: boolean }) {
  const { months, showDeposited } = props;
  const n = months.length;
  const [active, setActive] = useState<number | null>(null);

  if (n === 0) return null;

  const maior = Math.max(...months.map((m) => m.balance), 1);
  const passo = niceStep(maior / 4);
  const topo = Math.ceil(maior / passo) * passo;
  const ticks: number[] = [];
  for (let v = 0; v <= topo; v += passo) ticks.push(v);

  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / topo) * H;
  const linha = (valor: (m: ProjectionMonth) => number) =>
    months.map((m, i) => `${i === 0 ? 'M' : 'L'}${coord(x(i))},${coord(y(valor(m)))}`).join(' ');
  const saldo = linha((m) => m.balance);
  const area = `${saldo} L${coord(x(n - 1))},${H} L${coord(x(0))},${H} Z`;

  // Quatro rótulos de mês no máximo: mais que isso se atropela em 360px.
  const quantos = Math.min(n, 4);
  const xTicks =
    quantos === 1
      ? [0]
      : [...new Set(Array.from({ length: quantos }, (_, k) => Math.round((k * (n - 1)) / (quantos - 1))))];

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fracao = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    setActive(Math.min(n - 1, Math.max(0, Math.round(fracao * (n - 1)))));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const atual = active ?? n - 1;
    const proximo =
      e.key === 'ArrowLeft'
        ? atual - 1
        : e.key === 'ArrowRight'
          ? atual + 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (proximo === null) return;
    e.preventDefault();
    setActive(Math.min(n - 1, Math.max(0, proximo)));
  };

  const ponto = active ?? n - 1;
  const mes = months[ponto];
  const left = (x(ponto) / W) * 100;
  const ultimo = months[n - 1];

  return (
    <div className="plan-chart">
      {/* A leitura fica acima do gráfico, e não em uma caixa flutuante: em
          360px a caixa ocuparia dois terços da largura e seria cortada pela
          moldura do card. Ela é também a legenda (cada valor leva o traço da
          cor da linha) e, sem toque nenhum, mostra o fim do prazo. */}
      <div className="plan-chart-readout" aria-live="polite">
        <span className="plan-chart-month">
          {monthLabel(mes.ym)}
          {active === null ? ' (fim do prazo)' : ` (mês ${mes.index})`}
        </span>
        <span className="plan-chart-values">
          <span className="legend-item">
            <span className="legend-line balance" aria-hidden />
            <strong>{formatBRL(mes.balance)}</strong>{' '}
            {showDeposited ? 'saldo com rendimento' : 'total guardado'}
          </span>
          {showDeposited && (
            <>
              <span className="legend-item">
                <span className="legend-line deposit" aria-hidden />
                <strong>{formatBRL(mes.deposited)}</strong> depositado
              </span>
              <span className="legend-item">
                <span className="legend-line none" aria-hidden />
                <strong>{formatBRL(mes.balance - mes.deposited)}</strong> de rendimento
              </span>
            </>
          )}
        </span>
      </div>

      <div className="plan-chart-body">
        <div className="plan-chart-y" aria-hidden>
          {ticks.map((v) => (
            <span key={v} style={{ top: `${(y(v) / H) * 100}%` }}>
              {formatBRLCompact(v)}
            </span>
          ))}
        </div>

        <div
          className="plan-chart-plot"
          role="img"
          tabIndex={0}
          aria-label={`Projeção de ${monthLabel(months[0].ym)} a ${monthLabel(ultimo.ym)}: saldo final de ${formatBRL(ultimo.balance)}. Use as setas para percorrer os meses.`}
          onPointerDown={pick}
          onPointerMove={pick}
          // No toque o navegador dispara pointerleave assim que o dedo sai da
          // tela: limpar ali desfaria o toque na hora. Só o mouse limpa ao sair;
          // no celular a leitura fica no mês tocado até o próximo toque.
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setActive(null);
          }}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {ticks.map((v) => (
              <line key={v} className="plan-chart-grid" x1={0} x2={W} y1={y(v)} y2={y(v)} />
            ))}
            <path className="plan-chart-area" d={area} />
            {showDeposited && (
              <path className="plan-chart-line deposit" d={linha((m) => m.deposited)} />
            )}
            <path className="plan-chart-line balance" d={saldo} />
            {active !== null && (
              <line className="plan-chart-cross" x1={x(ponto)} x2={x(ponto)} y1={0} y2={H} />
            )}
          </svg>

          {showDeposited && (
            <span
              className="plan-chart-dot deposit"
              style={{ left: `${left}%`, top: `${(y(mes.deposited) / H) * 100}%` }}
              aria-hidden
            />
          )}
          <span
            className="plan-chart-dot balance"
            style={{ left: `${left}%`, top: `${(y(mes.balance) / H) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

      <div className="plan-chart-x" aria-hidden>
        {xTicks.map((i, k) => (
          <span
            key={i}
            className={k === 0 ? 'first' : k === xTicks.length - 1 ? 'last' : ''}
            style={{ left: `${(x(i) / W) * 100}%` }}
          >
            {monthShortLabel(months[i].ym)}
          </span>
        ))}
      </div>
    </div>
  );
}
