# 3. Identidade visual (UI/UX)

Todo o CSS do app está em [`src/styles.css`](../src/styles.css), em um arquivo
único, organizado por seções com comentário de cabeçalho. Não há CSS Modules,
CSS-in-JS nem framework de utilitários.

## 3.1 Tokens de cor

Declarados em `:root` e redefinidos no bloco
`@media (prefers-color-scheme: dark)`. O tema segue o sistema operacional: não
existe botão de alternância no app.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#f4f6f8` | `#0b1220` | fundo da página |
| `--surface` | `#ffffff` | `#131c2b` | cards, topbar, navbar, modais, inputs |
| `--text` | `#1c2733` | `#e4ecf5` | texto principal |
| `--muted` | `#64748b` | `#8ea0b5` | texto secundário, rótulos, ícones inativos |
| `--border` | `#e2e8f0` | `#24344a` | bordas, divisórias, trilho da barra de progresso |
| `--primary` | `#0f766e` | `#14b8a6` | ação principal, item ativo, marca |
| `--primary-strong` | `#115e59` | `#0d9488` | hover do botão primário e texto do badge aberto |
| `--primary-soft` | `#ccfbf1` | `#0f3d38` | fundo do badge "em aberto" |
| `--danger` | `#dc2626` | `#f87171` | erro, excluir, valor acima do ideal |
| `--danger-soft` | `#fee2e2` | `#45191c` | fundo da caixa de erro |
| `--ok` | `#16a34a` | igual ao claro | pago, sucesso, flash |
| `--warn` | `#d97706` | igual ao claro | pendente, atenção, data personalizada |

`--ok` e `--warn` propositalmente não mudam entre os temas: os valores atuais têm
contraste aceitável nos dois fundos. Se um dia precisarem mudar, redefina no
bloco escuro e atualize esta tabela.

Outros tokens:

| Token | Valor | Uso |
|---|---|---|
| `--radius` | `14px` | cards, modais, login |
| `--shadow` | sombra dupla suave (mais densa no escuro) | cards e modais |
| `color-scheme` | `light` ou `dark` | faz os controles nativos (calendário do `input[type=date]`, lista do `select`) seguirem o tema |

Botão, input e select usam raio próprio de `10px`; pílulas (chip, badge, status)
usam `999px`.

**Regra:** nunca escreva hex direto em uma regra nova. Se precisar de uma cor
intermediária, use `color-mix(in srgb, var(--token) N%, transparent)`, padrão já
usado em `.details-row`, `.section-totals` e na barra de rolagem fina.

## 3.2 Tipografia

- Família: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- Base: `16px` com `line-height: 1.45` e `-webkit-font-smoothing: antialiased`.
- Escala: `h1` 1.4rem (só no login), `h2` 1.3rem (título de tela), `h3` 1.02rem
  (título de card), corpo 1rem, apoio 0.9rem, `.small` 0.82rem, rótulo de tabela
  e badge 0.7rem a 0.75rem em maiúsculas com `letter-spacing`.
- Valor em destaque: `.money-input.big` (1.9rem, peso 700, centralizado) é o campo
  de valor da tela de novo gasto, o maior elemento da interface por decisão de
  produto.
- Peso 600 é o padrão de ênfase (botões, nomes, valores); 700 fica para marca,
  badge e o valor grande.

## 3.3 Espaçamento e layout

- Unidade em `rem`, quase sempre múltiplos de 0.25rem.
- `.screen` empilha os cards com `gap: 1rem`; `.card` tem `padding: 1rem`.
- `.content` limita a largura útil em `860px` e centraliza, com
  `padding-bottom: 5.5rem` no celular para o conteúdo não ficar sob a navbar
  fixa.
- Áreas seguras do iOS: `padding-top: env(safe-area-inset-top)` na topbar e
  `padding-bottom: env(safe-area-inset-bottom)` na navbar.

## 3.4 Componentes visuais e suas classes

| Elemento | Classe base | Variantes |
|---|---|---|
| Botão | `.btn` | `.primary`, `.ghost`, `.block`, `.small`, `.icon`, `.icon.danger` |
| Botão discreto de texto | `.mini-btn` | usado em "tornar padrão" |
| Botão sem moldura em tabela | `.link-btn` | expandir categoria |
| Chip de categoria | `.chip` | `.selected`, `.new` (tracejado) |
| Card | `.card` | `.table-card`, `.totals-card`, `.info` |
| Selo | `.badge` | `.open`, `.closed`, `.installment`, `.ignored` |
| Barra de progresso | `.progress` mais `.progress-fill` | `.over` pinta de `--danger` |
| Valor editável | `.money-cell` | `.muted`, `.text-cell` |
| Select de status | `.status-select` | classes `.st-*` da tabela abaixo |
| Caixa de erro | `.form-error` | fundo `--danger-soft` |
| Mensagem de sucesso | `.flash` | cor `--ok` |
| Modal | `.modal-backdrop`, `.modal`, `.modal-body`, `.modal-actions` | `.modal-form` para formulário dentro do modal |

Utilitários globais: `.muted`, `.small`, `.center`, `.neg` (vermelho),
`.pos` (verde), `.center-self`.

## 3.5 Cores de status

Cada status de linha do mês tem uma classe, aplicada pelo mapa `STATUS_CLASS` em
[`MonthScreen.tsx`](../src/components/MonthScreen.tsx):

| Status | Classe | Aparência |
|---|---|---|
| Pendente | `.st-pending` | texto e borda em `--warn` |
| Parcialmente pago | `.st-partial` | texto em `--warn` |
| Agendado/Automático | `.st-scheduled` | texto em `--primary` |
| Pago | `.st-paid` | texto e borda em `--ok` |
| Sem gasto | `.st-none` | texto em `--muted` |
| Não disponível ainda | `.st-unavailable` | texto em `--muted` |
| Ignorar | `.st-ignored` | texto em `--muted` e borda tracejada |

A linha com status `Ignorar` recebe `.row-ignored` no `<tr>`: opacidade 0.75 e
valor da coluna Valor/Soma riscado. O ideal não é riscado, porque continua
contando no orçamento.

## 3.6 Convenções de UX já estabelecidas

- **Laranja (`--warn`) significa atenção reversível**, não erro. É a cor de
  "Pendente" e da data personalizada no novo gasto (borda do botão de calendário
  mais o texto "Data:").
- **Vermelho (`--danger`) é erro ou excesso**: caixa de erro, botão de excluir,
  barra estourada, valor acima do ideal.
- **Verde (`--ok`) é conclusão**: status Pago e mensagem de confirmação.
- **Edição no lugar**: valores e nomes viram input ao toque (`EditableMoney`,
  `EditableText`), salvam no `blur` ou no Enter e cancelam no Escape. Não há
  botão "salvar" para esses campos.
- **Ação destrutiva sempre passa por `ConfirmModal`**, com o texto explicando a
  consequência exata (o que some agora, o que continua nos meses fechados).
- **Estado ocupado** desabilita o botão e troca o rótulo por gerúndio com
  reticências ("Salvando…", "Entrando…", "Aguarde…").
- **Ícone sempre acompanha rótulo ou `title`/`aria-label`.** Ícones decorativos
  levam `aria-hidden`.
- **Barra de rolagem horizontal fina e no tema** nos contêineres roláveis
  (`.chip-row`, `.table-scroll`), com regras padrão e `-webkit-` para o Safari.

## 3.7 Ícones

Todos vêm do `lucide-react`, tamanho 14 a 20 conforme o contexto (14 a 16 dentro
de linhas e chips, 18 em botões de ícone, 20 na navbar, 40 no logo do login).
Ícones em uso hoje: `Wallet`, `Plus`, `BarChart3`, `Banknote`, `Settings`,
`CalendarDays`, `Eraser`, `Pencil`, `X`, `ChevronLeft`, `ChevronRight`,
`ChevronUp`, `ChevronDown`.
