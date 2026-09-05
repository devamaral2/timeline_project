---
name: auth-postgres-tests
description: Roda a suite de integracao do apps/auth (repositorios e e2e HTTP) contra Postgres de verdade em vez de skip silencioso. Use quando pedirem para rodar/validar os testes de auth, mexerem em repository/e2e de apps/auth, ou quando "Tests pass" precisar provar que a integracao realmente rodou.
---

# Testes de auth contra Postgres real

Sem `AUTH_TEST_DATABASE_URL`, a maior parte da suite do `apps/auth` (integracao
de repositorio e os e2e de HTTP) pula sozinha — e `npm run --silent test:ai`
ainda imprime `Tests pass`, o que mascara um skip como sucesso.

Passos, sempre nesta ordem:

1. Subir o Postgres de teste:
   ```bash
   docker compose -f apps/auth/compose.test.yaml up -d --wait
   ```
2. Rodar a suite com as duas variaveis, na mesma invocacao:
   ```bash
   AUTH_TEST_DATABASE_URL=postgresql://auth_test:auth_test@127.0.0.1:55432/timeline_auth_test AUTH_REQUIRE_POSTGRES_TESTS=true npm run --silent test:ai
   ```

`AUTH_REQUIRE_POSTGRES_TESTS=true` e obrigatorio, nao opcional: e o que
transforma um teste pulado (skip) em falha, garantindo que rodou de verdade.
Rodar so com `AUTH_TEST_DATABASE_URL` e sem essa flag ainda deixa passar skip
silencioso caso a URL esteja errada ou o container nao tenha subido a tempo.

Se precisar investigar uma falha alem do primeiro erro, use `npm test` (saida
completa) ou filtre por workspace: `npx vitest run --project auth`.

Nao suba o Postgres de teste em paralelo com outro rodando na mesma porta
(`55432`) nem reaproveite o container do `infra/docker-compose.local.yml` —
sao bancos diferentes.
