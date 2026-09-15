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
  de `src/lib/api/client.ts`, que ja poem o host e o `Authorization` (o access
  token do `apps/auth`, renovado pela sessao). Na pratica
  e sempre `authedFetch`: ler um dia e pedir sugestao de tag exigem token, e
  quem responde por autorizacao e ele — o `userId` da rota so diz que tela
  abrir, e nao vai mais na query. `apiFetch` fica para o proximo endpoint que
  seja mesmo publico.
- **Login**: e-mail e senha direto no `apps/auth` (`MOBILE_AUTH_URL`). A sessao
  vive em `src/lib/auth/`: `session-store.ts` e a logica pura (testada no
  Vitest), `session.ts` monta a instancia com o `expo-secure-store`. O web
  guarda os tokens em cookie httpOnly; aqui nao ha servidor no meio, entao
  quem os guarda e o Keychain/Keystore.
- **Datas**: as mesmas funcoes do web, vindas de `@repo/timeline`. Nao
  reimplemente fuso nem janela aqui.
- **Timeline**: os dois apps tem a mesma navegacao por data — regua da semana e
  calendario, de `@repo/timeline`, e mostram um unico dia por vez. Escolher uma
  data substitui a lista atual; nao existe carrossel de dias.
  Cada selecao carrega somente seu dia (`use-day-events.ts`), e o cache por
  conta e dia (`timeline-page-cache.ts`) evita repetir a chamada ao voltar a uma
  data ja visitada.
  **Dentro do dia a carga sobe.** A API pagina do mais novo para o mais antigo e
  a lista e lida da primeira hora para a ultima, entao a proxima pagina entra no
  topo: quem a pede e o `onStartReached` da `DayTimeline`, e o indicador de carga
  vive no cabecalho. Quem inverte, ordena e deduplica e o `mergeDayPage`, sobre o
  `mergeTimelinePage` que web e mobile dividem.
- **Contador**: o `durationLabel` que a API manda vale para o que ja terminou —
  no evento em andamento ele vem `"--"`. Quem preenche esse lugar e o
  cronometro (`formatStopwatch`, em `@repo/timeline`), com o relogio de um
  segundo compartilhado de `use-now.ts`: um `setInterval` para o app inteiro,
  nascendo no primeiro cronometro e morrendo com o ultimo. O formato e `MM:SS` /
  `H:MM:SS` de proposito diferente do `1h 25m` da API — um numero que ainda
  sobe nao se le como um registro fechado.

## Rodando

Precisa de development build (o `expo-secure-store` e modulo nativo) e das
variaveis `MOBILE_API_URL`, `MOBILE_AUTH_URL`, `API_HOST=0.0.0.0` e
`AUTH_HOST=0.0.0.0` no `.env` da raiz do monorepo. O README da raiz tem o
passo a passo.

## Testes

Vitest, projeto `mobile`, ambiente node, so `*.test.ts`. Componente de React
Native nao renderiza aqui — o que da para testar e logica pura. Rode com
`npm run --silent test:ai` da raiz.
