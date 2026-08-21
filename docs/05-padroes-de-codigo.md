# 5. Padrões de código e nomenclatura

## 5.1 Idiomas

| Onde | Idioma |
|---|---|
| Texto visível ao usuário | português do Brasil, direto no JSX |
| Comentários e documentação | português do Brasil |
| Identificadores de código (variáveis, funções, tipos, props) | inglês |
| Nomes de campos no Firestore | inglês (`idealAmount`, `installmentTotal`) |
| Valores de status gravados | português, exatamente como em `ENTRY_STATUSES` |

Não existe camada de i18n e não se deve criar uma. Escreva a string em português
onde ela é usada.

## 5.2 Nomes de arquivos

| Tipo | Convenção | Exemplo |
|---|---|---|
| Componente de tela | PascalCase terminando em `Screen` | `AddExpenseScreen.tsx` |
| Outros componentes | PascalCase | `MonthlyComparisonCard.tsx` |
| Componentes genéricos | um arquivo único | `shared.tsx` |
| Hook | camelCase começando com `use` | `useMonthData.ts` |
| Serviço | camelCase no plural do domínio | `expenses.ts`, `months.ts` |
| Utilitário | camelCase do assunto | `dates.ts`, `money.ts` |
| Tipos de domínio | um arquivo único | `types.ts` |

Um componente exportado por arquivo, com o mesmo nome do arquivo. Exceção
aceita: um componente auxiliar privado no mesmo arquivo, como `FixedExpenseModal`
dentro de `ManageScreen.tsx` e `StatusSelect` dentro de `MonthScreen.tsx`.

## 5.3 Nomes de funções

Verbos com significado fixo nos serviços:

| Prefixo | Significa |
|---|---|
| `add` | cria um documento novo |
| `save` | grava o conjunto completo de campos (cadastro mais reflexo no mês) |
| `update` | grava um patch parcial |
| `remove` | desativa no cadastro e limpa a linha do mês quando cabe |
| `delete` | apaga o documento de verdade (só lançamentos) |
| `fetch` | leitura pontual de um item ou lista |
| `list` | leitura pontual de uma coleção |
| `ensure` | cria se não existir e reconcilia se existir |
| `set` | define um estado específico (`setOpenMonth`, `setDefaultCategory`) |
| `compute` | função pura de cálculo |

Argumentos seguem sempre a ordem `compartmentId, ym (ou currentMonth), id,
dados`. Mantenha essa ordem ao criar função nova.

## 5.4 Padrões de componente React

- Function component exportado com `export function Nome(props: { ... })`. O tipo
  das props é escrito inline; não usamos `React.FC` nem `interface Props`
  separada, salvo quando o tipo é reaproveitado.
- Desestruture as props no corpo quando forem muitas
  (`const { compartmentId, currentMonth } = props;`).
- Ordem dentro do componente: props, `useState`, refs, derivados simples,
  `useMemo`, funções de ação (`submit`, `save`, `remove`), `return`.
- Ações assíncronas seguem o padrão `busy`:

```tsx
const submit = async (e: FormEvent) => {
  e.preventDefault();
  if (!valido || busy) return;
  setBusy(true);
  try {
    await servico(...);
  } finally {
    setBusy(false);
  }
};
```

- Confirmação destrutiva usa `ConfirmModal` com estado de alvo
  (`removeTarget`), nunca `window.confirm`.
- Feedback de sucesso usa `flash` com `setTimeout` de 2500 ms.
- Classe condicional com template string:
  `` className={`btn icon date-btn${isToday ? '' : ' custom'}`} ``.
- Nada de `useEffect` para buscar dados que já vêm dos hooks. `useEffect` só
  aparece para assinaturas e para leituras pontuais com flag `cancelled`:

```tsx
useEffect(() => {
  let cancelled = false;
  listMonths(compartmentId).then((m) => {
    if (!cancelled) setMonths(m);
  });
  return () => {
    cancelled = true;
  };
}, [compartmentId]);
```

## 5.5 TypeScript

- `import type` obrigatório para import só de tipo (`verbatimModuleSyntax`).
- `satisfies` para payloads do Firestore, que valida o formato sem perder o
  literal: `} satisfies Omit<FixedEntry, 'id'>);`.
- Uniões de string literal para enums de domínio, derivadas de um array `as
  const` (`ENTRY_STATUSES` gera `EntryStatus`).
- Resultado de operação que pode falhar de formas diferentes usa união
  discriminada, como `OpenResult` (`{ kind: 'ok' | 'not-found' | 'wrong-password' }`),
  em vez de exceção.
- Nada de `any`. Para dado cru do Firestore, o padrão é
  `{ id: d.id, ...(d.data() as Omit<Tipo, 'id'>) }`.
- `noUnusedLocals` está ligado: remova import que sobrou de uma refatoração.

## 5.6 CSS

- Uma classe semântica por elemento, em kebab-case, descrevendo o papel
  (`.date-status`, `.section-totals`, `.row-ignored`), nunca a aparência
  (`.text-orange`).
- Variantes são classes adicionais curtas aplicadas junto à base
  (`.btn.primary`, `.chip.selected`, `.badge.ignored`).
- Estilo inline só para valor calculado em tempo de execução, como a largura da
  barra de progresso.
- Regras novas entram na seção correspondente do `styles.css`, sob o comentário
  de cabeçalho daquela área.
- Comente a regra que não é óbvia, principalmente truques de flexbox e de tabela
  responsiva (o arquivo já tem vários exemplos, como o `min-width: 0` que evita
  rolagem horizontal).

## 5.7 Comentários

O padrão da casa é explicar a decisão e o defeito que ela evita, não narrar o
código:

```ts
// "Limpar" no seletor do celular devolve valor vazio: volta para hoje e
// reescreve o campo, já que o estado pode não mudar (e aí não haveria
// re-render para corrigi-lo).
```

Funções exportadas de serviço ganham JSDoc curto quando o efeito não é óbvio
pelo nome (por exemplo, que `removeCategory` mantém a linha do mês se já houver
lançamentos). Comentário que apenas repete o nome da função não deve existir.

## 5.8 Commits

Mensagens em português, no imperativo ou descritivas, com prefixo do tipo:

```
feat: data personalizada no novo gasto e correção da lista no mobile
fix: data do gasto livre e indicação explícita de data personalizada
docs: documentação do projeto e regras para IA
```

Corpo opcional em tópicos com hífen, explicando o porquê. Sem travessão e sem
seta, conforme [00-regras-para-ia.md](00-regras-para-ia.md). Trabalhe sempre em
branch própria: nunca faça commit direto na `main`.
