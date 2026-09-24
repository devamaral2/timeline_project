# Banco do Auth

## Credenciais

O serviço usa duas credenciais distintas no mesmo banco:

| Variável | Papel | Para quê |
| --- | --- | --- |
| `AUTH_DATABASE_MIGRATION_URL` | dono do schema | aplicar DDL |
| `AUTH_DATABASE_URL` | `auth_runtime` | ler e escrever as tabelas em produção |

A credencial de runtime não é dona do schema: ela lê e escreve as tabelas, mas
não executa DDL.

## Aplicar migrations

1. Faça backup e confirme para qual banco `AUTH_DATABASE_MIGRATION_URL` aponta.
2. Rode:

   ```bash
   pnpm --filter @repo/auth run db:migrate
   ```

3. Se o banco é novo, aplique as permissões de runtime:

   ```bash
   psql "$AUTH_DATABASE_MIGRATION_URL" -f apps/auth/ops/grant-runtime.sql
   ```

   Ajuste `public` e `auth_runtime` no arquivo quando o schema ou o papel forem
   outros.
4. Suba o serviço e confirme:

   ```bash
   curl -fsS http://127.0.0.1:3002/health/ready
   curl -fsS http://127.0.0.1:3002/.well-known/jwks.json
   ```

O comando aplica os arquivos de `apps/auth/drizzle/` em ordem, pulando o que já
consta em `applied_migrations` (dentro do schema `drizzle`). **Rodar de novo é
seguro**: sem nada pendente, ele não faz nada. Cada arquivo roda na própria
transação, junto com o registro de que foi aplicado.

## Sinais de que algo está errado

- `GET /health/ready` responde **503**: ou o banco está fora, ou o schema está
  atrás do código. `auth_schema_meta.version` precisa bater com
  `AUTH_SCHEMA_VERSION` (`apps/auth/src/db/readiness.ts`). Rode `db:migrate`.
- `GET /health/ready` responde 503 com o schema correto: não há chave de
  assinatura ativa. Veja o runbook de rotação de chave.
- Erro de permissão em runtime (`permission denied for table ...`): o passo 3
  nunca rodou neste banco. Desde a migração `0005` o `grant-runtime.sql` também
  define `ALTER DEFAULT PRIVILEGES`, então tabelas criadas por migrações
  posteriores já nascem acessíveis ao `auth_runtime` — rode o arquivo uma vez e
  o problema não volta.

## O que não fazer

- Não rode migrations com a credencial de runtime.
- Não edite uma migration já aplicada em qualquer ambiente compartilhado. Gere
  outra em cima dela — `applied_migrations` registra o nome do arquivo, e
  reescrever o conteúdo dele não reaplica nada.

## Rollback

Cada migração tem o par em `apps/auth/drizzle/rollback/`. Aplique o `.down.sql`
correspondente com a credencial de migração e apague a linha de
`applied_migrations`:

```bash
psql "$AUTH_DATABASE_MIGRATION_URL" -f apps/auth/drizzle/rollback/0002_authentication_sessions.down.sql
psql "$AUTH_DATABASE_MIGRATION_URL" -c "DELETE FROM drizzle.applied_migrations WHERE filename = '0002_authentication_sessions.sql'"
```
