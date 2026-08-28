# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Este app

Expo SDK 57 + expo-router. As rotas ficam em `src/app`; o resto do codigo em
`src/components` e `src/lib`. O alias `@/` aponta para `src/`.

E a versao nativa de `apps/web` e segue as mesmas decisoes de produto. Antes de
inventar comportamento novo, veja como o web resolve o mesmo caso — os nomes dos
arquivos foram mantidos proximos de proposito (`EventCard`, `TagInput`,
`event-visuals`, `TimelineHeader`).

Sem regra de negocio aqui. Do backend, so tipos (`@repo/entities/contracts`).

## O que muda em relacao ao web

- **Cores**: nao ha Tailwind nem oklch. Use `useTheme()` (`src/lib/theme/use-theme.ts`)
  e os tokens de `@repo/theme`; para opacidade, `withAlpha(cor, 0.1)` no lugar de
  `bg-primary/10`. O tema e sempre o escuro, nao o do sistema.
- **Acabamentos**: sombra de cartao e superficie de campo estao em
  `src/lib/theme/surfaces.ts` — o equivalente ao `shadow-card` e ao
  `field-styles.ts` do web. A interface e de cor solida: o unico gradiente do
  produto e o do simbolo do logo, desenhado em SVG dentro de
  `src/components/Logo.tsx`.
- **Rede**: nao ha caminho relativo nem rewrite. Use `apiFetch` / `authedFetch`
  de `src/lib/api/client.ts`, que ja poem o host e o `Authorization`.
- **Login**: `signInWithPopup` nao existe no React Native. O fluxo esta em
  `src/lib/firebase/google-sign-in.ts` — Google nativo emite o ID token, o
  Firebase troca por sessao.
- **Datas**: as mesmas funcoes do web, vindas de `@repo/timeline`. Nao
  reimplemente fuso nem janela aqui.
- **Timeline**: os dois apps tem a mesma navegacao por data — regua da semana e
  calendario, de `@repo/timeline`, e mostram um unico dia por vez. Escolher uma
  data substitui a lista atual; nao existe scroll infinito nem carrossel de dias.
  Cada selecao carrega somente seu dia (`use-day-events.ts`) e o cache de modulo
  evita repetir a chamada ao voltar a uma data ja visitada.
- **Contador**: o `durationLabel` que a API manda vale para o que ja terminou —
  no evento em andamento ele vem `"--"`. Quem preenche esse lugar e o
  cronometro (`formatStopwatch`, em `@repo/timeline`), com o relogio de um
  segundo compartilhado de `use-now.ts`: um `setInterval` para o app inteiro,
  nascendo no primeiro cronometro e morrendo com o ultimo. O formato e `MM:SS` /
  `H:MM:SS` de proposito diferente do `1h 25m` da API — um numero que ainda
  sobe nao se le como um registro fechado.

## Rodando

Precisa de development build (o Google Sign-In e modulo nativo) e das variaveis
`MOBILE_API_URL`, `MOBILE_GOOGLE_WEB_CLIENT_ID` e `API_HOST=0.0.0.0` no `.env`
da raiz do monorepo. O README da raiz tem o passo a passo.

## Testes

Vitest, projeto `mobile`, ambiente node, so `*.test.ts`. Componente de React
Native nao renderiza aqui — o que da para testar e logica pura. Rode com
`npm run --silent test:ai` da raiz.
