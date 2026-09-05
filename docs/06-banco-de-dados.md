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
| `installmentCurrent` | number ou null | parcela atual, começa em 1 |
| `installmentTotal` | number ou null | total de parcelas; `null` significa gasto sem parcelamento |
| `active` | boolean | `false` some dos próximos meses |
| `createdAt` | number | ms |

`normalizeFixedInput` em `services/expenses.ts` é quem garante o formato: faz
trim, aplica o `amount` como ideal quando falta, e zera as parcelas para `null`
quando não há `installmentTotal`.

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

A origem é o segundo eixo de classificação do lançamento variável, ao lado da
categoria: diz de onde o dinheiro saiu ("Cartão C6 (Crédito)", "Pix ou Transf.",
"Cartão Nu"). Não gera linha de mês e não entra em `computeTotals`.

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
Remover é desativar, e os lançamentos antigos seguem com `originName`.

> **Coleção nova exige regra nova.** O Firestore nega tudo que não está
> explicitamente liberado, e as regras vivem em `cash-organizer-functions`. Sem
> o bloco `match /origins/{originId}`, o app não lista nem grava origem, e a
> falha chega como `permission-denied`. O mesmo vale para operação nova em
> coleção existente: a edição de valor e descrição no histórico só funciona
> porque `expenses` passou a permitir `update` desses dois campos.

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
| `installmentCurrent`, `installmentTotal` | number ou null | copiados do cadastro |

### `categoryEntries/{categoryId}`

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | copiado do cadastro |
| `idealAmount` | number | ideal do mês para a categoria |
| `status` | `EntryStatus` | nasce `Pendente` |

O gasto real da categoria não fica aqui: é a soma dos lançamentos.

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

Ao lançar em data passada, `createdAt` e `week` seguem a data escolhida, mas o
lançamento continua no mês em aberto: o mês do app é a referência da fatura, não
o calendário.

## 6.8 Status de linha (`ENTRY_STATUSES`)

Ordem e significado, definidos em [`src/types.ts`](../src/types.ts):

| Valor | Significado | Efeito na soma do mês |
|---|---|---|
| `Pendente` | ainda não resolvido | conta; **bloqueia a virada do mês** |
| `Parcialmente pago` | pago em parte | conta |
| `Agendado/Automático` | débito programado | conta |
| `Pago` | quitado | conta |
| `Sem gasto` | não houve gasto no mês | conta (normalmente com valor zero) |
| `Não disponível ainda` | a fatura ainda não fechou | conta |
| `Ignorar` | deve ficar fora do custo somado | **não conta** no gasto; o ideal continua contando |

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
| `seedMonthEntries` | dentro de `ensureMonth` e `setOpenMonth` | popula `fixedEntries` e `categoryEntries` a partir dos cadastros ativos, tudo com status `Pendente` |
| `syncMonthEntries` | dentro de `ensureMonth` quando o mês já existe aberto | remove linhas de cadastros desativados (categoria só sai se não tiver lançamento) e cria linhas de cadastros que ainda não estão no mês |
| `computeTotals` | a cada render das telas com dados do mês | soma ideais e gastos, ignorando linhas com status `Ignorar` no gasto |
| `closeMonth` | botão "Virar mês" | recusa se houver `Pendente`, grava `totals` e `closedAt`, marca `closed`, avança `currentMonth`, avança parcelas e garante o mês seguinte |
| `advanceInstallments` | dentro de `closeMonth` | incrementa `installmentCurrent`; quem estava na última parcela é desativado |
| `setOpenMonth` | ação "Definir como mês em aberto" | sem reinicializar, garante o mês e troca o `currentMonth`. Com reinicialização, apaga linhas e lançamentos e recria a partir dos cadastros |

## 6.10 Escritas em lote

Operações que precisam ser atômicas usam `writeBatch`: criação do compartimento
com a categoria padrão, seed do mês, reordenação de categorias (troca de
`sortOrder` entre duas), troca da categoria padrão, fechamento do mês e
reinicialização de mês.

## 6.11 Índices e consultas

O cadastro de origens é lido inteiro por `onSnapshot` (`useConfig`), sem filtro
composto: o volume é de poucas dezenas de documentos.

As consultas são simples de propósito. A única com filtro composto é a de
`removeCategory` (`where('categoryId', '==', id)` mais `limit(1)` dentro de
`expenses`), que o Firestore atende com índice de campo único. `listMonths` lê
todos os meses e ordena no cliente, porque `orderBy('__name__', 'desc')` não é
suportado em key scan descendente e o volume é pequeno.

## 6.12 Armazenamento local

| Chave | Conteúdo |
|---|---|
| `cash-organizer.session` | JSON com `compartmentId`, `name` e a senha cifrada em AES-GCM |
| `cash-organizer.device-key` | chave AES-GCM de 256 bits do dispositivo, em JWK |
| IndexedDB do Firestore | cache offline gerenciado pelo SDK, não mexer |

A sessão restaurada é sempre revalidada contra o Firestore antes de liberar o
app. Falha de decifragem, senha trocada ou compartimento inexistente limpam a
sessão.
