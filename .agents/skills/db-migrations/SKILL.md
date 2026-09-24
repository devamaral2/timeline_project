---
name: db-migrations
description: Use when changing a Drizzle schema, generating or applying database migrations, or setting up the local PostgreSQL database for development.
---

# Database migrations

This monorepo has two independent PostgreSQL schemas and migration workflows:

- API database: `apps/api`, using `DATABASE_URL`.
- Auth database: `apps/auth`, using the separate migration credential
  `AUTH_DATABASE_MIGRATION_URL`.

Run commands from the repository root.

## API database

The Drizzle schema is under
`apps/api/src/infrastructure/persistence/database/schema` and migrations are
written to `apps/api/drizzle/`.

```bash
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates a migration from the current schema. `db:migrate`
applies pending migrations to `DATABASE_URL`.

For a local database, start PostgreSQL first:

```bash
pnpm compose:up
```

Worktree-specific databases and ports are provisioned by the worktree scripts;
do not replace their generated `.env.local` values manually.

## Auth database

The Auth schema is under `apps/auth/src/db/schema.ts` and migrations are stored
in `apps/auth/drizzle/`.

```bash
pnpm --filter @repo/auth run db:generate
pnpm --filter @repo/auth run db:migrate
```

Apply Auth migrations with `AUTH_DATABASE_MIGRATION_URL`, never with the
runtime credential `AUTH_DATABASE_URL`. For permissions, readiness checks, and
rollback, read `docs/runbook/auth-database.md`.

## Non-negotiable rule

Never edit a migration that has already been applied in a shared environment.
Create a new migration instead. The migration tables track filenames, so
rewriting an existing file creates drift rather than applying the change again.
