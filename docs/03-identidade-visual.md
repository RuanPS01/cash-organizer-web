# 3. Identidade visual (UI/UX)

A identidade é **Ouro sobre preto puro**, vinda do protótipo "Cash Organizer
Gold" feito no Claude Design. Todo o CSS está em
[`src/styles.css`](../src/styles.css), em arquivo único, organizado por seções
com comentário de cabeçalho. Não há CSS Modules, CSS-in-JS nem framework de
utilitários.

Três marcas registradas definem a linguagem: **preto puro** como fundo, **ouro
em gradiente** como única cor de destaque e **cantos chanfrados** em toda peça
de interface.

## 3.1 Tema único

O app tem **um só tema, escuro**. Não existe versão clara e não se deve criar
uma: a identidade é construída sobre o preto puro, e o ouro em gradiente perde
o sentido sobre fundo claro. O `:root` declara `color-scheme: dark`, o que faz
os controles nativos (calendário do `input[type=date]`, lista do `select`)
virem escuros.

## 3.2 Tokens de cor

Todos declarados em `:root`.

### Fundos

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#000` | fundo da página |
| `--surface` | `#060606` | miolo padrão das molduras |
| `--surface-2` | `#080808` | miolo de campos e chips |
| `--surface-3` | `#0d0d0d` | trilho da barra de progresso |
| `--surface-card` | radial de `#0c0c0c` para `#000` | miolo dos cards e do modal |
| `--surface-plate` | radial de `#151515` para `#000` | miolo da placa de valor |

### Ouro

| Token | Valor | Uso |
|---|---|---|
| `--gold` | `#d4af37` | ouro base, foco de campo |
| `--gold-bright` | `#e7c95f` | realce |
| `--gold-soft` | `#e2c86a` | texto em ouro (valores, rótulos ativos) |
| `--gold-pale` | `#fff4c6` | brilho do gradiente |
| `--gold-cream` | `#fff8dc` | brilho máximo |
| `--gold-deep` | `#8a6a1f` | sombra do gradiente |
| `--gold-shadow` | `#6d5316` | sombra profunda |
| `--gold-ink` | `#191204` | texto sobre ouro preenchido |
| `--gold-tint` | `#1e1908` | ouro a 14% já composto sobre o preto |
| `--gold-tint-strong` | `#231d0b` | ouro a 16% já composto sobre o preto |

Os dois últimos existem porque dentro do sistema de moldura (3.5) o fundo do
próprio elemento é ouro: preenchimento translúcido vazaria e a peça viraria um
bloco dourado. **Preenchimento de moldura tem que ser opaco.**

### Gradientes

| Token | Uso |
|---|---|
| `--gold-edge` | moldura padrão (botões, campos, cards) |
| `--gold-edge-bright` | moldura de destaque (botão primário, chip selecionado, aba ativa) |
| `--gold-fill` | preenchimento do botão primário |
| `--gold-fill-soft` | preenchimento do chip selecionado e do selo padrão |
| `--gold-lettering` | texto vazado em ouro (marca, títulos de tela, valor grande) |
| `--gold-bar` | barra de progresso dentro do ideal |

### Texto

| Token | Valor | Uso |
|---|---|---|
| `--text` | `#f0ead8` | texto principal |
| `--text-strong` | `#e8e2d0` | títulos de card |
| `--text-soft` | `#cfc7ad` | texto de apoio em linhas e tabelas |
| `--muted` | `rgba(232,226,208,.5)` | rótulos e legendas |
| `--muted-dim` | `rgba(232,226,208,.35)` | placeholder e estado ignorado |

### Atenção e excesso

| Token | Valor | Uso |
|---|---|---|
| `--danger` | `#e2603f` | erro, pendência, excesso, excluir |
| `--danger-deep` | `#c74a2a` | sombra da barra estourada |
| `--danger-bar` | gradiente terracota | barra acima do ideal |
| `--danger-line` | `rgba(226,96,63,.5)` | moldura de pendência e de erro |
| `--danger-tint` | `#150a07` | miolo da caixa de erro |

**Não existe verde nesta identidade.** O positivo é o próprio ouro: "Pago" é
ouro, o valor dentro do ideal é ouro, a barra saudável é ouro.

### Linhas e brilhos

| Token | Valor | Uso |
|---|---|---|
| `--line` | `rgba(212,175,55,.14)` | divisórias de tabela e lista |
| `--line-soft` | `rgba(212,175,55,.26)` | moldura discreta (chip, campo, selo) |
| `--line-strong` | `rgba(212,175,55,.4)` | moldura de selo e status neutro |
| `--glow` | `0 0 22px rgba(212,175,55,.3)` | brilho de hover e foco |
| `--glow-strong` | `0 0 26px rgba(212,175,55,.38)` | brilho do botão primário |

## 3.3 Tipografia

Duas famílias, carregadas do Google Fonts em [`index.html`](../index.html):

| Token | Família | Uso |
|---|---|---|
| `--font-ui` | **Chakra Petch** | toda a interface |
| `--font-num` | **Oxanium** | números: valores, totais, datas, percentuais, parcelas |

Números sempre em `--font-num` com `font-variant-numeric: tabular-nums`, para
que as colunas de valor fiquem alinhadas. A lista de seletores que recebe a
fonte numérica está logo abaixo dos utilitários no `styles.css`.

Escala e tratamento:

- `h1` 1.35rem (login), `h2` 1.25rem (título de tela), `h3` 0.95rem (card).
  Todos em **caixa alta**, peso 700 e `letter-spacing` de 0.05em.
- Títulos de tela e a marca usam a classe `.h2-gold` / `.brand-name`, que vaza
  o texto no gradiente `--gold-lettering`.
- Rótulos pequenos (cabeçalho de tabela, legendas de totais, `.cell-sub`) vão
  em caixa alta, 0.62rem a 0.75rem, com `letter-spacing` de 0.12em a 0.16em.
- Botões em caixa alta, `letter-spacing` de 0.12em a 0.14em.
- O valor grande (`.money-input.big`) é 2.1rem, peso 800, vazado em ouro, com
  `caret-color` sólido para o cursor não sumir.

## 3.4 Chanfro

Nenhum canto é arredondado: todos são cortados em 45 graus com `clip-path`.
O tamanho do corte vem da variável `--c`, definida por componente:

| `--c` | Onde |
|---|---|
| 5px | selos, `.mini-btn`, campo inline |
| 6px a 7px | status, botão de ícone, chip |
| 8px a 9px | campos, botões, totais de seção, aba ativa |
| 12px a 14px | placa de valor, cards, modal, login |

## 3.5 Sistema de moldura (.frame)

`clip-path` corta a borda junto com o elemento, então uma `border` comum some
nas diagonais do chanfro. A moldura é feita assim:

1. o **fundo do elemento** é o gradiente de ouro, ou seja, é a moldura;
2. o **`::before`** desenha o miolo escuro por dentro, deslocado por
   `--frame-w` (1px a 2px) e com o mesmo chanfro, 1px menor;
3. o elemento leva `isolation: isolate`, o que cria contexto de empilhamento e
   garante que o `::before` (`z-index: -1`) fique acima do fundo do elemento e
   abaixo do conteúdo, em qualquer lugar da árvore, inclusive dentro do modal.

Quem participa do sistema está na regra agrupada no topo do `styles.css`:
`.frame`, `.btn`, `.mini-btn`, `.chip`, `.card`, `.field`, `.badge`,
`.status-frame`, `.form-error`, `.section-totals` e `.modal`. Para criar uma
peça nova com moldura, **acrescente o seletor nos dois grupos** (elemento e
`::before`) em vez de repetir o código, e ajuste só as variáveis:

| Variável | Significa |
|---|---|
| `--c` | tamanho do chanfro |
| `--frame-edge` | cor ou gradiente da moldura |
| `--frame-fill` | preenchimento do miolo (sempre opaco) |
| `--frame-w` | espessura da moldura |

`input` e `select` não aceitam pseudo-elemento, por isso ficam **dentro** de um
invólucro `.field` (ou `.status-frame`, no caso do status), transparentes e sem
borda própria. Ver [04-componentes-e-telas.md](04-componentes-e-telas.md).

## 3.6 Componentes visuais e suas classes

| Elemento | Classe base | Variantes |
|---|---|---|
| Botão | `.btn` | `.primary` (ouro preenchido), `.ghost`, `.block`, `.small`, `.icon`, `.icon.danger` |
| Botão de texto discreto | `.mini-btn` | usado em "tornar padrão" |
| Botão sem moldura em tabela | `.link-btn` | expandir categoria |
| Campo | `.field` | `.plate` (placa de valor), `.inline` (edição em tabela) |
| Chip de categoria | `.chip` | `.selected` (ouro preenchido), `.new` (moldura tracejada) |
| Card | `.card` | `.table-card`, `.totals-card`, `.info` |
| Selo | `.badge` | `.open`, `.closed`, `.installment`, `.padrao`, `.ignored` |
| Marca | `.brand-mark` | `.big` (login) |
| Barra de progresso | `.progress` mais `.progress-fill` | `.over` troca para o gradiente terracota |
| Valor editável | `.money-cell` | `.muted`, `.text-cell` |
| Status | `.status-frame` mais `.status-select` | classes `.st-*` da tabela abaixo |
| Caixa de erro | `.form-error` | moldura terracota |
| Mensagem de sucesso | `.flash` | ouro |
| Modal | `.modal-backdrop`, `.modal`, `.modal-body`, `.modal-actions` | `.modal-form` para formulário |
| Texto de apoio do card | `.card-hint` | |

Utilitários globais: `.muted`, `.small`, `.center`, `.neg` (terracota),
`.pos` (ouro), `.center-self`, `.h2-gold`.

Detalhes de acabamento que fazem parte da identidade:

- a **placa de valor** (`.field.plate`) tem rebites: quatro pontos claros nos
  cantos, desenhados no `::after` com quatro `radial-gradient`;
- a **marca** (`.brand-mark`) é um ladrilho de ouro com dois cantos cortados e
  o símbolo da carteira vazado em preto;
- a **aba ativa** no desktop ganha moldura chanfrada e brilho;
- a **barra de rolagem** horizontal dos chips e das tabelas é fina, com trilho
  escuro e polegar em gradiente de ouro.

## 3.7 Cores de status

Aplicadas pelo mapa `STATUS_CLASS` em
[`MonthScreen.tsx`](../src/components/MonthScreen.tsx), no invólucro
`.status-frame`:

| Status | Classe | Aparência |
|---|---|---|
| Pendente | `.st-pending` | moldura e texto terracota |
| Parcialmente pago | `.st-partial` | moldura terracota fraca, texto âmbar |
| Agendado/Automático | `.st-scheduled` | moldura e texto em ouro suave |
| Pago | `.st-paid` | moldura em ouro pleno, texto em ouro claro |
| Sem gasto | `.st-none` | moldura discreta, texto apagado |
| Não disponível ainda | `.st-unavailable` | moldura discreta, texto apagado |
| Ignorar | `.st-ignored` | moldura quase invisível, texto mais apagado |

A linha com status `Ignorar` recebe `.row-ignored` no `<tr>`: opacidade 0.7 e
valor da coluna Valor/Soma riscado. O ideal não é riscado, porque continua
contando no orçamento.

## 3.8 Convenções de UX

- **Ouro é o positivo e o ativo.** Valor dentro do ideal, status Pago, item de
  navegação selecionado, categoria escolhida e confirmação de sucesso.
- **Cheio contra vazado é o sinal mais forte.** Peça preenchida de ouro
  significa "selecionado ou principal" (botão primário, chip selecionado, data
  personalizada); peça vazada é o estado neutro.
- **Terracota (`--danger`) é pendência, erro ou excesso**, nunca decoração.
- **Edição no lugar**: valores e nomes viram campo ao toque (`EditableMoney`,
  `EditableText`), com sublinhado tracejado em ouro sinalizando que dá para
  editar. Salvam no `blur` ou no Enter e cancelam no Escape.
- **Ação destrutiva sempre passa por `ConfirmModal`**, com o texto explicando a
  consequência exata.
- **Estado ocupado** desabilita o botão e troca o rótulo por gerúndio com
  reticências ("Salvando…", "Entrando…", "Aguarde…").
- **Ícone sempre acompanha rótulo ou `title`/`aria-label`.** Ícones decorativos
  levam `aria-hidden`.
- **Foco visível**: campo em foco troca a moldura para ouro pleno e ganha
  brilho.

## 3.9 Ícone do app (PWA)

Os PNGs em [`public/icons/`](../public/icons) são a cara do app instalado e
seguem a mesma identidade: **fundo preto sangrando**, glifo da carteira em
gradiente de ouro (`#fff8dc`, `#e7c95f`, `#b78f24`, `#f2e0a2`, de cima para
baixo) e um brilho radial suave de ouro no topo.

| Arquivo | Lado | Particularidade |
|---|---|---|
| `icon-192.png` | 192 | moldura chanfrada de ouro, glifo em 52% do lado |
| `icon-512.png` | 512 | idem |
| `icon-maskable-512.png` | 512 | sem moldura e glifo em 42%: a máscara do Android corta até 20% da borda, então tudo fica na zona segura |
| `apple-touch-icon.png` | 180 | sem moldura: o iOS aplica a máscara arredondada dele |

Ao trocar o ícone, gere os quatro juntos e mantenha os nomes. Vale lembrar que
o sistema operacional guarda o ícone escolhido na instalação: no celular, ver o
ícone novo exige **reinstalar o app** (remover da tela inicial e adicionar de
novo), mesmo com o deploy publicado.

O favicon do navegador é um SVG embutido no [`index.html`](../index.html), com
o mesmo glifo em `--gold` sólido.

## 3.10 Ícones da interface

Todos do `lucide-react`, tamanho 14 a 20 conforme o contexto (14 a 16 em linhas
e chips, 18 em botões de ícone, 20 na navegação, 34 na marca grande do login).
Em uso hoje: `Wallet`, `Plus`, `BarChart3`, `Banknote`, `Settings`,
`CalendarDays`, `Eraser`, `Pencil`, `X`, `ChevronLeft`, `ChevronRight`,
`ChevronUp`, `ChevronDown`.
