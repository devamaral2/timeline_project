---
name: db-migrations
description: >
  Gera e aplica migrations Drizzle neste monorepo — schema da API
  (@repo/persistence) e schema do Auth (apps/auth), cada um com seu proprio
  banco/URL. Use quando o schema Drizzle mudar, quando pedirem para
  rodar/aplicar migrations, ou para subir o Postgres local de dev.
---

## Postgres local

`docker compose -f infra/docker-compose.local.yml up -d` (ou
`pnpm compose:up`) sobe o Postgres de dev em
`127.0.0.1:${POSTGRES_HOST_PORT:-54391}`. Numa worktree secundaria isso ja e
feito por `scripts/worktree/provision-env.sh` — veja a skill
`worktree-app-testing`.

## Schema da API (@repo/persistence)

```bash
pnpm db:generate   # gera uma migration a partir do schema Drizzle em packages/persistence/src/database/schema
pnpm db:migrate    # aplica as pendentes em DATABASE_URL
```

`pnpm test:postgres` roda a suite de integracao via Testcontainers — exige
Docker rodando; sem Docker o teste falha em vez de pular.

## Schema do Auth (apps/auth)

Usa credenciais e fluxo proprios, com role de migracao separada da de
runtime — procedimento completo, incluindo rollback e sinais de schema
desatualizado, em `docs/runbooks/auth-database.md`. Resumo do comando:

```bash
pnpm --filter @repo/auth run db:migrate
```

## Regra que nao muda

**Nao edite uma migration ja aplicada em qualquer ambiente compartilhado** —
gere uma nova em cima dela. `applied_migrations` (API) e o schema `drizzle`
(auth) registram o nome do arquivo; reescrever o conteudo dele nao reaplica
nada, so gera divergencia entre bancos.
