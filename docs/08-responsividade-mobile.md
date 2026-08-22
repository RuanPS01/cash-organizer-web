# 8. Responsividade e mobile

O app é usado principalmente no celular, instalado como PWA. Mobile é requisito,
não polimento: se a tela não funciona em 360px de largura, a tarefa não está
pronta.

## 8.1 Breakpoints

| Faixa | O que muda |
|---|---|
| Até 560px | tabelas viram blocos, coluna "Ideal" some, lançamento vira grade de duas linhas, status e valores encolhem |
| Acima de 560px | tabelas normais com todas as colunas |
| A partir de 720px | navbar sai de baixo e vira barra no topo, totais em 4 colunas, formulário inline em grade |

A folha é escrita mobile-first: o padrão é o celular e as media queries adicionam
o comportamento de tela larga (`min-width: 720px`) ou o modo compacto de tabela
(`max-width: 560px`).

## 8.2 Estrutura da casca

- `.shell` ocupa `100dvh` em coluna.
- `.topbar` é `sticky` no topo, com `padding-top: calc(0.7rem +
  env(safe-area-inset-top))` para não ficar sob a barra de status do iPhone no
  PWA instalado.
- `.navbar` é fixa embaixo com `padding-bottom: env(safe-area-inset-bottom)`. A
  partir de 720px ela vira `sticky` logo abaixo da topbar, usando `order` para
  ficar acima do conteúdo.
- `.content` tem `max-width: 860px`, centralizado, com `padding-bottom: 5.5rem`
  no celular para o conteúdo não terminar embaixo da navbar.

## 8.3 Tabela em telas estreitas

Abaixo de 560px, `table`, `tbody` e `td` viram blocos e cada `tr` vira um flex
container:

- o nome ocupa a linha inteira (`td:first-child { flex: 1 1 100% }`);
- valor e status ficam na linha de baixo, com o status empurrado para a direita
  por `td:last-child { margin-left: auto }`;
- a coluna "Ideal" ganha `.hide-narrow` e some, mas o valor ideal continua
  editável na sublinha `.cell-sub`, que só aparece nesse breakpoint.

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

## 8.5 Rolagem horizontal permitida

Só dois contêineres rolam na horizontal, e de propósito:

- `.chip-row`, a fileira de categorias na tela de novo gasto;
- `.table-scroll`, o embrulho das tabelas do mês.

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
- [ ] Molduras chanfradas inteiras, sem canto sem ouro nem miolo vazando.
- [ ] Conferi a partir de 720px, com a navbar no topo.
- [ ] Se mexi em tabela, conferi os dois lados do breakpoint de 560px.
