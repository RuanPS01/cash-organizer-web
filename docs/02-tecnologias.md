# 2. Tecnologias

## 2.1 Stack

| Camada | Escolha | Observação |
|---|---|---|
| Build | Vite 8 | `@vitejs/plugin-react` para JSX e Fast Refresh |
| UI | React 19 | function components, sem class components |
| Linguagem | TypeScript 5.9 | `strict: true`, sem `any` no código atual |
| Dados | Firebase 12 (Firestore) | acesso direto do cliente, sem backend |
| Ícones | lucide-react 1.x | única fonte de ícones do projeto |
| PWA | vite-plugin-pwa 1.3 | manifest, ícones e service worker |
| Estilo | CSS puro em arquivo único | `src/styles.css`, sem framework |
| Fontes | Chakra Petch e Oxanium (Google Fonts) | carregadas no `index.html`, cacheadas pelo service worker |
| Deploy | GitHub Actions e GitHub Pages | `.github/workflows/deploy.yml` |

Não usamos: framework de CSS, biblioteca de componentes, router, gerenciador de
estado global, camada de i18n, biblioteca de datas, biblioteca de formulários,
suíte de testes. Cada ausência é deliberada: o app é pequeno e o custo de manter
essas camadas seria maior que o ganho.

## 2.2 Dependências

Runtime (`dependencies`):

| Pacote | Versão | Para que |
|---|---|---|
| `react` | ^19.2.0 | UI |
| `react-dom` | ^19.2.0 | render no DOM |
| `firebase` | ^12.15.0 | SDK do Firestore (modular) |
| `lucide-react` | ^1.23.0 | ícones |

Desenvolvimento (`devDependencies`):

| Pacote | Versão | Para que |
|---|---|---|
| `vite` | ^8.1.3 | dev server e build |
| `@vitejs/plugin-react` | ^6.0.3 | plugin React |
| `vite-plugin-pwa` | ^1.3.0 | manifest e service worker |
| `typescript` | ~5.9.3 | checagem de tipos |
| `@types/react`, `@types/react-dom` | ^19.2.0 | tipos do React |

Antes de adicionar qualquer dependência, verifique se a plataforma já resolve:
`Intl.NumberFormat` e `Intl.DateTimeFormat` cobrem moeda e datas, e a Web Crypto
API cobre hash e cifra.

## 2.3 Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe o Vite em modo desenvolvimento |
| `npm run build` | `tsc -b` seguido de `vite build`, saída em `dist/` |
| `npm run preview` | serve o `dist/` para conferir o build |
| `npm run typecheck` | apenas `tsc -b`, sem gerar arquivos |

`npm run typecheck` é o portão mínimo antes de entregar qualquer alteração.

## 2.4 TypeScript

`tsconfig.json` com os pontos que mais afetam o dia a dia:

- `strict: true`, `noUnusedLocals` e `noUnusedParameters`: import ou variável sem
  uso quebra o build, então limpe o que sobrar de uma refatoração.
- `verbatimModuleSyntax: true`: import só de tipo precisa de `import type`.
  Misturar valor e tipo no mesmo import não compila.
- `jsx: "react-jsx"`: não precisa importar `React` para usar JSX.
- `moduleResolution: "bundler"` e `target: ES2022`.
- `types: ["vite/client", "vite-plugin-pwa/client"]`: é o que dá tipo para
  `import.meta.env` e para `virtual:pwa-register`.

## 2.5 Variáveis de ambiente

| Variável | Obrigatória | Para que |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | sim | config do app web no Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | sim | idem |
| `VITE_FIREBASE_PROJECT_ID` | sim | idem |
| `VITE_FIREBASE_STORAGE_BUCKET` | sim | idem |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | sim | idem |
| `VITE_FIREBASE_APP_ID` | sim | idem |
| `VITE_BASE_PATH` | não | base do Vite. Local `/`, Pages `/cash-organizer-web/` |
| `VITE_FIRESTORE_EMULATOR_HOST` | não | ex.: `127.0.0.1:8080`, liga o emulador |

Toda variável precisa do prefixo `VITE_` para chegar ao cliente. Nenhum segredo
de verdade pode entrar aqui: tudo que vai para o bundle é público, e a proteção
real do dado está nas rules do Firestore, mantidas no repositório
`cash-organizer-functions`.

## 2.6 Ambiente local

```bash
npm install
cp .env.example .env   # preencha com as configs do app Web no Firebase
npm run dev
```

Para trabalhar sem projeto real, suba o emulador do Firestore e defina
`VITE_FIRESTORE_EMULATOR_HOST` no `.env`.

## 2.7 PWA

Configurado em [`vite.config.ts`](../vite.config.ts) com `VitePWA`:

- `registerType: 'autoUpdate'` mais `registerSW({ immediate: true })` no
  `main.tsx`: cada deploy novo é aplicado sozinho.
- Manifest em pt-BR, `display: standalone`, `orientation: portrait`,
  `theme_color: #000000`, `background_color: #000000`.
- Ícones em `public/icons/` (192, 512, 512 maskable e apple-touch).
- Workbox faz precache do app shell (`js`, `css`, `html`, `svg`, `png`, `ico`,
  `webmanifest`). As chamadas ao Firestore não são interceptadas: o offline dos
  dados é responsabilidade do cache do próprio SDK em IndexedDB.
- `runtimeCaching` guarda as fontes do Google (`fonts.googleapis.com` e
  `fonts.gstatic.com`) em CacheFirst: sem isso a identidade cairia na fonte do
  sistema quando o app abrisse offline.

Ao mexer em PWA, rode `npm run build` e confira o `dist/sw.js` gerado. Só o
`typecheck` não pega erro de configuração de plugin.

## 2.8 Deploy

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) roda a cada
push na `main` e no disparo manual:

1. `actions/checkout` e `actions/setup-node` (Node 22, cache npm).
2. `npm ci` e `npm run build`, com `VITE_BASE_PATH` igual a
   `/${{ github.event.repository.name }}/` e as secrets `VITE_FIREBASE_*`.
3. `upload-pages-artifact` com o `dist/` e `deploy-pages`.

Pré-requisitos no repositório: Pages com source "GitHub Actions" e as seis
secrets `VITE_FIREBASE_*` cadastradas.
