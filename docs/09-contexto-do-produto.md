# 9. Contexto do produto

## 9.1 O que é

Cash Organizer é um organizador de gastos mensais de uso pessoal ou doméstico. O
objetivo não é contabilidade completa: é responder rápido a duas perguntas.

1. Posso gastar isso agora?
2. Como está o mês em relação ao que eu planejei?

Por isso a tela de abertura é a de adicionar gasto, e não um painel. Lançar um
gasto tem que caber em poucos toques, com o contexto (quanto resta na semana e no
mês) visível na mesma tela.

## 9.2 Para quem

Uso doméstico, por uma ou duas pessoas que compartilham as mesmas contas. Não há
conta de usuário nem papéis: quem tem o nome e a senha do compartimento tem
acesso total a ele. Isso é uma escolha de simplicidade, não um descuido, e limita
o produto a esse cenário de confiança mútua.

## 9.3 Conceitos

**Compartimento financeiro.** A subdivisão que guarda contas e gastos, com nome e
senha. Funciona como login. Serve para separar contextos ("casa", "pessoal",
"viagem") sem misturar dados.

**Gasto fixo.** Conta que se repete todo mês (aluguel, internet, mensalidade). O
valor cadastrado vale como gasto ideal automaticamente, a menos que se defina
outro. Pode ser parcelado ("2 de 4"), e nesse caso a parcela avança a cada virada
de mês e o gasto sai sozinho depois da última.

**Categoria de gasto variável.** Agrupa lançamentos avulsos (mercado, gasolina).
Tem um gasto ideal do mês, e o ideal da semana é esse valor dividido por 4. Todo
compartimento nasce com a categoria "Avulso", que é a padrão até o usuário
transferir esse papel para outra.

**Origem do gasto.** De onde o dinheiro saiu: "Cartão C6 (Crédito)", "Pix ou
Transf.", "Cartão Nu", "Dinheiro". No lançamento variável é um segundo eixo de
classificação, independente da categoria (a categoria diz no que se gastou, a
origem diz por onde se pagou); no gasto fixo é parte do cadastro e responde "de
onde sai esta conta todo mês". É também a unidade de pagamento do mês: a aba
Pagamento pergunta, origem por origem, se aquela fatura já foi paga. Cada origem
tem um ícone e um tom, e uma delas é a padrão, já escolhida ao adicionar gasto e
ao cadastrar um fixo.

**Gasto ideal.** O planejado, não o limite rígido. Nada impede o usuário de
gastar acima: a interface apenas mostra o excesso em vermelho.

**Mês.** Unidade de tudo. O mês em aberto é o único que recebe lançamentos e
edições. Os anteriores ficam consultáveis, congelados.

**Status da linha.** Como está cada gasto fixo e cada categoria no mês. Existe
para que a virada de mês seja uma revisão consciente, e não automática.

**Virada de mês.** Fecha o mês atual (gravando os totais para estatísticas) e
abre o próximo mantendo fixos e categorias. Só é liberada quando não há nenhuma
linha `Pendente`.

## 9.4 Decisões de produto que valem manter

| Decisão | Por quê |
|---|---|
| Adicionar gasto é a tela inicial | é a ação feita várias vezes por dia; as outras são semanais ou mensais |
| Valor em campo grande com `autoFocus` | o lançamento típico é valor mais categoria, nada mais |
| Semana é o mês dividido em 4, com o dia 29 em diante caindo na semana 4 | manter 4 semanas fixas torna a comparação entre meses direta, mesmo com meses de tamanhos diferentes |
| Ideal semanal é o ideal do mês dividido por 4 | mesma razão: previsibilidade acima de exatidão de calendário |
| Virada bloqueada por linha `Pendente` | força revisar cada conta antes de fechar o mês |
| Totais gravados ao fechar o mês | estatísticas baratas, sem reler o histórico inteiro |
| Remoção é desativação | o histórico dos meses fechados não pode mudar |
| `categoryName` copiado no lançamento | renomear ou remover a categoria não deixa o histórico ilegível |
| Pagamento acompanhado por origem, não por categoria | quem paga paga a fatura do cartão, não a categoria "mercado"; categoria é orçamento e continua valendo nas estatísticas e no ideal |
| Status da origem desce para os gastos fixos dela | marcar o cartão como pago e deixar as contas dele pendentes seria um estado que a própria tela mostra como meio pago; ainda assim cada fixo pode ser ajustado depois |
| Origem com linha de mês só de status, sem valor | o valor dela é a soma do que saiu no mês, e soma calculada não precisa ser gravada |
| Cor só no ícone da origem | o usuário precisa distinguir dois cartões de relance, e a identidade continua ouro sobre preto porque moldura e preenchimento não mudam |
| Histórico do mês na aba Adicionar | é onde o usuário está depois de lançar; conferir e corrigir o gasto recém-incluído não deveria exigir trocar de tela |
| Data do lançamento livre, mas sempre dentro do mês em aberto | o mês do app é a referência da fatura, não o calendário |
| Trocar o mês de referência move o conteúdo junto | quem percebe no meio do mês que estava lançando na referência errada quer corrigir, não recomeçar; os cadastros não se movem porque já valem para todos os meses |
| Status `Ignorar` tira do gasto, mas não do ideal | serve para gasto que não deve entrar na conta do mês (reembolso, pagamento de terceiro) sem mexer no orçamento planejado |
| Tema único e escuro, sem botão de troca | a identidade é ouro sobre preto puro; uma versão clara exigiria uma segunda paleta e não traria nada ao uso no celular |

## 9.5 O que o produto não faz (e não deveria fazer sem decisão explícita)

- não tem múltiplos usuários, permissões nem trilha de auditoria;
- não importa extrato bancário nem OCR de nota;
- não tem receitas ou saldo, só gastos;
- não tem metas de longo prazo, investimentos nem relatórios exportáveis;
- não faz conversão de moeda: tudo é BRL;
- não tem recuperação de senha.

## 9.6 Glossário rápido

| Termo na interface | No código |
|---|---|
| Compartimento | `Compartment`, coleção `compartments` |
| Gasto fixo (cadastro) | `FixedExpense`, coleção `fixedExpenses` |
| Gasto fixo (linha do mês) | `FixedEntry`, subcoleção `fixedEntries` |
| Categoria (cadastro) | `Category`, coleção `categories` |
| Categoria (linha do mês) | `CategoryEntry`, subcoleção `categoryEntries` |
| Lançamento | `VariableExpense`, subcoleção `expenses` |
| Origem do gasto (cadastro) | `Origin`, coleção `origins` |
| Origem do gasto (linha do mês) | `OriginEntry`, subcoleção `originEntries` |
| Gasto ideal | `idealAmount` |
| Valor | `amount` |
| Mês em aberto | `compartment.currentMonth` com `month.status === 'open'` |
| Virar mês | `closeMonth` |
