import { useEffect } from 'react';

/** Sobra menor que isso é arredondamento do navegador durante a rolagem, não teclado. */
const RUIDO_PX = 8;

/**
 * Mantém em `--keyboard-inset` (no `:root`) a altura da faixa de baixo da janela
 * que está coberta pelo teclado virtual. A `.navbar` usa esse valor como
 * `bottom`, então ela se apoia sempre na borda que está de fato visível.
 *
 * Por que isso existe: quando o teclado abre, alguns navegadores encolhem só o
 * viewport visual e mantêm o de layout (o que posiciona `position: fixed`) do
 * tamanho da tela inteira. A barra fixa em `bottom: 0` fica embaixo do teclado, e
 * o descompasso entre os dois viewports sobrevive ao fechamento do teclado: a
 * partir daí a barra flutua acima da borda de baixo em qualquer aba, deixando uma
 * faixa vazia. No Chrome do Android o `interactive-widget=resizes-content` do
 * `index.html` já resolve isso no próprio navegador (lá o viewport de layout
 * encolhe junto e a conta abaixo dá zero); este hook cobre o Safari do iPhone e
 * qualquer navegador que ainda encolha apenas o viewport visual.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      frame = 0;
      // Com zoom por pinça as medidas do viewport visual estão em outra escala e
      // a conta daria uma sobra que não existe: a barra só pularia de lugar.
      const zoom = Math.abs(viewport.scale - 1) > 0.01;
      const sobra = root.clientHeight - (viewport.offsetTop + viewport.height);
      const inset = !zoom && sobra > RUIDO_PX ? Math.round(sobra) : 0;
      root.style.setProperty('--keyboard-inset', `${inset}px`);
    };

    // O navegador dispara resize e scroll do viewport visual a cada quadro
    // enquanto o teclado sobe; agrupar em um requestAnimationFrame evita recalcular
    // o estilo várias vezes no mesmo quadro.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);
}
