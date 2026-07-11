# Cash Organizer — Web

Web app responsivo (mobile-first) para organizar gastos fixos e variáveis por mês, com
adição rápida de gastos, limites baseados em "gasto ideal", virada de mês e estatísticas.

Frontend em **Vite + React + TypeScript**, conversando **diretamente com o Firestore**
(sem backend próprio). As rules e functions do Firebase ficam no repositório
`cash-organizer-functions`.

## Conceitos

- **Compartimento financeiro**: subdivisão de contexto de contas (funciona como um
  "login" com nome + senha). É criado na primeira entrada (com confirmação) e fica
  salvo no `localStorage` — a senha é cifrada com AES-GCM (Web Crypto) usando uma
  chave gerada no dispositivo; no Firestore só é guardado o hash SHA-256.
- **Gastos fixos**: valor fixo mensal; o valor é usado como *gasto ideal*
  automaticamente, a menos que o usuário defina outro.
- **Categorias de gastos variáveis**: sempre existe ao menos a categoria **Avulso**.
  Cada categoria tem um gasto ideal do mês (o limite semanal é o ideal ÷ 4).
- **Mês**: todos os gastos são referentes ao mês corrente do compartimento. Cada linha
  (fixo ou categoria) tem um status: `Pendente`, `Parcialmente pago`,
  `Agendado/Automático`, `Pago`, `Sem gasto`, `Não disponível ainda`. O botão
  **Virar mês** só é liberado quando não há linhas `Pendente`; ao virar, o mês é
  fechado (com totais gravados para estatísticas) e o próximo é criado mantendo os
  fixos e categorias. Meses anteriores continuam consultáveis.

## Telas

1. **Entrada**: nome + senha do compartimento (com modal de confirmação de criação).
2. **Novo gasto** (principal): escolha da categoria + valor, com um informe de
   contexto (limite semanal, quanto falta no mês/semana, total de fixos e variáveis).
3. **Mês**: tabela de fixos, categorias com soma (expansível para ver os lançamentos),
   totais ideais × atuais, status por linha e botão "Virar mês". Inclui a subtela
   **Estatísticas** (comparativo mensal, uso por categoria e semanas × mês anterior).
4. **Gerenciar**: cadastro de gastos fixos e categorias com seus valores ideais.

## Modelo de dados (Firestore)

```
compartments/{id}                    nome, hash da senha, mês corrente
  fixedExpenses/{id}                 cadastro dos gastos fixos
  categories/{id}                    cadastro das categorias (Avulso é padrão)
  months/{YYYY-MM}                   status open/closed + totais ao fechar
    fixedEntries/{fixedId}           snapshot do fixo no mês (valor, ideal, status)
    categoryEntries/{categoryId}     categoria no mês (ideal, status)
    expenses/{autoId}                lançamentos variáveis (valor, descrição, semana)
```

Valores monetários são armazenados em **centavos** (inteiros).

## PWA

O app é um Progressive Web App: pode ser instalado no celular e no computador
("Adicionar à tela inicial" / "Instalar app") e abre em janela própria.

- Manifest e ícones gerados pelo `vite-plugin-pwa` (`vite.config.ts`);
- Service worker com precache do app shell e atualização automática a cada
  novo deploy (`registerType: 'autoUpdate'`);
- O shell funciona offline; os dados vêm do cache offline do próprio SDK do
  Firestore (IndexedDB), então os últimos dados carregados continuam
  disponíveis sem conexão e sincronizam ao reconectar.

## Desenvolvimento

```bash
npm install
cp .env.example .env   # preencha com as configs do seu app Web no Firebase
npm run dev
```

## Deploy (GitHub Pages)

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builda e
publica no GitHub Pages a cada push na `main`.

Configuração necessária no repositório:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. **Settings → Secrets and variables → Actions**, criar as secrets:

| Secret | Onde encontrar (Console do Firebase → Configurações do projeto → Seus apps) |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
