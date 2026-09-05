# 4. Componentes e telas

Antes de criar qualquer coisa nova, procure nesta lista. Duplicar um componente
que já existe é o erro mais comum neste repositório.

## 4.1 Telas

### `App.tsx`

Não é uma tela: é o container. Cuida de restaurar a sessão, exibir o
`LoginScreen` quando não há compartimento, e montar o `Shell` (topbar com marca e
botão Sair, área de conteúdo e navbar com quatro abas). Guarda `view` e
`currentMonth`, e assina `useConfig` e `useMonthData` para repassar às telas.

### `LoginScreen`

`props: { onEnter: (compartment: Compartment) => void }`

Formulário de nome do compartimento mais senha. Valida nome com `slugify` (não
pode ficar vazio) e senha com mínimo de 4 caracteres. Se o compartimento não
existe, abre `ConfirmModal` oferecendo criar. Ao entrar com sucesso, salva a
sessão, garante o mês corrente e chama `onEnter`.

### `AddExpenseScreen` (aba Adicionar)

`props: { compartmentId, currentMonth, categories, origins, data }`

Tela principal. Contém:

- linha de chips de categoria, com a categoria padrão pré-selecionada e o chip
  tracejado "+ categoria" para criar uma na hora;
- `MoneyInput` grande com `autoFocus`;
- linha de descrição com o botão de calendário e o botão de borracha;
- linha "Data:" logo abaixo, em cinza quando é hoje e em laranja quando é outra
  data;
- linha de chips de **origem** (de onde o dinheiro saiu), com o glifo colorido
  de cada origem e a origem padrão pré-selecionada; a linha inteira some quando
  não há origem cadastrada;
- card de informe da categoria selecionada (restante da semana, restante do mês,
  barras de progresso, totais de fixos e variáveis do mês);
- `MonthlyComparisonCard`;
- `ExpenseHistory` no rodapé, com o histórico do mês.

O botão de calendário é um `div` com aparência de botão e um `input[type=date]`
invisível por cima (`.date-native`): no celular o toque cai no input e abre o
seletor nativo; no desktop o `onClick` chama `showPicker()`. Não troque isso por
um botão comum, porque em vários navegadores o clique programático não abre o
calendário.

### `MonthScreen` (abas Pagamento e Estatísticas)

`props: { compartmentId, currentMonth, mode: 'payment' | 'stats', onCurrentMonthChange }`

O mesmo componente serve às duas abas. Cabeçalho com navegação de mês
(anterior e próximo) e selo de aberto ou fechado. Com `mode="stats"` delega para
`StatsView`. Com `mode="payment"` mostra:

- tabela de gastos fixos (nome, ideal, valor, status), com ideal e valor
  editáveis no lugar;
- tabela de categorias com a soma dos lançamentos, expansível para listar e
  excluir lançamentos;
- card de totais (ideal, atual, fixos, variáveis) e o botão "Virar mês", liberado
  só quando não há linha `Pendente`;
- fluxo de dupla confirmação para definir outro mês como o mês em aberto.

Edição só é permitida quando o mês visualizado é o corrente e está aberto
(`editable`).

### `ManageScreen` (aba Gerenciar)

`props: { compartmentId, currentMonth, fixedExpenses, categories, origins, monthData }`

Cadastro de gastos fixos (com modal completo: nome, descrição, valor, ideal e
parcela) e de categorias (nome editável, ideal editável, reordenação com as
setas, "tornar padrão" e remoção). Mostra totais de cadastro por seção. A
terceira seção, de origens do gasto, é delegada ao `ManageOrigins`.

## 4.2 Componentes reutilizáveis

### `components/shared.tsx`

| Componente | Assinatura resumida | Quando usar |
|---|---|---|
| `ConfirmModal` | `{ title, children, confirmLabel, cancelLabel?, busy?, onConfirm, onCancel }` | qualquer confirmação ou formulário em modal. É a base do `FixedExpenseModal` |
| `MoneyInput` | `{ valueCents, onChange, placeholder?, big?, autoFocus?, id? }` | entrada de valor em centavos, sempre formatada enquanto digita |
| `EditableMoney` | `{ valueCents, onSave, disabled?, muted? }` | valor que vira input ao toque e salva no blur ou Enter |
| `EditableText` | `{ value, onSave, disabled?, placeholder?, allowEmpty? }` | texto que vira input ao toque; vazio cancela, a menos que `allowEmpty` (usado na descrição do lançamento, que pode ser apagada). `placeholder` é o texto exibido quando o valor está vazio |
| `ProgressBar` | `{ ratio, danger? }` | barra de progresso; passa de 1 fica com a classe `over` |
| `BrandMark` | `{ big? }` | marca do app, igual ao ícone do PWA. Use sempre este componente em vez de desenhar a marca de novo |

Esses componentes não conhecem domínio: recebem valores e devolvem eventos.
Mantenha assim.

**Campo com moldura.** `input` e `select` não aceitam pseudo-elemento, e é o
`::before` que desenha o miolo escuro dentro da moldura de ouro. Por isso todo
campo vai dentro de um invólucro: `<span className="field"><input …/></span>`
(com `plate` na placa de valor e `inline` na edição em tabela), e o status usa
`<span className="status-frame st-…"><select …/></span>`. Ao criar um campo
novo, use o invólucro em vez de estilizar o controle direto. Ver
[03-identidade-visual.md](03-identidade-visual.md), seção 3.5.

### `components/MonthlyComparisonCard.tsx`

`props: { compartmentId, viewMonth, data }`

Card "Comparativo mensal (total gasto x ideal)" com os últimos seis meses. Usa os
totais gravados nos meses fechados e calcula ao vivo o mês visualizado. Cada
linha mostra gasto, ideal, percentual, barra e a descrição com fixos, variáveis e
o restante (ou o excedido, em vermelho). Reutilizado pela aba Adicionar e pela
aba Estatísticas: se precisar dele em outro lugar, reutilize em vez de copiar.

### `components/ExpenseHistory.tsx`

`props: { compartmentId, ym, data, categories, origins }`

Histórico do mês exibido na aba Adicionar, com duas subabas: **Variáveis**
(padrão, do lançamento mais recente para o mais antigo) e **Fixos**. Tem barra
de busca (sem acento e sem caixa) e, na aba de variáveis, filtros de categoria,
origem e faixa de data. Valor e descrição são editáveis no lugar
(`EditableMoney` e `EditableText`) e a remoção passa por `ConfirmModal`:
lançamento variável é excluído de verdade, gasto fixo usa `removeFixedExpense`
(sai do mês e dos próximos, porque uma linha apagada sozinha voltaria na
próxima reconciliação de `ensureMonth`). Edição só é liberada com o mês em
aberto.

### `components/ManageOrigins.tsx`

`props: { compartmentId, origins }`

Seção "Origens do gasto" da tela Gerenciar mais o modal de criação e edição
(nome, grade de ícones e fileira de tons, com prévia). A primeira origem criada
já nasce como padrão. Modais ficam fora do `.card` de propósito: `clip-path`
recorta até descendente `position: fixed`.

### `components/OriginIcon.tsx`

`props: { icon?, color?, size? }`

Glifo da origem no tom escolhido, mais os catálogos `ORIGIN_ICON_LABELS`,
`ORIGIN_COLOR_LABELS`, `ORIGIN_ICON_OPTIONS` e `ORIGIN_COLOR_OPTIONS`. As
chaves ficam em `types.ts` e o desenho do lucide-react correspondente fica aqui,
então trocar um ícone não mexe em dado gravado. Sem ícone conhecido (origem
removida do cadastro), cai na carteira em ouro.

### `components/StatsView.tsx`

`props: { compartmentId, viewMonth, data }`

Subtela de estatísticas: o comparativo mensal, o uso por categoria no mês
visualizado (com selo "ignorado" quando a categoria está fora da soma) e a
comparação das quatro semanas com o mês anterior.

### `StatusSelect` (interno do `MonthScreen`)

Select em formato de pílula com as opções de `ENTRY_STATUSES` e a classe de cor
correspondente, lida do mapa `STATUS_CLASS` de `types.ts`. O componente não é
exportado; se outra tela precisar dele, mova para `shared.tsx` em vez de
duplicar. Quem só precisa da cor (como o selo de status do `ExpenseHistory`)
usa o `STATUS_CLASS` direto.

## 4.3 Hooks

Ambos em [`src/hooks/useMonthData.ts`](../src/hooks/useMonthData.ts).

| Hook | Retorno | O que assina |
|---|---|---|
| `useMonthData(compartmentId, ym)` | `{ loading, month, fixedEntries, categoryEntries, expenses }` | documento do mês e as três subcoleções, em tempo real |
| `useConfig(compartmentId)` | `{ fixedExpenses, categories, origins }` | cadastros do compartimento, já filtrados por `active` e ordenados |

`useConfig` ordena categorias e origens por `sortOrder ?? createdAt`, que é a
ordem exibida nos chips e na tela Gerenciar. Fixos vêm ordenados por nome.

## 4.4 Serviços disponíveis

Antes de escrever uma escrita nova, confira se ela já existe.

### `services/compartments.ts`

`slugify`, `compartmentRef`, `fetchCompartment`, `openCompartment` (devolve
`ok`, `not-found` ou `wrong-password`), `createCompartment` (já cria a categoria
padrão "Avulso").

### `services/session.ts`

`saveSession`, `clearSession`, `restoreSession`.

### `services/months.ts`

`monthRef`, `fixedEntriesCol`, `categoryEntriesCol`, `expensesCol`,
`ensureMonth`, `setOpenMonth`, `computeTotals`, `closeMonth`, `listMonths`,
`fetchExpenses`.

### `services/origins.ts`

`originsCol`, `addOrigin`, `saveOrigin`, `updateOrigin`, `moveOrigin`,
`setDefaultOrigin`, `removeOrigin` (desativa; o histórico segue com o nome
gravado no lançamento).

### `services/expenses.ts`

Lançamentos: `addVariableExpense` (aceita `originId` e `originName`),
`updateVariableExpense` (valor e descrição), `deleteVariableExpense`.
Gastos fixos: `addFixedExpense`, `saveFixedExpense`, `updateFixedExpense`,
`removeFixedExpense`.
Categorias: `addCategory`, `updateCategory`, `renameCategory`,
`saveCategoryIdeal`, `moveCategory`, `setDefaultCategory`, `removeCategory`.
Linhas do mês: `updateFixedEntry`, `updateCategoryEntry`.

## 4.5 Utilitários

| Função | Arquivo | O que faz |
|---|---|---|
| `formatBRL(cents)` | `utils/money.ts` | centavos para "R$ 1.234,56" |
| `digitsToCents(text)` | `utils/money.ts` | lê só os dígitos digitados, com teto de R$ 999.999.999,99 |
| `monthKey(date?)` | `utils/dates.ts` | `YYYY-MM` |
| `nextMonthKey`, `prevMonthKey` | `utils/dates.ts` | navegação de mês |
| `monthLabel(key)` | `utils/dates.ts` | "Setembro de 2026" |
| `weekOfMonth(date?)` | `utils/dates.ts` | semana 1 a 4 (dia 29 em diante é 4) |
| `dayKey(date?)` | `utils/dates.ts` | `YYYY-MM-DD` para o `input[type=date]` |
| `dateFromDayKey(key, time?)` | `utils/dates.ts` | `YYYY-MM-DD` para `Date` local, com a hora do relógio |
| `dayLabel(ms)`, `dayKeyLabel(key)` | `utils/dates.ts` | "21/08" |
| `dayKeyFullLabel(key)` | `utils/dates.ts` | "21/08/2026" |
| `sha256Hex`, `hashPassword` | `utils/crypto.ts` | hash da senha com o id como sal |
| `encryptText`, `decryptText` | `utils/crypto.ts` | AES-GCM com a chave do dispositivo |
