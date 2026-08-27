# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Este app

Expo SDK 57 + expo-router. As rotas ficam em `src/app`; o resto do codigo em
`src/components` e `src/lib`. O alias `@/` aponta para `src/`.

E a versao nativa de `apps/web` e segue as mesmas decisoes de produto. Antes de
inventar comportamento novo, veja como o web resolve o mesmo caso — os nomes dos
arquivos foram mantidos proximos de proposito (`EventCard`, `TagInput`,
`event-visuals`, `use-timeline`).

Sem regra de negocio aqui. Do backend, so tipos (`@repo/entities/contracts`).

## O que muda em relacao ao web

- **Cores**: nao ha Tailwind nem oklch. Use `useTheme()` (`src/lib/theme/use-theme.ts`)
  e os tokens de `@repo/theme`; para opacidade, `withAlpha(cor, 0.1)` no lugar de
  `bg-primary/10`.
- **Rede**: nao ha caminho relativo nem rewrite. Use `apiFetch` / `authedFetch`
  de `src/lib/api/client.ts`, que ja poem o host e o `Authorization`.
- **Login**: `signInWithPopup` nao existe no React Native. O fluxo esta em
  `src/lib/firebase/google-sign-in.ts` — Google nativo emite o ID token, o
  Firebase troca por sessao.
- **Datas**: as mesmas funcoes do web, vindas de `@repo/timeline`. Nao
  reimplemente fuso nem janela aqui.

## Rodando

Precisa de development build (o Google Sign-In e modulo nativo) e das variaveis
`MOBILE_API_URL`, `MOBILE_GOOGLE_WEB_CLIENT_ID` e `API_HOST=0.0.0.0` no `.env`
da raiz do monorepo. O README da raiz tem o passo a passo.

## Testes

Vitest, projeto `mobile`, ambiente node, so `*.test.ts`. Componente de React
Native nao renderiza aqui — o que da para testar e logica pura. Rode com
`npm run --silent test:ai` da raiz.
