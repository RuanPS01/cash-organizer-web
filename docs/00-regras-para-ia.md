# 0. Regras para IA

> **Leia este documento antes de qualquer alteração no projeto.** Ele vale para
> qualquer agente de IA (Claude Code, Copilot, Cursor, ChatGPT ou outro) e tem
> precedência sobre preferências próprias do modelo.

Este é o app **Cash Organizer Web**: Vite + React + TypeScript falando direto com
o Firestore, sem backend próprio. Não existe Tailwind, não existe shadcn/ui, não
existe camada de i18n. As convenções abaixo são as deste repositório e não devem
ser substituídas por padrões de outros projetos.

## 0.1 As três regras obrigatórias

### Regra 1: consultar a documentação ANTES de implementar

Antes de escrever a primeira linha, leia os documentos desta pasta que tocam o
que você vai mexer:

| Vou mexer em... | Leia antes |
|---|---|
| Qualquer coisa | [09-contexto-do-produto.md](09-contexto-do-produto.md) |
| Estrutura de pastas, camadas, boot, sessão | [01-arquitetura.md](01-arquitetura.md) |
| Dependências, versões, build, deploy, PWA | [02-tecnologias.md](02-tecnologias.md) |
| Cores, tipografia, espaçamento, tema, CSS | [03-identidade-visual.md](03-identidade-visual.md) |
| Telas e componentes existentes | [04-componentes-e-telas.md](04-componentes-e-telas.md) |
| Nomes de arquivos, funções, tipos, classes CSS | [05-padroes-de-codigo.md](05-padroes-de-codigo.md) |
| Coleções, campos, status, totais, persistência | [06-banco-de-dados.md](06-banco-de-dados.md) |
| Login, novo gasto, pagamento, virada de mês | [07-fluxos-aplicacao.md](07-fluxos-aplicacao.md) |
| Layout, largura, tabela, qualquer coisa visual | [08-responsividade-mobile.md](08-responsividade-mobile.md) |
| Criar arquivo, componente, hook ou serviço novo | [10-manutencao-e-granularidade.md](10-manutencao-e-granularidade.md) |

Consultar não é opcional: quase toda necessidade de "componente novo" já tem um
componente pronto em [`src/components/shared.tsx`](../src/components/shared.tsx),
documentado em [04-componentes-e-telas.md](04-componentes-e-telas.md). Criar
duplicata é o defeito mais comum de agentes neste repositório.

### Regra 2: atualizar a documentação DEPOIS de implementar

Se a alteração mudou qualquer informação registrada aqui, atualize o documento
correspondente **no mesmo trabalho**, não depois. Casos que sempre exigem
atualização:

- criou, renomeou ou removeu uma tela, um componente reutilizável ou um hook
  (atualize [04-componentes-e-telas.md](04-componentes-e-telas.md));
- criou ou mudou uma função de serviço em `src/services/`
  (atualize [01-arquitetura.md](01-arquitetura.md) e [04-componentes-e-telas.md](04-componentes-e-telas.md));
- criou ou mudou uma coleção, um campo persistido ou um valor de `ENTRY_STATUSES`
  (atualize [06-banco-de-dados.md](06-banco-de-dados.md));
- mudou token de cor, raio, sombra ou classe utilitária do `styles.css`
  (atualize [03-identidade-visual.md](03-identidade-visual.md));
- criou um padrão de layout responsivo reaproveitável ou mexeu em breakpoint
  (atualize [08-responsividade-mobile.md](08-responsividade-mobile.md));
- adicionou ou removeu dependência, script ou variável de ambiente
  (atualize [02-tecnologias.md](02-tecnologias.md));
- mudou um fluxo de uso, como a virada de mês ou o significado de um status
  (atualize [07-fluxos-aplicacao.md](07-fluxos-aplicacao.md) e [09-contexto-do-produto.md](09-contexto-do-produto.md)).

Documentação que descreve algo que não existe mais é pior que documentação
ausente: ela faz o próximo agente implementar contra uma realidade falsa. Se
encontrar uma informação defasada enquanto trabalha, corrija na hora, mesmo que
não seja o assunto da sua tarefa.

### Regra 3: nunca usar travessão nem caractere de seta

**Proibido** em qualquer texto gerado: rótulo de botão, título, placeholder,
mensagem de erro, texto de modal, comentário de código, mensagem de commit,
texto de documentação, descrição de PR.

| Proibido | Caractere | Use no lugar |
|---|---|---|
| Travessão | `—` (em dash) | dois pontos, vírgula, parênteses ou ponto |
| Meia-risca | `–` (en dash) | "a" e "até" em faixas, ou hífen simples `-` |
| Seta para a direita | `→` | "para", "leva a", "vira", "resulta em" |
| Seta para a esquerda | `←` | "vem de", "a partir de" |
| Outras setas | `⟶` `⇒` `↔` `⬅` `➜` | palavras equivalentes |

Exemplos de reescrita com trechos reais deste projeto:

```
Ruim:  // Reflete no mês corrente — só quando ele está aberto.
Bom:   // Reflete no mês corrente, apenas quando ele está aberto.

Ruim:  setFlash(`${formatBRL(cents)} adicionado — categoria ${nome}`)
Bom:   setFlash(`${formatBRL(cents)} adicionado em "${nome}"`)

Ruim:  main.tsx → App.tsx → Shell → telas
Bom:   main.tsx monta App.tsx, que monta o Shell e as telas

Ruim:  "Virar mês → fecha e abre o próximo"
Bom:   "Virar mês fecha o atual e abre o próximo"
```

O hífen simples (`-`) é permitido, e o mesmo vale para o caractere de reticências
(`…`), que já é usado nos estados de carregamento ("Salvando…", "Entrando…").
Setas desenhadas por **ícones** do lucide-react (`ChevronRight`, `ChevronUp`) e as
setas de sintaxe do Mermaid (`-->`) são permitidas: a regra é sobre CARACTERES de
texto, não sobre ícones nem sintaxe.

Hoje `src/` está limpo. O `README.md` da raiz ainda tem travessões e setas
antigos. Não saia caçando para trocar todos, mas nunca escreva um novo, e ao
editar um trecho que já tem um, aproveite e corrija.

## 0.2 Regras de implementação

Estas valem sempre, sem precisar pedir:

1. **Idioma da interface: pt-BR.** Não existe camada de i18n neste projeto e não
   se deve criar uma. As strings ficam direto no JSX, em português, como já é
   feito em todas as telas.
2. **Dinheiro é sempre inteiro em centavos.** Nunca use float nem `toFixed`.
   Formate com `formatBRL` e leia digitação com `digitsToCents`, ambos em
   [`src/utils/money.ts`](../src/utils/money.ts).
3. **Nunca use cor hardcoded.** Use as variáveis CSS (`var(--gold)`,
   `var(--gold-soft)`, `var(--text)`, `var(--muted)`, `var(--danger)`). Ver
   [03-identidade-visual.md](03-identidade-visual.md).
4. **Todo estilo novo vai para `src/styles.css`**, com classe semântica em
   kebab-case. Nada de estilo inline (exceto valor dinâmico, como a largura da
   barra de progresso), nada de CSS-in-JS, nada de Tailwind.
5. **O tema é único e escuro.** A identidade é ouro sobre preto puro; não
   existe versão clara e não se deve criar uma. Peça nova com moldura entra no
   sistema `.frame` (regra agrupada no topo do `styles.css`), com chanfro por
   `clip-path` e preenchimento sempre opaco.
6. **Mobile é requisito, não polimento.** Toda tela precisa funcionar em 360px de
   largura sem scroll horizontal da página. Ver
   [08-responsividade-mobile.md](08-responsividade-mobile.md).
7. **Componentes nunca falam com o Firestore.** Todo acesso a dados passa por
   `src/services/`. Se falta uma operação, crie a função no serviço certo, não
   importe `firebase/firestore` dentro de um componente.
8. **Nunca grave `undefined` no Firestore.** O SDK rejeita o documento inteiro.
   Use `null` para campo vazio (é o que `normalizeFixedInput` faz com as
   parcelas) ou omita a chave.
9. **Status de linha vem de `ENTRY_STATUSES`** em
   [`src/types.ts`](../src/types.ts). Nunca escreva a string solta em um
   componente, e ao adicionar um status novo atualize também `STATUS_CLASS` no
   `MonthScreen`, o CSS `.st-*` e o [06-banco-de-dados.md](06-banco-de-dados.md).
10. **Reaproveite antes de criar.** Procure em
    [`src/components/shared.tsx`](../src/components/shared.tsx),
    `src/hooks/` e `src/utils/` (inventário em
    [04-componentes-e-telas.md](04-componentes-e-telas.md)) antes de escrever
    qualquer coisa nova.
11. **Comente o POR QUÊ, não o o quê.** O padrão da casa é explicar a decisão e o
    defeito que ela evita. Ver
    [10-manutencao-e-granularidade.md](10-manutencao-e-granularidade.md).
12. **Rode `npm run typecheck` antes de entregar.** Nenhuma alteração entra com
    erro de tipo. Se mexeu em build, PWA ou dependências, rode `npm run build`
    também.
13. **Nunca faça commit na branch `main`.** Trabalhe em branch própria e envie
    para ela.
14. **Não adicione dependência sem necessidade real.** O projeto tem quatro
    dependências de runtime de propósito. Ícone novo sai do `lucide-react`, que
    já está instalado.

## 0.3 Checklist de fim de tarefa

Antes de dizer que terminou:

- [ ] `npm run typecheck` passa sem erro.
- [ ] Nenhum travessão nem caractere de seta no que eu escrevi
      (`LC_ALL=C.UTF-8 grep -rnP "[\x{2014}\x{2013}\x{2192}\x{2190}]" <arquivos alterados>`).
- [ ] Nenhuma cor hardcoded; peça nova usa o sistema `.frame` e o chanfro `--c`.
- [ ] Valores monetários em centavos, formatados com `formatBRL`.
- [ ] Nenhum acesso a `firebase/firestore` fora de `src/services/`.
- [ ] Testei (no navegador ou mentalmente) em 360px de largura, sem scroll
      horizontal da página.
- [ ] Não criei componente, hook ou utilitário duplicado do que já existia.
- [ ] Documentos afetados desta pasta foram atualizados.
- [ ] Commit em branch própria, com mensagem em pt-BR no padrão do repositório.
