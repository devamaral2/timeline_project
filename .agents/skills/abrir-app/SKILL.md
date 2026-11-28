---
name: abrir-app
description: Sobe web, API e auth da worktree atual e abre a app no Browser pane do Claude já logada como admin@admin.com, com a senha ADMIN_PASSWORD do 1Password.
disable-model-invocation: true
---

# Abrir a app logada

O trabalho está em `pnpm app:open` (`scripts/worktree/open-app.sh`); esta skill roda, abre e confere.

1. **Rodar** pela raiz da worktree atual, com timeout de 5 minutos (a primeira subida do `pnpm dev`
   demora): `pnpm --silent app:open`. Concluído quando a saída termina em `APP_URL=…` e
   `LOGIN_URL=…`.
   O script sobe os servidores que faltam (`scripts/worktree/start-dev.sh`) e deixa um servidor de
   login de uso único (`scripts/worktree/login-link.mjs`) que faz o login com a senha do 1Password e
   repassa os cookies da sessão. A senha e os tokens nunca aparecem na saída: não os procure nem os
   imprima.
   Se sair `Esta worktree ainda nao foi provisionada`, rode `pnpm worktree:provision` em segundo
   plano e repita este passo.
2. **Abrir** o `LOGIN_URL` no Browser pane: `preview_start({ url: "<LOGIN_URL>" })`. Ele redireciona
   para o `APP_URL` já com a sessão. O link vale uma visita, por 5 minutos; se ele já foi usado ou
   expirou, repita o passo 1.
3. **Conferir** com `read_page` que a página saiu da tela de login (sem os campos "E-mail" e
   "Senha") e está em `APP_URL/<userId>`. Se o link mostrar `Login de admin@admin.com devolveu
   HTTP …`, relate o status e o fim de `.agents/runtime/dev.log`.
4. **Relatar** o `APP_URL` e que a sessão de admin@admin.com está aberta no Browser pane.

O alias `https://<worktree>.braid.local:8443` é outra origem e não recebe esses cookies; esta skill
usa sempre `localhost`.
