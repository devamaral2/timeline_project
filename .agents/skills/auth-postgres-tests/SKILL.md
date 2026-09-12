---
name: auth-postgres-tests
description: Roda a suite de integracao do apps/auth (repositorios e e2e HTTP) contra Postgres de verdade em vez de skip silencioso. Use quando pedirem para rodar/validar os testes de auth, mexerem em repository/e2e de apps/auth, ou quando "Tests pass" precisar provar que a integracao realmente rodou.
---

# Testes de auth contra Postgres real

Sem `AUTH_TEST_DATABASE_URL`, a maior parte da suite do `apps/auth` (integracao
de repositorio e os e2e de HTTP) pula sozinha — e `npm run --silent test:ai`
ainda imprime `Tests pass`, o que mascara um skip como sucesso.

O container e isolado por worktree, do mesmo jeito que `scripts/worktree/`
isola o Postgres de dev (`docs/runbooks/worktrees.md`): projeto de Compose
proprio (`timeline-auth-test-<slug>`) e uma porta livre calculada na hora, em
vez da porta fixa `55432`. Sem isso, duas worktrees rodando esta skill ao
mesmo tempo colidem — mesmo nome de projeto (o Compose deriva o nome do
diretorio `apps/auth`, igual em toda worktree) e a mesma porta de host.

Passos, sempre nesta ordem:

1. Subir o Postgres de teste com projeto e porta isolados por worktree:
   ```bash
   source scripts/worktree/lib.sh
   AUTH_TEST_POSTGRES_PROJECT="timeline-auth-test-$(worktree_slug)"
   export AUTH_TEST_POSTGRES_HOST_PORT="$(find_free_port 55432)"
   docker compose --project-name "$AUTH_TEST_POSTGRES_PROJECT" \
     -f apps/auth/compose.test.yaml up -d --wait
   ```
2. Rodar a suite com as duas variaveis, na mesma invocacao, lendo a porta
   escolhida acima em vez de assumir `55432`:
   ```bash
   AUTH_TEST_DATABASE_URL="postgresql://auth_test:auth_test@127.0.0.1:${AUTH_TEST_POSTGRES_HOST_PORT}/timeline_auth_test" \
     AUTH_REQUIRE_POSTGRES_TESTS=true npm run --silent test:ai
   ```

`AUTH_REQUIRE_POSTGRES_TESTS=true` e obrigatorio, nao opcional: e o que
transforma um teste pulado (skip) em falha, garantindo que rodou de verdade.
Rodar so com `AUTH_TEST_DATABASE_URL` e sem essa flag ainda deixa passar skip
silencioso caso a URL esteja errada ou o container nao tenha subido a tempo.

Se precisar investigar uma falha alem do primeiro erro, use `npm test` (saida
completa) ou filtre por workspace: `npx vitest run --project auth`.

Ao terminar, derrube o container com o mesmo `--project-name` usado para
subi-lo (`docker compose --project-name "$AUTH_TEST_POSTGRES_PROJECT" -f
apps/auth/compose.test.yaml down -v`) — sem isso ele fica rodando e ocupando
a porta entre sessoes. Nao reaproveite o container do
`infra/docker-compose.local.yml` para isto: sao bancos diferentes.
