---
name: env-setup
description: >
  Configura ou depura variaveis de ambiente deste monorepo — .env/.env.local
  na raiz, os hosts do apps/auth vistos pela API, pelo web e pelo mobile,
  acesso do app mobile a um dispositivo fisico, e pnpm env:pull. Use quando for testar o
  app mobile num aparelho de verdade, quando uma variavel nova precisar ser
  adicionada, ou quando um app subir sem os envs esperados.
---

## Como o env e carregado

Um unico `.env`/`.env.local` na raiz serve os tres apps — nao existe `.env`
por workspace. Cada app tem seu proprio loader que sobe ate a raiz do
monorepo: `apps/api/src/config/load-env.ts`, o topo de
`apps/web/next.config.ts`, e `apps/mobile/app.config.ts` (que repassa os
valores ao app pelo campo `extra`, lido em `apps/mobile/src/config/env.ts`).
`.env.local` tem precedencia sobre `.env`. Rodar um comando de dev de dentro
de `apps/*` (em vez da raiz) pula esse carregamento e a aplicacao sobe sem os
envs corretos.

`pnpm env:pull` baixa o `.env.local` do 1Password (`op read`) para a raiz —
use quando faltar segredo local.

## Onde cada app encontra o apps/auth

Duas variaveis, porque ha dois pontos de vista:

- `AUTH_SERVICE_URL` — o host do `apps/auth` visto **de dentro do servidor**.
  O `apps/api` chama `GET /auth/me` nele a cada requisicao autenticada
  (`apps/api/src/config/env.ts`), e o `apps/web` usa o mesmo host para o
  rewrite de `/auth/*` (`apps/web/next.config.ts`) e para os route handlers de
  `/api/session/*` (`apps/web/src/lib/session/auth-service.ts`). Default
  `http://127.0.0.1:3002`, o `AUTH_PORT` padrao. O rewrite e congelado no
  `next build`, mas os route handlers leem a variavel em runtime: no deploy do
  web ela precisa existir nos dois momentos.
- `MOBILE_AUTH_URL` — o host do `apps/auth` visto **pelo celular**, que fala
  direto com ele para login, refresh e logout
  (`apps/mobile/src/config/mobile-env.ts`). Obrigatoria, sem default: como o
  `MOBILE_API_URL`, num aparelho fisico e o IP da maquina na rede local.

Numa worktree secundaria as duas sao reescritas com a porta do `apps/auth`
dela por `scripts/worktree/provision-env.sh`.

## Testar o app mobile num aparelho fisico

O celular nao alcanca o loopback da sua maquina. Tres ajustes no `.env` (nao
`.env.local` — isso muda o bind do servidor, nao e um segredo):

1. `API_HOST=0.0.0.0` — o Nest passa a escutar na rede local e liga o CORS
   (`apps/api/src/main.ts`). Sem isso o bind continua em `127.0.0.1`, que e o
   comportamento de producao.
2. `AUTH_HOST=0.0.0.0` — a mesma coisa para o `apps/auth`, que tambem nasce
   preso ao loopback.
3. `MOBILE_API_URL=http://<ip-da-sua-maquina>:3001` e
   `MOBILE_AUTH_URL=http://<ip-da-sua-maquina>:3002` — o mobile nao tem o
   rewrite do Next, fala direto com o Nest e com o `apps/auth`.

Tudo que entra em `extra` (`apps/mobile/app.config.ts`) vai embutido no bundle
— nao coloque la nada que ja nao seja publico. Os dois hosts sao.

## Portas por worktree

`WEB_PORT`, `PORT`, `AUTH_PORT`, `METRO_PORT` e `POSTGRES_HOST_PORT` numa
worktree secundaria sao geradas automaticamente por `scripts/worktree/` — veja
a skill `worktree-app-testing`. Nao edite essas portas a mao la; se precisar
recalcula-las, rode `pnpm worktree:provision` de novo.
