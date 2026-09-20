# Estrutura do monorepo

## Servico de autenticacao

`apps/auth` e um NestJS independente para identidade. Operadores usam os
scripts do proprio workspace (`db:migrate`, `bootstrap-admin`,
`rotate-signing-key` e `cleanup-auth-data`); os procedimentos
sem segredo estao em `docs/runbooks/`. O cleanup e uma transacao protegida por
advisory lock: nao o substitua por tarefas paralelas nem remova refresh tokens
consumidos de sessoes ainda vivas, pois eles sustentam a deteccao de reuso.
Modelos de usuario, convite, sessao e RBAC vivem em `apps/auth/src/domain`;
controllers, use cases e repositorios ficam em `apps/auth/src/features`.

Turborepo + pnpm workspace. Sete workspaces:

```
apps/web          Next.js 16 — frontend web, sem regra de negocio
apps/mobile       Expo 57 + expo-router — app nativo, sem regra de negocio
apps/api          NestJS — usecases, services, gateways, controllers HTTP
apps/auth         NestJS — identidade: convite, login por senha, sessao e RBAC
packages/contracts @repo/contracts — contratos de dados compartilhados
packages/timeline @repo/timeline — datas, janelas e agrupamento da timeline
packages/theme    @repo/theme — os tokens de cor do design system
```

Direcao das dependencias (nunca o contrario):

```
apps/web    ──> @repo/contracts (apenas `import type`), @repo/timeline, @repo/theme
apps/mobile ──> @repo/contracts (apenas `import type`), @repo/timeline, @repo/theme
apps/api    ──> @repo/contracts, @repo/timeline
@repo/timeline ──> @repo/contracts (apenas `import type`)
```

Os packages nao conhecem os apps. Entidades e portas de repositorio vivem em
`apps/api/src/domain`; a implementacao Postgres em
`apps/api/src/infrastructure/persistence`. Controllers, services e use cases
vivem em `apps/api/src/features`, agrupados por capacidade. A API delega a
decisao de acesso a `apps/auth`; nao interpreta papeis ou grants.

`@repo/timeline` e `@repo/theme` existem para que web e mobile calculem as
mesmas janelas de data e pintem as mesmas cores. Regra pratica: se web e mobile
precisarem da mesma logica e ela nao depender do DOM nem do React Native, ela
vai para um desses dois — nao para os dois apps.

## Front e back

O backend escuta so em `127.0.0.1` por padrao — nao e exposto para fora do
servidor. O browser fala com o Next, que repassa `/api/*` ao Nest pelo
`rewrites` do `apps/web/next.config.ts`.

**Leituras autenticadas acontecem no cliente.** O web mantém a sessão em
cookies httpOnly e `authedFetch` (`apps/web/src/lib/api/authed-fetch.ts`) chama
o Next; o proxy transforma o cookie em `Authorization` e a API delega a
validação ao `apps/auth`. O Firebase continua restrito ao mobile por enquanto.

O app mobile nao tem esse rewrite: ele fala direto com o Nest, pelo host em
`MOBILE_API_URL` (skill `env-setup`).

Nao coloque regra de negocio em `apps/web` nem em `apps/mobile`. Do backend eles
so importam tipos.

**Ordem das rotas no Nest importa**: em `apps/api/src/features/events/http/events.controller.ts`
as rotas estaticas (`daily`, `ai`, `voice`) precisam ser declaradas antes de
`:eventId`, senao o parametro dinamico captura as tres. Ha um teste travando isso
(`events.routing.test.ts`).

# A marca de nao realizado

Nao ha status. O evento nao tem ciclo de vida, nao tem situacao derivada do
relogio e nao tem o par realizado/nao realizado: tem **uma anotacao**, em
`apps/api/src/domain/events/types/missed-flag.ts`.

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

Os eventos vivem no PostgreSQL, em `apps/api/src/infrastructure/persistence`
(schema Drizzle em `database/schema`, repositories e queries ao lado). Nao ha Firestore: a
base de eventos que veio de la nunca passou por uma migracao documento a
documento, foi cortada para o Postgres de uma vez (ve "A marca de nao
realizado" acima para o que esse corte deixou de marca no schema).
O `apps/api` delega autenticação ao `apps/auth`; não há Firebase no backend web
nem na API. O Firebase do mobile fica fora deste escopo.

Gerar/aplicar migrations, subir o Postgres local e rodar a suite de
integracao: skill `db-migrations`.

# Variaveis de ambiente

Um unico `.env`/`.env.local` na raiz serve os tres apps; `.env.local` tem
precedencia. Carregamento por app, teste em aparelho fisico, chaves do
Firebase compartilhadas e o carregador do 1Password: skill `env-setup`.

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
`apps/*` — os comandos devem ser executados pela raiz; o carregador do
1Password e os overrides de worktree sao aplicados a partir dali (skill
`env-setup`).

**`dev` depende de `^build`** (`turbo.json`). O Nest e o Next leem os packages
de `dist/`, nao do fonte — so o Metro le TypeScript direto. Sem essa
dependencia, um simbolo recem-criado em `@repo/contracts` existiria so no `src`
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
