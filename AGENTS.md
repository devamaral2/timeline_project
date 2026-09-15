# Estrutura do monorepo

## Servico de autenticacao

`apps/auth` e um NestJS independente para identidade: login por senha, sessao
com refresh token rotativo, JWT verificavel offline pelo JWKS e RBAC. Nao ha MFA,
step-up, recovery codes, audit log nem API de administracao. Operadores usam os
scripts do proprio workspace (`db:migrate`, `bootstrap-admin`,
`rotate-signing-key` e `retire-signing-keys`); os procedimentos sem segredo estao
em `docs/runbooks/`. Nao remova refresh tokens consumidos de sessoes ainda vivas:
eles sustentam a deteccao de reuso.

Turborepo + pnpm workspace. Oito workspaces:

```
apps/web          Next.js 16 — frontend web, sem regra de negocio
apps/mobile       Expo 57 + expo-router — app nativo, sem regra de negocio
apps/api          NestJS — usecases, services, gateways, controllers HTTP
apps/auth         NestJS — identidade: signup por link, login, sessao e RBAC
packages/entities @repo/entities — dominio, portas e DTOs
packages/persistence @repo/persistence — schema, repositories e acesso Postgres
packages/timeline @repo/timeline — datas, janelas e agrupamento da timeline
packages/theme    @repo/theme — os tokens de cor do design system
```

Direcao das dependencias (nunca o contrario):

```
apps/web    ──> @repo/entities/contracts (apenas `import type`), @repo/timeline, @repo/theme
apps/mobile ──> @repo/entities/contracts (apenas `import type`), @repo/timeline, @repo/theme
apps/api    ──> @repo/entities, @repo/entities/ports, @repo/persistence
@repo/persistence ──> @repo/entities
@repo/timeline    ──> @repo/entities/contracts (apenas `import type`)
```

Os packages nao conhecem os apps. As portas de repositorio (`EventRepository`,
`TagRepository`) vivem em `@repo/entities/ports` justamente para que
`@repo/persistence` possa implementa-las sem depender de `apps/api`.

`@repo/timeline` e `@repo/theme` existem para que web e mobile calculem as
mesmas janelas de data e pintem as mesmas cores. Regra pratica: se web e mobile
precisarem da mesma logica e ela nao depender do DOM nem do React Native, ela
vai para um desses dois — nao para os dois apps.

## Front e back

O backend escuta so em `127.0.0.1` por padrao — nao e exposto para fora do
servidor. O browser fala com o Next, que repassa `/api/*` ao Nest pelo
`rewrites` do `apps/web/next.config.ts`.

## Autenticacao pelo apps/auth

Nao ha Firebase em nenhum dos apps. Quem autentica e o `apps/auth`, por e-mail e
senha, e o `apps/api` nao verifica JWT sozinho: o `AuthServiceGuard`
(`apps/api/src/auth/auth-service.guard.ts`) repassa o bearer a
`GET /auth/me` do `apps/auth` (host em `AUTH_SERVICE_URL`) e anexa o ator ao
request. Sem bearer, 401 sem tocar na rede; `apps/auth` fora do ar vira 503,
nunca 401. O guard nao tem parametro de construtor de proposito — com
`emitDecoratorMetadata` o Nest tentaria injetar o client.

- **Web**: o navegador nunca ve token. `/api/session/{login,refresh,logout}` e
  `GET /api/session` sao route handlers do Next (`apps/web/src/lib/session/`)
  que falam com o `apps/auth` e guardam access e refresh em cookies httpOnly.
  O `src/proxy.ts` do Next transforma o cookie em `Authorization` no caminho de
  `/api/*` ao Nest. `/auth/*` e repassado ao `apps/auth` pelo rewrite.
- **Mobile**: fala direto com o `apps/auth` em `MOBILE_AUTH_URL` e guarda os
  tokens no `expo-secure-store` (`apps/mobile/src/lib/auth/`).
- **Refresh rotativo**: o `apps/auth` trata um refresh token apresentado duas
  vezes como roubo e derruba a sessao. Os dois clientes renovam em voo unico
  (`refresh-session.ts` no web, com Web Locks entre abas; `session-store.ts` no
  mobile). Nao crie um segundo caminho de renovacao que fuja deles.

**Leituras autenticadas acontecem no cliente.** Quem chama a API e
`authedFetch` (`apps/web/src/lib/api/authed-fetch.ts` e
`apps/mobile/src/lib/api/client.ts`): num 401 ele renova a sessao uma vez e
repete a chamada. O `useSession`/`useSessionState` de cada app diz se ja se
sabe quem esta logado (`ready`) — pedir antes disso e um 401 garantido.

Testes do fluxo: `auth-service.guard.e2e.test.ts` passa um request HTTP real
por uma rota Nest com o guard ate um `apps/auth` falso (roda no `test:ai`). O
fluxo nos tres apps de verdade e `pnpm e2e:auth`
(`scripts/e2e/auth-login-flow.mjs`), com `E2E_EMAIL`/`E2E_PASSWORD` de uma
conta ativa e os tres servidores de pe — faz dois logins por execucao, que
contam no rate limit por e-mail do `apps/auth`.

O `userId` das rotas e o id do usuario no `apps/auth`. Os eventos gravados com
o uid do Firebase nao foram migrados e nao aparecem para a conta nova.

O app mobile nao tem o rewrite do Next: ele fala direto com o Nest, pelo host em
`MOBILE_API_URL` (skill `env-setup`).

Nao coloque regra de negocio em `apps/web` nem em `apps/mobile`. Do backend eles
so importam tipos.

**Ordem das rotas no Nest importa**: em `apps/api/src/events/http/events.controller.ts`
as rotas estaticas (`daily`, `ai`, `voice`) precisam ser declaradas antes de
`:eventId`, senao o parametro dinamico captura as tres. Ha um teste travando isso
(`events.routing.test.ts`).

# A marca de nao realizado

Nao ha status. O evento nao tem ciclo de vida, nao tem situacao derivada do
relogio e nao tem o par realizado/nao realizado: tem **uma anotacao**, em
`packages/entities/src/events/types/missed-flag.ts`.

- `missed` — booleano, padrao `false`. E o usuario registrando o que perdeu.
- `priority` — `urgent`, `normal`, `flexible`, em `event-priority.ts`. Campo
  separado, que nao conversa com a marca.

**A marca nao tem oposto.** Um evento sem ela nao e "realizado" — e um evento
que ninguem anotou, que e o normal. Por isso o selo do cartao so aparece quando
`missed` e true (`MissedBadge`, nos dois apps): desenhar "Realizado" em tudo que
sobrou seria afirmar uma coisa que ninguem afirmou. Marcar e desmarcar sao a
mesma acao nos dois sentidos, e o formulario de edicao usa uma caixa, nao uma
lista.

**Nada liga a marca sozinho.** Nenhuma hora, nenhuma janela fechada, nenhum
evento antigo. A timeline nao consulta relogio nenhum para monta-la — foi por
isso que o `ListTimelineEventsUseCase` perdeu o clock que recebia.

**Nao ha migracao dos documentos antigos**, e o Firestore nao valida nada. Quem
cobre a lacuna e a leitura, em `readMissedFlag`: documento sem os campos fica
sem marca, e o `status` da versao anterior — que continua gravado por ai — so
vira marca quando era exatamente `missed`. Os outros valores daquele ciclo de
vida (`draft`, `scheduled`, `in_progress`, `completed`, `archived`) falavam de
planejamento, nao de o usuario ter faltado, e traduzi-los seria inventar
anotacoes que ninguem fez. O `MissedBadge` tambem aceita `undefined` sem
quebrar: um backend de outra versao nao pode derrubar a timeline. O caminho de
escrita e o contrario, e mais estrito — o controller recusa com 400 qualquer
`missed` que nao seja booleano e qualquer prioridade fora das tres.

Os rotulos em portugues vivem nos `event-visuals` de cada app, junto dos rotulos
de tipo. O selo usa `destructive`, que e token de situacao e vive separado de
`training` e `meal`, que sao tokens de tipo: os dois aparecem no mesmo cartao e
precisam ser distinguiveis.

# App mobile

Expo SDK 57 com expo-router, roteamento por arquivo em `apps/mobile/src/app`.
Build de desenvolvimento nativo, tema sempre escuro, resolucao dos packages
`@repo/*` e a persistencia de sessao do Firebase estao na skill
`mobile-app-conventions`. Para rodar num aparelho fisico, veja a skill
`env-setup`.

# Persistencia

Os eventos vivem no PostgreSQL, em `packages/persistence` (schema Drizzle em
`src/database/schema`, repositories e queries ao lado). Nao ha Firestore: a
base de eventos que veio de la nunca passou por uma migracao documento a
documento, foi cortada para o Postgres de uma vez (ve "A marca de nao
realizado" acima para o que esse corte deixou de marca no schema).

Gerar/aplicar migrations, subir o Postgres local e rodar a suite de
integracao: skill `db-migrations`.

# Variaveis de ambiente

Um unico `.env`/`.env.local` na raiz serve os tres apps; `.env.local` tem
precedencia. Carregamento por app, teste em aparelho fisico, chaves do
Firebase compartilhadas e `env:pull`: skill `env-setup`.

# Comandos

`pnpm` precisa estar no PATH (`corepack enable pnpm` num terminal admin, ou
`npm i -g pnpm`) — o Turborepo invoca o gerenciador de pacotes diretamente.

```
pnpm install              instala tudo (skill install-dependencies p/ troubleshooting)
pnpm turbo run build      builda na ordem de dependencia
pnpm turbo run typecheck  checa tipos nos 7 workspaces
pnpm dev                  sobe todos os servidores ao mesmo tempo (Nest, Next, auth)
pnpm dev:auth             sobe so o servico de auth, sem web/mobile/api
pnpm dev:api              sobe so a API, sem web/mobile/auth
pnpm dev:web              sobe so o Next, sem api/mobile/auth
pnpm dev:mobile           sobe o Metro (terminal separado — toma a interface)

pnpm --filter @repo/mobile run android   gera o projeto nativo e instala no aparelho
```

**Sempre rode os comandos de dev pela raiz do monorepo**, nunca de dentro de
`apps/*` — o `.env`/`.env.local` unico so e carregado a partir da raiz (skill
`env-setup`).

**`dev` depende de `^build`** (`turbo.json`). O Nest e o Next leem os packages
de `dist/`, nao do fonte — so o Metro le TypeScript direto. Sem essa
dependencia, um simbolo recem-criado em `@repo/entities` existiria so no `src`
e a API nunca subiria. Se a API estiver fora do ar, `pnpm turbo run build`
antes de subir o dev resolve.

# Rodando os testes

Use **sempre** `npm run --silent test:ai`, nunca `npm test` nem `npx vitest`
— corta o consumo de tokens (skill `running-tests` para o que o reporter
silencioso faz, como filtrar por workspace/arquivo e como investigar uma
falha alem da primeira).

Os testes do `auth` que exigem Postgres pulam sozinhos sem
`AUTH_TEST_DATABASE_URL` — e sao a maior parte da suite dele — e `Tests pass`
nao denuncia isso. Para roda-los de verdade, use a skill `auth-postgres-tests`.

# Worktrees paralelas

Varias worktrees podem rodar a app ao mesmo tempo, cada uma com portas e
Postgres proprios, via `scripts/worktree/` (`pnpm worktree:new`,
`pnpm worktree:provision`, `pnpm worktree:teardown`) — a worktree principal
nunca e tocada por eles. Procedimento e verificacao completos em
`docs/runbooks/worktrees.md`. Para efetivamente subir a app e validar uma
mudanca rodando de verdade (nao os testes unitarios), use a skill
`worktree-app-testing`.
