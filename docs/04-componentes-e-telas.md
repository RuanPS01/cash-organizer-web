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
- `MonthSummaryCard`;
- `ExpenseHistory` no rodapé, com o histórico do mês.

O botão de calendário é um `div` com aparência de botão e um `input[type=date]`
invisível por cima (`.date-native`): no celular o toque cai no input e abre o
seletor nativo; no desktop o `onClick` chama `showPicker()`. Não troque isso por
um botão comum, porque em vários navegadores o clique programático não abre o
calendário.

### `MonthScreen` (abas Pagamento e Estatísticas)

`props: { compartmentId, currentMonth, mode: 'payment' | 'stats', origins, onCurrentMonthChange }`

O mesmo componente serve às duas abas. Cabeçalho com navegação de mês
(anterior e próximo) e selo de aberto ou fechado. Com `mode="stats"` delega para
`StatsView`. Com `mode="payment"` mostra, nesta ordem:

- tabela de **origens** (nome com glifo, fixos, variáveis, total, status): uma
  linha por origem **cadastrada**, na ordem do cadastro, mais as origens que
  saíram do cadastro e ainda têm linha no mês. A lista vem do cadastro e não das
  linhas do mês, que são só onde o status mora: origem recém criada apareceria
  fora da tabela se dependesse da linha, e sem linha ainda o status exibido é
  `Pendente`, que é com o que ela nasce. O total é a soma de fixos e variáveis,
  que é o valor da fatura daquela origem no mês, e em telas estreitas as duas
  parcelas descem para a sublinha `.cell-sub`. Trocar o status aplica o mesmo
  status aos gastos fixos dela e grava a linha do mês, criando-a se ainda não
  existir (`setOriginStatus`). Lançamento sem origem vira uma linha só de
  leitura, porque não há onde guardar status;
- tabela de gastos fixos (nome, ideal, valor, status), com ideal e valor
  editáveis no lugar e o selo da origem ao lado do nome (o glifo e o tom vêm do
  cadastro recebido em `origins`; a linha do mês guarda só o id e o nome);
- card de totais (ideal, atual, fixos, variáveis) e o botão "Virar mês", liberado
  só quando não há origem nem gasto fixo em `Pendente`;
- fluxo de dupla confirmação para definir outro mês como o mês em aberto.

Não há tabela de categorias: categoria é orçamento, não forma de pagamento. O
ideal por categoria é editado na tela Gerenciar e os lançamentos ficam no
histórico da aba Adicionar.

Edição só é permitida quando o mês visualizado é o corrente e está aberto
(`editable`).

### `ManageScreen` (aba Gerenciar)

`props: { compartmentId, currentMonth, fixedExpenses, categories, origins, monthData }`

Cadastro de gastos fixos (com modal completo: nome, descrição, valor, ideal,
origem e parcela; a lista mostra o selo da origem ao lado do nome) e de
categorias (nome editável, ideal editável, reordenação com as setas, "tornar
padrão" e remoção). Mostra totais de cadastro por seção. A terceira seção, de
origens do gasto, é delegada ao `ManageOrigins`.

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

### `components/MonthSummaryCard.tsx`

`props: { viewMonth, data }`

Card "Resumo do mês (total gasto x ideal)": uma linha só, a do mês visualizado,
com gasto, ideal, percentual, barra e a descrição com fixos, variáveis e o
restante (ou o excedido, em vermelho). Mês fechado usa os totais gravados; o mês
em aberto é calculado ao vivo. Reutilizado pela aba Adicionar e pela aba
Estatísticas: se precisar dele em outro lugar, reutilize em vez de copiar.

### `components/ExpenseHistory.tsx`

`props: { compartmentId, ym, data, categories, origins }`

Histórico do mês exibido na aba Adicionar, com duas subabas: **Variáveis**
(padrão, do lançamento mais recente para o mais antigo) e **Fixos**. Tem barra
de busca (sem acento e sem caixa, cobrindo também o nome da origem nas duas
subabas) e, na aba de variáveis, filtros de categoria, origem e faixa de data.
Na subaba de fixos o selo da origem aparece ao lado do status, sem botão de
troca: a origem do gasto fixo vem do cadastro e muda na aba Gerenciar.

**Edição do lançamento.** Cada linha de variável tem dois botões: o lápis abre o
`ExpenseEditModal` (arquivo próprio, ao lado), com descrição, valor, data do
gasto, categoria e origem em um formulário só; o X abre a confirmação de
exclusão. Os
selos de categoria e de origem são apenas leitura, e um lançamento sem origem
mostra o selo apagado "sem origem". A data só vai para o patch quando muda de
dia, levando a hora original junto (`updateVariableExpense` deriva a semana da
data).

**Reclassificação em lote.** O botão de seleção na barra de busca liga o modo de
lote: cada item ganha uma caixa de marcação (`.check-box`), os botões de editar e
excluir saem das linhas, a barra `.bulk-bar` mostra o contador com "Selecionar
todos" e o `ReclassifyModal` aplica a troca de categoria e de origem a todos os
marcados de uma vez, com a opção "Manter a atual" em cada campo. A seleção
considera apenas o que está visível: filtrar depois de marcar não deixa um
lançamento fora da tela ser alterado sem querer.

Na subaba de fixos, valor e descrição da linha do mês seguem editáveis no lugar
(`EditableMoney` e `EditableText`), porque ali o cadastro é que manda. A remoção
passa por `ConfirmModal`: lançamento variável é excluído de verdade, gasto fixo
usa `removeFixedExpense` (sai do mês e dos próximos, porque uma linha apagada
sozinha voltaria na próxima reconciliação de `ensureMonth`). Edição só é liberada
com o mês em aberto.

### `components/ExpenseEditModal.tsx`

`props: { expense, categories, origins, busy, saveError, onConfirm, onCancel }`

Modal de edição completa de um lançamento variável: descrição, valor, data do
gasto, categoria e origem, com um botão de salvar. Categoria ou origem que saiu
do cadastro continua na lista enquanto o lançamento a usa, senão salvar qualquer
campo trocaria a classificação dele. Devolve em `onConfirm` o patch do
`updateVariableExpense`, com `date` presente só quando o dia muda.

Saiu do `ExpenseHistory` para arquivo próprio quando o histórico passou de 790
linhas (ver [10-manutencao-e-granularidade.md](10-manutencao-e-granularidade.md),
seção 10.2).

### `components/ManageOrigins.tsx`

`props: { compartmentId, currentMonth, origins }`

Seção "Origens do gasto" da tela Gerenciar mais o modal de criação e edição
(nome, grade de ícones e fileira de tons, com prévia). A primeira origem criada
já nasce como padrão. Criar, renomear e remover refletem na linha do mês em
aberto (é ela que a aba Pagamento lista), daí o `currentMonth` nas props. Modais ficam fora do `.card` de propósito: `clip-path`
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

Subtela de estatísticas: o resumo do mês, o uso por categoria no mês
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
| `useMonthData(compartmentId, ym)` | `{ loading, month, fixedEntries, categoryEntries, originEntries, expenses }` | documento do mês e as quatro subcoleções, em tempo real |
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

`monthRef`, `fixedEntriesCol`, `categoryEntriesCol`, `originEntriesCol`,
`expensesCol`, `isMonthOpen`, `ensureMonth`, `setOpenMonth` (move o conteúdo do
mês em aberto para outro mês e troca a referência), `computeTotals` (recebe
também as linhas de origem, porque origem ignorada tira do gasto tudo que saiu
dela), `closeMonth`, `fetchExpenses`.

### `services/origins.ts`

`originsCol`, `addOrigin`, `saveOrigin`, `updateOrigin`, `moveOrigin`,
`setDefaultOrigin`, `removeOrigin` (desativa; o histórico segue com o nome
gravado no lançamento). `addOrigin`, `saveOrigin` e `removeOrigin` recebem o
`currentMonth` e mantêm a linha `originEntries` do mês em aberto em dia; a
remoção só apaga a linha quando nada saiu daquela origem no mês.

### `services/expenses.ts`

Lançamentos: `addVariableExpense` (aceita `originId` e `originName`),
`updateVariableExpense` (valor, descrição, classificação e data, que grava
`createdAt` e `week` juntos), `updateVariableExpenses` (mesma classificação em
vários lançamentos, em `writeBatch` de até 400 por vez), `deleteVariableExpense`.
Gastos fixos: `addFixedExpense` e `saveFixedExpense` (gravam o cadastro completo,
origem inclusive, e refletem na linha do mês em aberto), `updateFixedExpense`,
`removeFixedExpense`.
Categorias: `addCategory`, `updateCategory`, `renameCategory`,
`saveCategoryIdeal`, `moveCategory`, `setDefaultCategory`, `removeCategory`.
Linhas do mês: `updateFixedEntry`, `updateCategoryEntry`, `setOriginStatus`
(status da origem mais o mesmo status nos gastos fixos dela, em um `writeBatch`).

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
| `writeErrorMessage(err)` | `utils/errors.ts` | mensagem legível para falha de gravação no Firestore (trata `permission-denied` e falta de conexão) |
| `sha256Hex`, `hashPassword` | `utils/crypto.ts` | hash da senha com o id como sal |
| `encryptText`, `decryptText` | `utils/crypto.ts` | AES-GCM com a chave do dispositivo |
