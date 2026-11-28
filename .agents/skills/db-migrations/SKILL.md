---
name: db-migrations
description: Use when changing the API's SQLite schema or the Auth Drizzle schema, writing or applying database migrations, or setting up the local databases for development.
---

# Database migrations

This monorepo has two independent databases and migration workflows:

- API database: `apps/api`, a SQLite file (`API_DATABASE_PATH`, default
  `.data/api.sqlite` at the repository root). See ADR 0024.
- Auth database: `apps/auth`, PostgreSQL, using the separate migration
  credential `AUTH_DATABASE_MIGRATION_URL`.

Run commands from the repository root.

## API database (SQLite)

There is no ORM. Migrations are hand-written SQL files in `apps/api/migrations/`
named `NNNN_nome.sql` (four digits, lowercase snake case). The row shapes the
code reads and writes are in
`apps/api/src/infrastructure/persistence/database/tables.ts`; update it in the
same change as the migration.

```bash
pnpm db:migrate
```

The API also applies pending migrations when it starts, after copying the file
next to itself (`<arquivo>.antes-de-<migration>.sqlite`). The runner
(`persistence/sqlite/migrate.ts`):

- records each file by name and SHA-256 in `schema_migrations`, so a file merged
  out of order still runs;
- runs each file in its own `BEGIN IMMEDIATE` transaction, with foreign keys
  turned off around the runner and `PRAGMA foreign_key_check` before each commit;
- refuses a database that has a migration this build does not know (it was
  migrated by a newer build) and a migration whose content changed.

Writing a migration:

- Do not put `BEGIN`, `COMMIT` or `PRAGMA foreign_keys` in the file: the runner
  owns the transaction, and the pragma has no effect inside one.
- `ALTER TABLE` adds, renames and drops columns. To change a type, a CHECK or a
  primary key, rebuild the table: `CREATE TABLE x_new`, `INSERT INTO x_new SELECT`,
  `DROP TABLE x`, `ALTER TABLE x_new RENAME TO x`, then recreate its indexes.
  Foreign keys are off during the runner, so the `DROP TABLE` does not cascade.
- Types follow `0000_inicial.sql`: ISO-8601 UTC text for timestamps, `YYYY-MM-DD`
  text for days, JSON as text with a `json_valid`/`json_type` CHECK, 0/1 integers
  for booleans. A CHECK cannot use a subquery.
- Large backfills go in batches, outside a single huge transaction.
- Test it with a temporary file: migrate to N-1, insert data, migrate to N
  (`migrateDatabase(db, { migrations })` accepts a prefix of the list).

## Auth database (PostgreSQL)

The Auth schema is under `apps/auth/src/db/schema.ts` and migrations are stored
in `apps/auth/drizzle/`.

```bash
pnpm --filter @repo/auth run db:generate
pnpm --filter @repo/auth run db:migrate
```

For a local database, start PostgreSQL first with `pnpm compose:up`.
Worktree-specific databases and ports are provisioned by the worktree scripts;
do not replace their generated `.env.local` values manually.

Apply Auth migrations with `AUTH_DATABASE_MIGRATION_URL`, never with the
runtime credential `AUTH_DATABASE_URL`. For permissions, readiness checks, and
rollback, read `docs/runbook/auth-database.md`.

## Non-negotiable rule

Never edit a migration that has already been applied in a shared environment.
Create a new migration instead. The API runner refuses a changed file by its
checksum; the Auth tables track filenames, so rewriting an existing file there
creates drift rather than applying the change again.
