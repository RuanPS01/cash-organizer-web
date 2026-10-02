# 10. Manutenção e granularidade

## 10.1 Tamanho atual dos arquivos

Referência de outubro de 2026, depois do planejamento em curso (linhas):

| Arquivo | Linhas |
|---|---|
| `styles.css` | 2907 |
| `services/months.ts` | 696 |
| `components/MonthScreen.tsx` | 694 |
| `components/ExpenseHistory.tsx` | 679 |
| `components/ManageScreen.tsx` | 555 |
| `components/PlanView.tsx` | 552 |
| `services/expenses.ts` | 473 |
| `components/PlanForm.tsx` | 422 |
| `types.ts` | 401 |
| `utils/projection.ts` | 398 |
| `components/ManageOrigins.tsx` | 320 |
| `components/AddStatsCard.tsx` | 315 |
| `components/shared.tsx` | 281 |
| `components/AddExpenseScreen.tsx` | 269 |
| `components/PlanningScreen.tsx` | 266 |
| `services/plans.ts` | 242 |
| `components/PlanChart.tsx` | 206 |
| `App.tsx` | 193 |
| `services/origins.ts` | 183 |
| `components/ExpenseEditModal.tsx` | 161 |
| `hooks/useMonthData.ts` | 159 |
| `components/StatsView.tsx` | 154 |
| demais | menos de 125 cada |

O projeto inteiro tem cerca de 11,5 mil linhas, das quais perto de 3,5 mil
vieram com o Planejamento.

`MonthScreen` e `services/months.ts` passaram de 650 linhas com o planejamento
em curso. Os dois blocos novos deles são pequenos e presos ao arquivo (o modal
de pagamento parcial usa o estado da tabela; o registro do mês no plano roda
dentro de `closeMonth`), mas são os primeiros candidatos a sair para arquivo
próprio se crescerem: o `PartialModal` ao lado do `ExpenseEditModal`, e a parte
de planejamento de `months.ts` em um módulo de serviço próprio, tomando cuidado
com o import circular entre `months.ts`, `expenses.ts` e `plans.ts`. Esse tamanho é uma vantagem: dá para
ler o app todo em uma sessão. Toda alteração deve pesar contra isso.

## 10.2 Quando criar um arquivo novo

| Situação | Decisão |
|---|---|
| Bloco visual usado em duas telas ou mais | componente em `components/shared.tsx` se for genérico, ou arquivo próprio se tiver domínio (como o `MonthSummaryCard`) |
| Bloco visual usado em uma tela só | função ou componente auxiliar no mesmo arquivo da tela |
| Tela nova | arquivo `NomeScreen.tsx` mais entrada em `View` e na navbar do `App.tsx` |
| Nova operação de banco | função no serviço existente do domínio; arquivo novo só se for um domínio novo |
| Cálculo puro sobre valores ou datas | função em `utils/` |
| Assinatura em tempo real nova | hook em `hooks/useMonthData.ts` |

Não crie pasta nova (`features/`, `containers/`, `contexts/`) sem uma razão que
sobreviva à leitura do [01-arquitetura.md](01-arquitetura.md). A estrutura atual
é rasa de propósito.

Sinais de que um arquivo deveria ser dividido: mais de uma tela usando um
componente auxiliar privado, ou uma tela passando de 500 linhas com blocos
independentes. Foi o que tirou o `ExpenseEditModal` de dentro do
`ExpenseHistory`: o modal é um bloco fechado, com estado e validação próprios, e
o histórico já passava das 650 linhas sem ele. Pelo mesmo motivo o
`AddStatsCard` saiu do `AddExpenseScreen` quando o card ganhou abas: o card tem
estado próprio (aba, virada de semana) e o formulário de novo gasto voltou a
caber em pouco mais de 250 linhas.

O Planejamento nasceu dividido pelo mesmo critério: a tela (`PlanningScreen`)
só lista e navega, cada subpágina tem arquivo próprio (`PlanForm` e
`PlanView`), o gráfico é um bloco fechado com estado próprio (`PlanChart`), e o
que duas subpáginas usam (`PlanSummary`) ou três listas de gasto fixo usam
(`PlanBadge`) também. A conta é pura e mora em `utils/projection.ts`, fora de
qualquer componente, para a prévia do formulário, a visualização, a lista e o
serviço que atualiza o gasto fixo usarem exatamente o mesmo número.

## 10.3 Evitar duplicata

Antes de escrever, procure:

```bash
grep -rn "nome-provavel" src/
```

Erros já cometidos aqui que valem lembrar:

- reimplementar formatação de moeda em vez de usar `formatBRL`;
- renderizar um modal dentro de um `.card`: o `clip-path` do card recorta até
  descendente `position: fixed`, e o modal aparece cortado. O modal vai como
  irmão do card;
- criar coleção nova no Firestore sem abrir a regra correspondente em
  `cash-organizer-functions`: o banco nega por padrão e a tela falha calada;
- escrever um `try/finally` sem `catch` em volta de uma gravação: o estado
  `busy` volta ao normal e o usuário não recebe aviso nenhum. Toda ação de
  escrita mostra o erro com `writeErrorMessage`;
- somar totais na mão em uma tela em vez de usar `computeTotals` (foi exatamente
  o que deixou a aba Adicionar somando linhas ignoradas);
- criar um segundo componente de valor editável em vez de usar `EditableMoney`;
- montar query do Firestore dentro de um componente em vez de chamar um serviço.

## 10.4 Comentários

Comente o porquê, não o quê. Um comentário bom descreve a decisão e o defeito que
ela evita:

```ts
// min-width: 0 nas células que contêm texto: sem isso a largura mínima
// automática do item flex (min-content) faz a célula crescer além da linha e a
// tabela ganha rolagem horizontal.
```

Comentário ruim:

```ts
// Define o estado de data como hoje
setDate(today);
```

Funções de serviço com efeito não óbvio levam JSDoc curto. Regras de CSS com
truque levam comentário na seção.

## 10.5 Receitas de tarefas comuns

### Adicionar um campo ao gasto fixo

1. Campo em `FixedExpense` e, se aparecer no mês, em `FixedEntry`
   ([`types.ts`](../src/types.ts)).
2. `FixedExpenseInput` e `normalizeFixedInput` em `services/expenses.ts`, com
   `null` para vazio (nunca `undefined`).
3. Propagar em `addFixedExpense` e `saveFixedExpense`, e nos seeds de
   `services/months.ts` (`seedMonthEntries` e `syncMonthEntries`) se o campo
   entrar na linha do mês.
4. Campo no `FixedExpenseModal` do `ManageScreen`.
5. Exibição nas listagens, se fizer sentido: lista da tela Gerenciar, tabela da
   aba Pagamento e subaba Fixos do `ExpenseHistory`. Foi assim que a origem do
   gasto fixo entrou, e o `saveFixedExpense` grava o cadastro inteiro: campo
   esquecido em uma chamada é campo apagado no banco (ver o `inlineSaveFixed`
   do `ManageScreen`, que repassa tudo antes do patch).
6. Atualizar [06-banco-de-dados.md](06-banco-de-dados.md).

### Adicionar uma origem ao catálogo de ícones

1. Nova chave em `ORIGIN_ICONS` ([`types.ts`](../src/types.ts)); a chave é o que
   fica gravado no Firestore.
2. Desenho do lucide-react em `ORIGIN_GLYPHS` e rótulo em `ORIGIN_ICON_LABELS`
   ([`components/OriginIcon.tsx`](../src/components/OriginIcon.tsx)).
3. Nada mais: a grade do modal e os filtros leem do catálogo. Tom novo segue o
   mesmo caminho por `ORIGIN_COLORS` mais a classe `.oc-*` no `styles.css`.
4. Atualizar [06-banco-de-dados.md](06-banco-de-dados.md).

### Adicionar um status de linha

1. Incluir em `ENTRY_STATUSES` ([`types.ts`](../src/types.ts)), escolhendo a
   posição na lista do select.
2. Entrada no mapa `STATUS_CLASS`, logo abaixo, no mesmo arquivo.
3. Classe `.st-*` no `styles.css`.
4. Decidir o efeito em `computeTotals` e no bloqueio da virada de mês.
5. Atualizar a tabela de status em [06-banco-de-dados.md](06-banco-de-dados.md).

### Adicionar uma tela

1. `components/NomeScreen.tsx` recebendo o que precisa por props.
2. Novo valor no tipo `View` do `App.tsx`, o bloco de render e o botão na navbar
   com ícone do lucide-react.
3. Conferir a navbar nos dois modos (embaixo no celular, no topo a partir de
   720px). Com o Planejamento ela já tem cinco abas e um separador, no limite
   em 320px e em 720px (ver
   [08-responsividade-mobile.md](08-responsividade-mobile.md), seção 8.2): uma
   sexta aba pede repensar a navegação, e não só encolher a fonte de novo.
4. Atualizar [04-componentes-e-telas.md](04-componentes-e-telas.md) e
   [01-arquitetura.md](01-arquitetura.md).

### Mudar um cálculo de total

Mexa em `computeTotals` ([`services/months.ts`](../src/services/months.ts)) e
lembre que ele alimenta quatro lugares: os totais da aba Pagamento, o informe da
aba Adicionar, o comparativo mensal e os totais gravados no fechamento do mês.
Meses já fechados guardam o resultado antigo em `month.totals` e não são
recalculados.

## 10.6 Verificação antes de entregar

1. `npm run typecheck` (obrigatório) e `npm run build` quando mexer em build,
   dependência ou PWA.
2. Conferência visual nas duas larguras (360px e desktop). O tema é único e
   escuro, então não existe segunda conferência de tema.
3. Sem travessão e sem seta no que foi escrito:
   `LC_ALL=C.UTF-8 grep -rnP "[\x{2014}\x{2013}\x{2192}\x{2190}]" <arquivos>`.
4. Documentos desta pasta atualizados.

Não existe suíte de testes automatizados. Se precisar validar comportamento sem
credenciais do Firebase, há dois caminhos já usados:

- **Emulador do Firestore** (o mais fiel, usado no Planejamento): suba o
  emulador com as regras do `cash-organizer-functions`
  (`npx firebase-tools emulators:start --only firestore --project demo-cash`,
  que pede Java), crie um `.env.local` com `VITE_FIREBASE_PROJECT_ID=demo-cash`,
  valores quaisquer nas outras `VITE_FIREBASE_*` e
  `VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, e rode `npm run dev`. O app
  funciona de ponta a ponta, e as regras novas são exercitadas de verdade. O
  `.env.local` já é ignorado pelo git, mas apague-o ao terminar;
- **Harness com stub**: subir um harness temporário do Vite com um stub de
  `firebase/firestore` e renderizar os componentes com dados fabricados. Se
  fizer isso, apague o harness antes de commitar.
