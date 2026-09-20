# Worktrees paralelas

Varios agentes ou desenvolvedores podem trabalhar ao mesmo tempo em worktrees
diferentes do mesmo repo. Sem isolamento, todo mundo compartilha o mesmo
`.env`/`.env.local` da raiz — mesma porta de web, api, auth e o mesmo
Postgres — e a segunda worktree que tentar subir a app colide com a primeira.

Os scripts em `scripts/worktree/` resolvem isso dando a cada worktree
secundaria seu proprio `.env.local` (portas escolhidas na hora, testando bind
real em `127.0.0.1`) e seu proprio container Postgres, isolado pelo nome do
projeto do Docker Compose (`COMPOSE_PROJECT_NAME=timeline-<slug>`). Dentro
desse Postgres da worktree, a API e o Auth usam bases separadas
(`POSTGRES_DB` e `AUTH_POSTGRES_DB`), mas a mesma credencial admin — nao
replicamos a separacao de papeis de producao (`auth_runtime`, ver
`docs/runbooks/auth-database.md`) porque esses bancos sao descartaveis e
locais.

A worktree principal (a original, nao uma criada com `git worktree add`)
nunca e tocada por estes scripts. Todas as worktrees resolvem os segredos no
inicio dos comandos usando `OP_SERVICE_ACCOUNT_TOKEN` e `OP_ENVIRONMENT_ID`; veja o
runbook de 1Password.

## Antes

- Docker rodando (`docker info` sem erro).
- O shell precisa ter `OP_SERVICE_ACCOUNT_TOKEN` e `OP_ENVIRONMENT_ID` configurados.
- O Environment precisa conter `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`,
  além das demais variáveis do `.env.example`.
- `WEB_PORT`, `METRO_PORT` e `AUTH_POSTGRES_DB` são gerados localmente pelo
  provisionamento e não precisam existir no Environment.

## Executar

Criar uma worktree nova (repassa os argumentos direto para
`git worktree add`, entao aceita `-b` para branch nova, um branch existente,
etc.):

```bash
pnpm worktree:new .worktrees/minha-feature -b minha-feature
```

Isso roda `pnpm install`, calcula portas livres, sobe o Postgres da worktree,
cria a base do auth, aplica as migrations de `@repo/api` e de
`@repo/auth`, e builda os pacotes (`pnpm turbo run build`) para o primeiro
`pnpm dev` ser rapido.

Se a worktree ja existe mas ainda nao foi provisionada (ou o container
Postgres dela parou, por exemplo depois de reiniciar a maquina), rode de
dentro dela:

```bash
pnpm worktree:provision
```

E idempotente: se o ambiente ja esta provisionado e o Postgres dela ja esta
rodando, so garante que as migrations e o build estao em dia, sem trocar as
portas por baixo de processos que ja estejam de pe.

Para subir os servidores dentro da worktree, use os scripts de sempre
(`pnpm dev:web`, `pnpm dev:api`, `pnpm dev:auth`, `pnpm dev`) — eles resolvem o
Environment e aplicam os overrides de portas da própria worktree. Veja a skill
`worktree-app-testing` para o fluxo completo de testar a app rodando.

## Verificar

```bash
grep -E '^(WEB_PORT|API_PORT|AUTH_PORT|METRO_PORT|POSTGRES_HOST_PORT|COMPOSE_PROJECT_NAME)=' .env.local
docker compose --project-name "$(grep COMPOSE_PROJECT_NAME .env.local | cut -d= -f2)" \
  -f infra/docker-compose.local.yml ps
```

O Postgres deve aparecer `healthy` e as portas devem ser diferentes das de
qualquer outra worktree ativa (`docker ps` lista todos os containers de
todas as worktrees ao mesmo tempo).

## O que nao fazer

- Nao rode os scripts de worktree na worktree principal (o proprio
  `provision-env.sh` recusa, a menos que voce force com `FORCE_MAIN=1` — e
  mesmo assim so faca isso sabendo que vai sobrescrever o `.env.local` que ja
  esta configurado la).
- Nao assuma portas fixas (3000/3001/3002/54391) fora da worktree principal.
- Nao apague a worktree com `rm -rf` — use
  `pnpm worktree:teardown .worktrees/minha-feature`, que derruba o container
  e o volume do Postgres antes de remover a worktree do `git worktree list`.
  `rm -rf` direto deixa o container e o volume orfaos.

## Emergencia: portas presas ou container orfao

Se um `teardown` foi pulado (worktree apagada manualmente) e sobrou um
container Postgres orfao ocupando uma porta:

```bash
docker ps --filter "name=timeline-" 
docker compose --project-name timeline-<slug> -f infra/docker-compose.local.yml down -v
```
