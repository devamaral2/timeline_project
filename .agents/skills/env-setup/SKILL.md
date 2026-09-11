---
name: env-setup
description: >
  Configura ou depura variaveis de ambiente deste monorepo — .env/.env.local
  na raiz, acesso do app mobile a um dispositivo fisico, chaves do Firebase
  compartilhadas entre web e mobile, e pnpm env:pull. Use quando for testar o
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

## Testar o app mobile num aparelho fisico

O celular nao alcanca o loopback da sua maquina. Dois ajustes no `.env` (nao
`.env.local` — isso muda o bind do servidor, nao e um segredo):

1. `API_HOST=0.0.0.0` — o Nest passa a escutar na rede local e liga o CORS
   (`apps/api/src/main.ts`). Sem isso o bind continua em `127.0.0.1`, que e o
   comportamento de producao.
2. `MOBILE_API_URL=http://<ip-da-sua-maquina>:3001` — o mobile nao tem o
   rewrite do Next, fala direto com o Nest.

## Firebase compartilhado

O mobile reusa as chaves `NEXT_PUBLIC_FIREBASE_*` do web: e o mesmo projeto e
o mesmo app client — nao crie variaveis `MOBILE_FIREBASE_*` separadas. Tudo
que entra em `extra` (`apps/mobile/app.config.ts`) vai embutido no bundle —
nao coloque la nada que ja nao seja publico.

## Portas por worktree

`WEB_PORT`, `PORT`, `AUTH_PORT`, `METRO_PORT` e `POSTGRES_HOST_PORT` numa
worktree secundaria sao geradas automaticamente por `scripts/worktree/` — veja
a skill `worktree-app-testing`. Nao edite essas portas a mao la; se precisar
recalcula-las, rode `pnpm worktree:provision` de novo.
