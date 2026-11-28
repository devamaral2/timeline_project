# Banco do Auth

O auth guarda tudo num arquivo SQLite ([ADR 0025](../adr/0025-auth-em-sqlite.md)), sobre o mesmo cliente da API
(`packages/sqlite`).

| Onde | Arquivo |
| --- | --- |
| Produção | `/data/auth.sqlite`, no volume `auth-data` do pod `auth` |
| Worktree local | `.data/auth.sqlite`, na raiz da worktree |
| Outro caminho | `AUTH_DATABASE_PATH` |

Não há credencial de banco: o acesso ao arquivo é o acesso ao volume. O servidor e os CLIs (`create-admin`,
`rotate-signing-key`, `device-key`, `password:update`, `cleanup-auth-data`) abrem o mesmo arquivo; o `BEGIN IMMEDIATE`
faz uma escrita esperar a outra, inclusive entre processos.

## Migrations

O auth aplica as migrations pendentes ao abrir o banco, depois de copiar o arquivo para
`<arquivo>.antes-de-<migration>.sqlite`. Em produção isso acontece a cada subida do pod; não há passo de migração no
deploy. Para rodar sem subir o servidor:

```bash
pnpm --filter @repo/auth run db:migrate
```

Os arquivos ficam em `apps/auth/migrations/` e seguem as regras de `.agents/skills/db-migrations/SKILL.md`. Cada
migration nova sobe `auth_schema_meta.version` e `AUTH_SCHEMA_VERSION` (`apps/auth/src/db/readiness.ts`) juntos; o
deploy confere os dois com `ops/production/check-auth-schema.sh`.

## Virada do Postgres para o SQLite

Uma vez, no primeiro deploy com o auth em SQLite, o `deploy-release.sh` faz sozinho:

1. o pod novo do auth sobe com o arquivo vazio, cria uma chave de assinatura e fica pronto;
2. enquanto o Service `postgres` existir e o arquivo não tiver usuários, roda
   `node apps/auth/dist/db/copy-from-postgres.cli.js --url-from-stdin` dentro do pod, com a URL do dono do banco
   `braid_auth` pela entrada padrão;
3. reinicia o auth.

A cópia traz usuários (com o hash da senha), papéis, permissões, chaves de dispositivo, chaves de assinatura (troca a
chave criada no passo 1: os tokens já emitidos continuam válidos) e a auditoria. Sessões, refresh tokens, convites e
contadores de tentativa ficam de fora: todo mundo faz login de novo, e um convite em aberto é reemitido. É uma
transação só, conferida tabela a tabela; um arquivo que já tem usuários é recusado sem gravar nada.

Para refazer à mão (por exemplo, numa worktree, do Postgres local para `.data/auth.sqlite`):

```bash
rm -f .data/auth.sqlite*   # só se o arquivo pode ser descartado
pnpm secrets:exec -- pnpm --filter @repo/auth run db:copy-from-postgres
```

## Sinais de que algo está errado

- `GET /health/ready` responde **503**: o arquivo não abriu, o schema não bate com `AUTH_SCHEMA_VERSION`, ou não há
  chave de assinatura ativa (veja o runbook de rotação de chave).
- O pod não sobe e o log diz `The database was migrated by a newer build`: uma imagem mais antiga abriu um arquivo que
  uma mais nova migrou. Volte para a imagem nova ou restaure a cópia `antes-de-*`.
- `database is locked` depois de 5 s: outro processo segura uma transação longa no mesmo arquivo. Veja se há um CLI
  parado no meio.

## Backup e restauração

O `backup.sh` copia o arquivo com o banco no ar (`VACUUM INTO`), confere `PRAGMA integrity_check` e o guarda no pacote
cifrado como `auth.sqlite`. Nunca copie o `.sqlite` e o `-wal` soltos. Para restaurar, pare o auth
(`kubectl -n braid scale deployment/auth --replicas=0`), ponha a cópia em `/data/auth.sqlite` no volume, apague
`auth.sqlite-wal` e `auth.sqlite-shm` e suba de novo.

## O que não fazer

- Não edite uma migration já aplicada: o migrador recusa o arquivo pelo checksum. Faça outra em cima dela.
- Não aponte dois pods para o mesmo volume: o deployment é `Recreate` de propósito.
- Não ponha o arquivo em sistema de arquivos de rede: o SQLite em WAL não funciona nele.
