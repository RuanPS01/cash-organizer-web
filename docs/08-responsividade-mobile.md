# 8. Responsividade e mobile

O app é usado principalmente no celular, instalado como PWA. Mobile é requisito,
não polimento: se a tela não funciona em 360px de largura, a tarefa não está
pronta.

## 8.1 Breakpoints

| Faixa | O que muda |
|---|---|
| Até 560px | tabelas viram blocos, coluna "Ideal" some, lançamento vira grade de duas linhas, status e valores encolhem |
| Acima de 560px | tabelas normais com todas as colunas, os dois tipos de plano lado a lado |
| Até 719px | navbar embaixo, com as cinco abas em fonte menor e largura vinda do rótulo |
| De 720px a 959px | navbar no topo com recuo e espaçamento entre letras reduzidos, para as cinco abas caberem |
| A partir de 720px | navbar sai de baixo e vira barra no topo, totais em 4 colunas, formulário inline em grade |

A folha é escrita mobile-first: o padrão é o celular e as media queries adicionam
o comportamento de tela larga (`min-width: 720px`) ou o modo compacto de tabela
(`max-width: 560px`).

## 8.2 Estrutura da casca

- `.shell` ocupa `100dvh` em coluna.
- `.topbar` é `sticky` no topo, com `padding-top: calc(0.7rem +
  env(safe-area-inset-top))` para não ficar sob a barra de status do iPhone no
  PWA instalado.
- `.navbar` é fixa embaixo, apoiada em `bottom: var(--keyboard-inset)` e com
  `padding-bottom: var(--safe-bottom)`. A partir de 720px ela vira `sticky` logo
  abaixo da topbar, usando `order` para ficar acima do conteúdo; lá o
  `bottom: auto` da media query desliga o apoio no teclado.
- A navbar tem cinco abas e o separador `.nav-sep` antes de Planejamento. Abaixo
  de 720px os botões usam `flex: 1 1 auto` com `min-width: 0` e fonte de
  0.58rem: com largura igual para todos (`flex: 1`), "Planejamento" e
  "Estatísticas" não cabiam no quinto da tela e a barra passava da borda. Entre
  720px e 959px o recuo de cada aba cai para 0.7rem, porque com o recuo de tela
  larga a barra media 792px em uma janela de 720px. Conferido de 320px a 1280px.
- `.content` tem `max-width: 900px`, centralizado, com `padding-bottom:
  calc(5.5rem + var(--safe-bottom))` no celular para o conteúdo não terminar
  embaixo da navbar.

Os dois valores de baixo são tokens do `:root` no `styles.css`:

| Token | Valor | Para que serve |
|---|---|---|
| `--safe-bottom` | `min(env(safe-area-inset-bottom, 0px), 2.25rem)` | reserva a faixa do sistema (barra de gestos do Android, indicador do iPhone). O teto de 2.25rem cobre os dois casos reais (24px e 34px) e protege do inset preso em valor alto |
| `--keyboard-inset` | publicado pelo hook `useKeyboardInset` | altura da janela coberta pelo teclado virtual; fica em 0 com o teclado fechado |

### 8.2.1 Teclado virtual e a navegação fixa

Defeito já visto no PWA instalado no Android: depois de o teclado abrir uma vez,
a navegação de baixo passava a flutuar acima da borda da tela, com uma faixa
vazia embaixo, em qualquer aba e a cada rolagem. A causa é a diferença entre os
dois viewports. O teclado encolhe o viewport visual, mas o de layout, que é o que
posiciona `position: fixed`, continua do tamanho da tela inteira, e o descompasso
sobrevivia ao fechamento do teclado.

A correção tem duas frentes, e as duas precisam continuar existindo:

1. `interactive-widget=resizes-content` na meta viewport do
   [`index.html`](../index.html). Com ele o Chrome do Android encolhe o viewport
   de layout junto com o visual: `100dvh`, a navbar e o modal acompanham o
   teclado e voltam ao lugar quando ele fecha.
2. O hook [`useKeyboardInset`](../src/hooks/useKeyboardInset.ts), chamado uma vez
   no `App`, mede pelo `visualViewport` a faixa coberta pelo teclado e publica em
   `--keyboard-inset`. Isso cobre o Safari do iPhone, que continua encolhendo só
   o viewport visual: lá a navbar sobe e fica acima do teclado em vez de ficar
   embaixo dele.

O `env(safe-area-inset-bottom)` não entra direto em nenhuma regra: ele não é
recalculado quando o teclado abre e fecha e pode ficar preso em um valor alto,
que viraria justamente a faixa vazia. Todo uso passa pelo `--safe-bottom`.

## 8.3 Tabela em telas estreitas

Abaixo de 560px, `table`, `tbody` e `td` viram blocos e cada `tr` vira um flex
container:

- o nome ocupa a linha inteira (`td:first-child { flex: 1 1 100% }`);
- valor e status ficam na linha de baixo, com o status empurrado para a direita
  por `td:last-child { margin-left: auto }`;
- na tabela de origens, as colunas "Ideal", "Fixos" e "Variáveis" ganham
  `.hide-narrow` e somem, mas os três valores continuam na sublinha `.cell-sub`,
  que só aparece nesse breakpoint, com o ideal ainda editável. A tabela de
  gastos fixos não precisa disso: ela tem só nome, valor e status, porque o
  valor do fixo já é o previsto dele.

Cuidado que já causou defeito: **item flex precisa de `min-width: 0`** nas
células com texto. Sem isso a largura mínima automática (`min-content`) estoura a
linha e a página ganha rolagem horizontal.

## 8.4 Lista de lançamentos expandida

Abaixo de 560px, cada lançamento vira uma grade de três colunas e duas linhas:

```
'desc  value delete'
'when  value delete'
```

A descrição fica em `minmax(0, 1fr)` com `overflow-wrap: anywhere`, para quebrar
texto longo em vez de empurrar a tabela para fora da tela. O botão de excluir
nunca quebra de linha.

## 8.4.1 Lista do histórico do mês

O item do histórico usa a mesma ideia em qualquer largura: uma grade de três
colunas com duas linhas de texto à esquerda e, à direita, o valor e o botão de
excluir, que nunca quebram de linha.

```
'desc  value actions'
'meta  value actions'
```

A coluna de texto é `minmax(0, 1fr)`, e os selos de categoria e origem ficam em
um flex com `flex-wrap`, então nome longo de categoria desce de linha em vez de
esticar a lista. A coluna `actions` guarda os dois botões da linha (editar e
excluir) em um flex que ocupa as duas linhas. No modo de seleção em lote entra
uma quarta coluna à esquerda (`.history-list.selecting`), com a caixa de marcação
ocupando as duas linhas, e os botões saem da linha. Os filtros são uma coluna até
560px e duas acima disso.

Na tela Gerenciar, a lista de origens tem quatro botões de ação por linha. Abaixo
de 560px, `.manage-list li` ganha `flex-wrap` e `.row-main` uma largura mínima de
11rem: quando o nome não cabe ao lado dos botões, eles descem para a linha
seguinte, alinhados à direita, em vez de espremer o nome em três linhas.

O modal tem `max-height: calc(100dvh - 2rem)` e quem rola é o `.modal-body`, para
que o título e os botões de ação continuem visíveis: o modal da origem, com a
grade de ícones, é mais alto que a tela de um celular.

## 8.4.2 Planejamento

- **Formulário.** Uma coluna; prazo e unidade, e as duas taxas do CDI, ficam em
  `.plan-form-row`, duas colunas `minmax(0, 1fr)` alinhadas pela base
  (`align-items: end`), porque em 360px o rótulo "Percentual do CDI" quebra em
  duas linhas e, alinhado pelo topo, o campo dele descia sozinho. Os três chips
  de tipo de rendimento quebram de linha dentro da seção recolhível, como dentro
  do modal, em vez de rolar.
- **Lista de planos.** Grade `auto minmax(0, 1fr) auto auto` (ícone, texto,
  valor, chevron): o nome longo quebra em várias linhas e o valor nunca sai da
  tela.
- **Gráfico.** O SVG é esticado para a caixa e os rótulos dos eixos são HTML,
  então o texto tem o mesmo tamanho em 360px e no desktop. A leitura dos valores
  fica acima do gráfico, e não em uma caixa flutuante: em 360px a caixa
  ocuparia dois terços da largura e seria cortada pela moldura do card. O
  gráfico usa `touch-action: pan-y`: arrastar na horizontal percorre os meses, e
  na vertical a página continua rolando.
- **Mês a mês.** Cada mês é uma grade de duas linhas de texto e o valor à
  direita, que nunca quebra, como no histórico do mês.
- **Selo do gasto fixo de planejamento.** `white-space: nowrap`: dentro da
  linha de selos do histórico ele quebrava no meio ("faltam 23 / meses").

## 8.5 Rolagem horizontal permitida

Só dois contêineres rolam na horizontal, e de propósito:

- `.chip-row`, a fileira de categorias e a de origens na tela de novo gasto;
- `.table-scroll`, o embrulho das tabelas do mês.

Dentro de modal a fileira de chips quebra em vez de rolar
(`.modal-form .chip-row`): a largura do modal é decidida pelo conteúdo (ele é
item de grade do `.modal-backdrop`), e uma fileira que rola na horizontal
empurraria essa medida para além da tela em 360px, cortando o modal inteiro pela
direita.

Ambos usam barra fina no tema do site (`scrollbar-width: thin` mais o bloco
`-webkit-scrollbar` para o Safari). **A página em si nunca pode rolar na
horizontal.**

## 8.6 Alvos de toque e controles nativos

- Botões de ícone usam `padding: 0.3rem 0.6rem` com ícone de 15 a 20px, e ficam
  em linhas com espaçamento suficiente para o toque.
- O botão de calendário do novo gasto tem o `input[type=date]` invisível por cima
  justamente para que o toque no celular abra o seletor nativo do sistema.
- `color-scheme` no `:root` faz o calendário nativo e a lista do `select`
  seguirem o tema escuro em vez de virem sempre claros.
- `inputMode="numeric"` nos campos de valor e de parcela abre o teclado numérico.

## 8.7 Checklist visual antes de entregar

- [ ] Testei em 360px de largura, sem rolagem horizontal da página.
- [ ] Texto longo (nome de categoria, descrição de lançamento) quebra em vez de
      esticar a linha.
- [ ] Conteúdo não fica escondido atrás da navbar fixa.
- [ ] Abri um campo de texto, fechei o teclado e a navegação voltou colada na
      borda de baixo, sem faixa vazia, inclusive depois de rolar em outra aba.
- [ ] Molduras chanfradas inteiras, sem canto sem ouro nem miolo vazando.
- [ ] Conferi a partir de 720px, com a navbar no topo, e em 720px exatos, onde
      as cinco abas ficam mais apertadas.
- [ ] Se mexi em tabela, conferi os dois lados do breakpoint de 560px.
