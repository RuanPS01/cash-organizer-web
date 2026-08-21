# Documentação do Cash Organizer Web

Esta pasta é a fonte de verdade sobre como o projeto é construído. Ela existe
para que qualquer pessoa (ou agente de IA) consiga implementar algo novo sem
precisar reconstruir o contexto lendo o código inteiro.

## Índice

| Documento | Assunto |
|---|---|
| [00-regras-para-ia.md](00-regras-para-ia.md) | Regras obrigatórias para agentes de IA. Leia primeiro. |
| [01-arquitetura.md](01-arquitetura.md) | Camadas, pastas, fluxo de dados, boot do app. |
| [02-tecnologias.md](02-tecnologias.md) | Dependências, versões, scripts, build, deploy, PWA. |
| [03-identidade-visual.md](03-identidade-visual.md) | Tokens de cor, tema claro/escuro, tipografia, padrões de UI. |
| [04-componentes-e-telas.md](04-componentes-e-telas.md) | Inventário de telas, componentes reutilizáveis e hooks. |
| [05-padroes-de-codigo.md](05-padroes-de-codigo.md) | Nomenclatura, estilo de código, TypeScript, commits. |
| [06-banco-de-dados.md](06-banco-de-dados.md) | Modelo do Firestore, formato dos dados, ciclo de vida do mês. |
| [07-fluxos-aplicacao.md](07-fluxos-aplicacao.md) | Fluxos de uso ponta a ponta. |
| [08-responsividade-mobile.md](08-responsividade-mobile.md) | Breakpoints, tabela em telas estreitas, safe areas. |
| [09-contexto-do-produto.md](09-contexto-do-produto.md) | O que o produto é, para quem, decisões de produto, glossário. |
| [10-manutencao-e-granularidade.md](10-manutencao-e-granularidade.md) | Quando criar arquivo novo, tamanho, comentários, receitas de tarefas comuns. |

## Por onde começar

1. Nunca trabalhou neste repositório: leia
   [09-contexto-do-produto.md](09-contexto-do-produto.md) e depois
   [01-arquitetura.md](01-arquitetura.md).
2. Vai mexer em tela ou componente: leia
   [04-componentes-e-telas.md](04-componentes-e-telas.md) e
   [03-identidade-visual.md](03-identidade-visual.md).
3. Vai mexer em dados: leia [06-banco-de-dados.md](06-banco-de-dados.md).
4. É um agente de IA: [00-regras-para-ia.md](00-regras-para-ia.md) é obrigatório.

O [README.md](../README.md) da raiz continua sendo o guia rápido de instalação e
deploy. Esta pasta é o detalhamento técnico.
