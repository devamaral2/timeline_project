# Banco do Auth

O serviço usa duas credenciais distintas: `AUTH_DATABASE_MIGRATION_URL` para
aplicar DDL e `AUTH_DATABASE_URL` para a aplicação. A credencial runtime não
deve ser dona do schema.

1. Faça backup e confirme a URL de migração no ambiente alvo.
2. Execute `pnpm --filter @repo/auth run db:migrate`.
3. Aplique `apps/auth/ops/grant-runtime.sql`, ajustando schema e role quando o
   banco não usa `public` e `auth_runtime`.
4. Suba o serviço e confirme `GET /health` e `GET /.well-known/jwks.json`.

Não execute migrations com a credencial runtime. Ela só precisa ler e escrever
as tabelas de produto e inserir em `audit_log`; esse log é append-only.
