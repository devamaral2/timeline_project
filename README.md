# Braid

Monorepo Turborepo + pnpm workspace.

```
apps/web              Next.js 16 — frontend web (porta 3000)
apps/mobile           Android nativo em Kotlin + Jetpack Compose
apps/api              NestJS — backend (porta 3001, so loopback por padrao)
apps/auth             NestJS — identidade, convite, login, sessao e RBAC
packages/contracts    @repo/contracts — contratos de dados compartilhados
packages/timeline     @repo/timeline — datas, janelas e agrupamento da timeline
packages/theme        @repo/theme — os tokens de cor do design system
```

O backend nao e exposto para fora do servidor: web e back rodam na mesma
maquina, e o Next repassa `/api/*` para o Nest via `rewrites`. Nenhum dos dois
frontends tem regra de negocio — do backend eles importam apenas tipos
(`@repo/contracts`). O dominio e a persistencia da API ficam em
`apps/api/src/domain` e `apps/api/src/infrastructure/persistence`; controllers,
use cases e services ficam em `apps/api/src/features`.

O `apps/auth` é o provedor de identidade do web e da API.
A documentação interativa do auth fica em `http://127.0.0.1:3002/docs`
(OpenAPI JSON em `/openapi.json`) depois de subir `pnpm dev:auth`.

O app Android repercute a experiência mobile do web; a implementação nativa
fica em reescrita. A fonte de verdade da paridade está em
`docs/runbook/mobile-rewrite.md`. Para preparar a máquina e rodar o app local,
consulte `docs/runbook/mobile-local-development.md`.

## Desenvolvimento

Requer Node 24+ e `pnpm` no PATH:

```bash
corepack enable pnpm
```

(num terminal com privilegio de administrador no Windows; alternativamente
`npm i -g pnpm`.)

Depois:

```bash
pnpm install
```

Configure `OP_SERVICE_ACCOUNT_TOKEN` e `OP_ENVIRONMENT_ID` no shell; as
variáveis do `.env.example` são resolvidas automaticamente no 1Password.
Consulte `docs/runbook/onepassword.md` para criar a Service Account e o
Environment.

```bash
pnpm dev
```

Sobe o Nest em `http://127.0.0.1:3001` e o Next em `http://localhost:3000`.

## App mobile

O app Android está em reescrita nativa com Kotlin e Jetpack Compose. Consulte o
runbook em `docs/runbook/mobile-rewrite.md` para o plano e a arquitetura e
`docs/runbook/mobile-local-development.md` para o procedimento completo de
desenvolvimento local.

## Testes

```bash
npm run --silent test:ai
```

Roda a suite inteira numa unica execucao do Vitest, com saida minima:
`Tests pass` quando verde. Para filtrar: `npm run --silent test:ai -- --project api`.

## Build e tipos

```bash
pnpm turbo run build
pnpm turbo run typecheck
```

## Autenticação

O `apps/auth` é o provedor de autenticação do web e da API, com sessão em
cookies httpOnly e login por email e senha. O app Android usará os mesmos
endpoints de autenticação durante a reescrita.

Os packages compilam antes dos apps (`dependsOn: ["^build"]`). O app Android
será compilado pelo Gradle, fora do build TypeScript do monorepo.
