# 6. Banco de dados e formato dos dados

Banco: **Cloud Firestore**, acessado direto pelo cliente. As regras de segurança
ficam no repositório `cash-organizer-functions`, não aqui.

## 6.1 Regras gerais de formato

| Regra | Detalhe |
|---|---|
| Dinheiro | inteiro em **centavos**. R$ 1.234,56 é gravado como `123456`. Nunca float |
| Data e hora | número em milissegundos (`Date.now()` ou `date.getTime()`), nunca `Timestamp` do Firestore |
| Chave de mês | string `YYYY-MM`, usada como id do documento do mês |
| Chave de dia | string `YYYY-MM-DD` apenas na UI (`input[type=date]`), nunca persistida |
| Semana | inteiro de 1 a 4; dias 29 em diante contam como semana 4 |
| Campo vazio | `null` ou chave ausente. **`undefined` faz o SDK rejeitar a escrita** |
| Ordenação de categoria | `sortOrder` numérico (fallback para `createdAt`) |
| Booleano de ciclo de vida | `active` no cadastro; remoção é desativação, não exclusão |

## 6.2 Árvore de coleções

```
compartments/{compartmentId}
  fixedExpenses/{fixedExpenseId}
  categories/{categoryId}
  origins/{originId}
  months/{YYYY-MM}
    fixedEntries/{fixedExpenseId}
    categoryEntries/{categoryId}
    originEntries/{originId}
    expenses/{autoId}
```

O id do compartimento é o nome passado por `slugify` ("Casa Nova" vira
`casa-nova`), então o nome é único por definição. As linhas do mês reaproveitam o
id do cadastro correspondente, o que torna a reconciliação entre cadastro e mês
uma comparação direta de ids.

## 6.3 `compartments/{id}`

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | nome digitado, com trim |
| `passwordHash` | string | SHA-256 de `${id}::${senha}` em hexadecimal |
| `currentMonth` | string | `YYYY-MM` do mês em aberto |
| `createdAt` | number | ms |

A senha em texto puro nunca sai do dispositivo. O id entra como sal, então o
mesmo texto de senha em compartimentos diferentes gera hashes diferentes.

## 6.4 `fixedExpenses/{id}` (cadastro de gasto fixo)

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | com trim |
| `amount` | number | valor mensal em centavos |
| `idealAmount` | number | se não informado, recebe o próprio `amount` |
| `description` | string | comentário livre, `''` quando vazio |
| `originId` | string ou null | origem escolhida no cadastro (coleção `origins`); `null` quando o gasto não tem origem |
| `originName` | string | denormalizado, mantém a listagem legível se a origem for renomeada ou removida |
| `installmentCurrent` | number ou null | parcela atual, começa em 1 |
| `installmentTotal` | number ou null | total de parcelas; `null` significa gasto sem parcelamento |
| `active` | boolean | `false` some dos próximos meses |
| `createdAt` | number | ms |

`normalizeFixedInput` em `services/expenses.ts` é quem garante o formato: faz
trim, aplica o `amount` como ideal quando falta, grava a origem como `null` mais
nome em branco quando não há escolha, e zera as parcelas para `null` quando não
há `installmentTotal`.

## 6.5 `categories/{id}` (cadastro de categoria variável)

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | com trim |
| `idealAmount` | number | gasto ideal do mês em centavos; o ideal semanal é este valor dividido por 4 |
| `isDefault` | boolean | só uma por compartimento; é a pré-selecionada e não pode ser removida |
| `sortOrder` | number | posição nos chips e na lista; ausente usa `createdAt` |
| `active` | boolean | `false` some dos próximos meses |
| `createdAt` | number | ms |

Todo compartimento nasce com a categoria "Avulso" como padrão. O papel de padrão
pode ser transferido para outra categoria com `setDefaultCategory`.

## 6.5.1 `origins/{id}` (cadastro de origem do gasto)

A origem diz de onde o dinheiro saiu ("Cartão C6 (Crédito)", "Pix ou Transf.",
"Cartão Nu"). No lançamento variável ela é o segundo eixo de classificação, ao
lado da categoria; no gasto fixo ela faz parte do cadastro e é copiada para a
linha do mês. O cadastro aqui é do compartimento; o que pertence ao mês é o
status, que fica na linha `originEntries` (seção 6.7) e é por onde a aba
Pagamento acompanha o que já foi pago.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | com trim |
| `icon` | `OriginIconKey` | chave do catálogo em [`types.ts`](../src/types.ts): `pix`, `transfer`, `card`, `cash`, `investment`, `autodebit`, `boleto` |
| `color` | `OriginColorKey` | tom do glifo: `gold`, `silver`, `graphite`, `copper`, `violet`, `teal`, `terracota` |
| `isDefault` | boolean | só uma por compartimento; é a pré-selecionada no novo gasto |
| `sortOrder` | number | posição nos chips e na lista; ausente usa `createdAt` |
| `active` | boolean | `false` some do seletor e dos filtros |
| `createdAt` | number | ms |

A chave de ícone é gravada, não o desenho: trocar o glifo do lucide-react em
[`components/OriginIcon.tsx`](../src/components/OriginIcon.tsx) não exige migrar
dado. Compartimento nasce sem origem nenhuma; a primeira criada vira a padrão.
Origem criada com o mês em aberto já ganha a linha do mês; remover é desativar,
e os lançamentos antigos seguem com `originName`.

> **Coleção nova exige regra nova.** O Firestore nega tudo que não está
> explicitamente liberado, e as regras vivem em `cash-organizer-functions`. Sem
> o bloco `match /origins/{originId}`, o app não lista nem grava origem, e a
> falha chega como `permission-denied`. O mesmo vale para campo novo em coleção
> existente: a edição de valor e descrição no histórico só funciona porque
> `expenses` passou a permitir `update` desses dois campos, e a origem do gasto
> fixo depende de `originId` e `originName` estarem liberados na escrita de
> `fixedExpenses` e de `fixedEntries`.
>
> Duas liberações a mais chegaram com a aba Pagamento por origem e com a edição
> completa do lançamento:
>
> - `match /months/{ym}/originEntries/{originId}`, a subcoleção nova de linha de
>   mês. Sem ela a aba Pagamento não lista nem grava status de origem;
> - `createdAt` e `week` no `update` de `expenses`, que antes eram recusados. Sem
>   isso a edição do lançamento funciona em tudo, menos quando a data muda.

## 6.6 `months/{YYYY-MM}`

| Campo | Tipo | Notas |
|---|---|---|
| `status` | `'open'` ou `'closed'` | só o mês corrente do compartimento fica aberto |
| `closedAt` | number | gravado ao virar o mês |
| `totals` | `MonthTotals` | snapshot gravado ao fechar, usado nas estatísticas |

`MonthTotals`:

```ts
{
  fixedIdeal: number;
  fixedActual: number;
  varIdeal: number;
  varActual: number;
  byCategory: Record<categoryId, { name, ideal, actual, ignored? }>;
}
```

Gravar os totais no fechamento evita reler todos os lançamentos de todos os meses
para montar o comparativo. Meses fechados leem `totals`; o mês visualizado é
recalculado ao vivo por `computeTotals`.

## 6.7 Linhas do mês

### `fixedEntries/{fixedExpenseId}`

Snapshot do cadastro no mês, para que editar o cadastro depois não reescreva o
passado.

| Campo | Tipo | Notas |
|---|---|---|
| `name`, `description` | string | copiados do cadastro |
| `amount` | number | valor efetivo do mês, editável na aba Pagamento |
| `idealAmount` | number | ideal do mês, editável |
| `status` | `EntryStatus` | nasce `Pendente` |
| `originId` | string ou null | copiado do cadastro; `null` quando o gasto não tem origem |
| `originName` | string | denormalizado, como estava no cadastro na hora da cópia |
| `installmentCurrent`, `installmentTotal` | number ou null | copiados do cadastro |

Linha criada antes de um campo existir fica sem ele. Foi o caso da origem nos
meses que já estavam abertos quando o gasto fixo ganhou origem: essas linhas
caíam em "Sem origem" na aba Pagamento. Por isso o `syncMonthEntries` completa
a linha de fixo que não tem a chave `originId`, uma vez, com o que está no
cadastro. Fora esse preenchimento, ele só cria linha que falta e nunca reescreve
valor ou status, que são do mês e não do cadastro.

### `categoryEntries/{categoryId}`

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | copiado do cadastro |
| `idealAmount` | number | ideal do mês para a categoria |
| `status` | `EntryStatus` | nasce `Pendente` |

O gasto real da categoria não fica aqui: é a soma dos lançamentos. A linha de
categoria não tem status na interface desde que a aba Pagamento passou a
trabalhar por origem: ela existe pelo ideal, que alimenta `varIdeal`.

### `originEntries/{originId}`

Status de pagamento da origem no mês. É a linha que a aba Pagamento resolve
primeiro: marcar "Cartão C6" como pago é dizer que tudo que saiu dele naquele
mês está pago.

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | copiado do cadastro (o nome exibido vem do cadastro quando ele ainda existe) |
| `status` | `EntryStatus` | nasce `Pendente` |

Não tem valor próprio: o valor da linha é calculado na tela, somando os
lançamentos variáveis daquela origem e os gastos fixos que saem dela.

### `expenses/{autoId}` (lançamento variável)

| Campo | Tipo | Notas |
|---|---|---|
| `categoryId` | string | id da categoria |
| `categoryName` | string | denormalizado, mantém o histórico legível se a categoria for renomeada ou removida |
| `amount` | number | centavos |
| `description` | string | com trim, pode ser `''` |
| `createdAt` | number | ms da data escolhida (com a hora do relógio, para manter a ordem de inclusão do mesmo dia) |
| `week` | number | 1 a 4, calculado por `weekOfMonth` sobre a data do lançamento |
| `originId` | string ou null | id da origem escolhida; `null` quando não havia origem cadastrada |
| `originName` | string | denormalizado, mantém o histórico legível se a origem for renomeada ou removida |

O modal de edição do histórico grava tudo de uma vez: `amount`, `description`,
`categoryId`, `categoryName`, `originId`, `originName` e, quando a data muda,
`createdAt` e `week` (a semana é sempre derivada da data). A reclassificação em
lote continua tocando só a classificação. `createdAt` só é reescrito quando a
data muda de dia, e leva a hora original junto, para os lançamentos do mesmo dia
manterem a ordem de inclusão.

O documento nunca muda de mês. Ao lançar (ou editar) com data de outro mês,
`createdAt` e `week` seguem a data escolhida, mas o lançamento continua no mês em
que foi feito: o mês do app é a referência da fatura, não o calendário.

## 6.8 Status de linha (`ENTRY_STATUSES`)

Ordem e significado, definidos em [`src/types.ts`](../src/types.ts):

| Valor | Significado | Efeito na soma do mês |
|---|---|---|
| `Pendente` | ainda não resolvido | conta; **bloqueia a virada do mês** quando está em origem ou em gasto fixo |
| `Parcialmente pago` | pago em parte | conta |
| `Agendado/Automático` | débito programado | conta |
| `Pago` | quitado | conta |
| `Sem gasto` | não houve gasto no mês | conta (normalmente com valor zero) |
| `Não disponível ainda` | a fatura ainda não fechou | conta |
| `Ignorar` | deve ficar fora do custo somado | **não conta** no gasto; o ideal continua contando |

Onde cada status vale:

| Linha | Quem edita | O que o status faz |
|---|---|---|
| `originEntries` | aba Pagamento, card de cima | acompanha o pagamento da origem; `Pendente` segura a virada; `Ignorar` tira do gasto do mês tudo que saiu dela |
| `fixedEntries` | aba Pagamento, card de baixo (e pela origem, em cascata) | acompanha o pagamento do gasto fixo; `Pendente` segura a virada; `Ignorar` tira o valor da linha do gasto |
| `categoryEntries` | ninguém, desde que a aba Pagamento passou a trabalhar por origem | a linha existe pelo ideal; `Ignorar` marcado em meses antigos continua valendo no cálculo |

`IGNORED_STATUS` exporta a constante `'Ignorar'`. Use a constante nos cálculos em
vez da string solta. `STATUS_CLASS`, o mapa de status para classe de cor, também
fica em `types.ts` (a aba Pagamento e o histórico do mês leem os dois de lá).

Ao adicionar um status novo: inclua em `ENTRY_STATUSES`, adicione a entrada em
`STATUS_CLASS` (ambos em `types.ts`), crie a classe `.st-*` no `styles.css`,
decida o efeito em `computeTotals` e atualize esta tabela.

## 6.9 Ciclo de vida do mês

| Função | Quando roda | O que faz |
|---|---|---|
| `ensureMonth` | login, restauração de sessão e após virar o mês | cria o mês com as linhas dos cadastros ativos; se o mês já existe e está aberto, reconcilia |
| `seedMonthEntries` | dentro de `ensureMonth` e `setOpenMonth` | popula `fixedEntries`, `categoryEntries` e `originEntries` a partir dos cadastros ativos, tudo com status `Pendente` |
| `syncMonthEntries` | dentro de `ensureMonth` quando o mês já existe aberto | remove linhas de cadastros desativados (categoria e origem só saem se não tiverem gasto no mês), cria linhas de cadastros que ainda não estão no mês e completa a linha de fixo que ainda não tem o campo de origem |
| `computeTotals` | a cada render das telas com dados do mês | soma ideais e gastos, deixando de fora o que está em `Ignorar`: a linha de gasto fixo, a categoria (em meses antigos) e tudo que saiu de uma origem ignorada |
| `closeMonth` | botão "Virar mês" | recusa se houver `Pendente` em origem ou em gasto fixo, grava `totals` e `closedAt`, marca `closed`, avança `currentMonth`, avança parcelas e garante o mês seguinte |
| `advanceInstallments` | dentro de `closeMonth` | incrementa `installmentCurrent`; quem estava na última parcela é desativado |
| `setOpenMonth` | ação "Mover o mês atual para..." | move o conteúdo do mês em aberto (linhas de fixos, de categorias e de origens, mais os lançamentos, todos com o mesmo id) para o mês escolhido, esvazia o mês de partida, troca o `currentMonth` e reconcilia o destino com os cadastros. Com `replaceTarget`, apaga antes o que já existia no destino |

### Mover o mês de referência

`setOpenMonth(compartmentId, fromYm, toYm, replaceTarget)` grava em três fases,
cada uma em lotes de até 400 operações: prepara o destino (apaga o conteúdo
antigo quando pedido e grava `{ status: 'open' }`, o que limpa `closedAt` e
`totals` de um mês que já foi fechado), copia o conteúdo da origem e só então
apaga a origem. A ordem é proposital: se a rede cair no meio, o pior caso é o
conteúdo aparecer nos dois meses, e nada se perde.

Os cadastros (`fixedExpenses`, `categories` e `origins`) pertencem ao
compartimento, não ao mês, então não são copiados: já valem para qualquer mês. O
que viaja é a linha de mês de cada um, com o status como estava.
O `syncMonthEntries` do fim completa o destino com cadastro ativo que ainda não
tinha linha.

O documento do mês de origem permanece, vazio: as regras não permitem apagar
`months`, e um mês sem `totals` não aparece no comparativo mensal.

## 6.10 Escritas em lote

Operações que precisam ser atômicas usam `writeBatch`: criação do compartimento
com a categoria padrão, seed do mês, reordenação de categorias e de origens
(troca de `sortOrder` entre duas), troca da padrão, fechamento do mês,
reinicialização de mês, reclassificação em lote de lançamentos e
`setOriginStatus`, que grava o status da origem junto com o dos gastos fixos
dela.

## 6.11 Índices e consultas

O cadastro de origens é lido inteiro por `onSnapshot` (`useConfig`), sem filtro
composto: o volume é de poucas dezenas de documentos.

As consultas são simples de propósito. As únicas com filtro são as de
desativação: `removeCategory` (`where('categoryId', '==', id)` mais `limit(1)`
dentro de `expenses`) e `removeOrigin` (o mesmo com `originId`, em `expenses` e
em `fixedEntries`, para saber se a linha do mês ainda tem uso). O Firestore
atende as três com índice de campo único.

## 6.12 Armazenamento local

| Chave | Conteúdo |
|---|---|
| `cash-organizer.session` | JSON com `compartmentId`, `name` e a senha cifrada em AES-GCM |
| `cash-organizer.device-key` | chave AES-GCM de 256 bits do dispositivo, em JWK |
| IndexedDB do Firestore | cache offline gerenciado pelo SDK, não mexer |

A sessão restaurada é sempre revalidada contra o Firestore antes de liberar o
app. Falha de decifragem, senha trocada ou compartimento inexistente limpam a
sessão.
