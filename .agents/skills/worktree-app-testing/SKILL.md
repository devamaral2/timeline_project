---
name: worktree-app-testing
description: >
  Sobe web/api/auth de verdade, com portas e banco Postgres isolados da
  worktree atual, para validar uma mudanca manualmente (curl, Browser pane,
  screenshots) em vez de so rodar a suite de testes unitarios. Use sempre que
  for testar uma mudanca rodando a aplicacao de fato neste monorepo,
  especialmente quando varias worktrees/agentes podem estar rodando a app em
  paralelo. Nao use para os testes unitarios do dia a dia (`test:ai`) nem para
  o teste de integracao Postgres do @repo/persistence, que ja isola porta
  sozinho via Testcontainers.
---

## Por que isto existe

Este monorepo tem um unico `.env`/`.env.local` na raiz e, por padrao, portas
fixas (web 3000, api 3001, auth 3002, Postgres 54391). Se varias worktrees
rodarem a app ao mesmo tempo sem isolamento, uma pisa na porta e no banco da
outra. `scripts/worktree/` resolve isso: cada worktree ganha seu proprio
`.env.local` com portas livres calculadas na hora e seu proprio container
Postgres (com uma base para a API e outra para o Auth).

## Passo a passo

1. **Confirme se a worktree atual ja esta provisionada.** Rode:
   ```bash
   grep -q COMPOSE_PROJECT_NAME .env.local 2>/dev/null && echo provisionada || echo nao-provisionada
   ```
   Se `nao-provisionada`, rode `bash scripts/worktree/provision-env.sh` (ou
   `pnpm worktree:provision`) de dentro da worktree. Isso gera o
   `.env.local`, sobe o Postgres da worktree, cria a base do auth, roda as
   migrations e builda os pacotes. Leva um tempo na primeira vez — normal.
   Se voce esta na worktree principal do checkout (a original, nao uma criada
   com `git worktree add`), o script se recusa a rodar de proposito: a
   principal e gerenciada manualmente pelo desenvolvedor, nao por este
   sistema. Nesse caso so use as portas/banco que ja estao configurados la.

2. **Leia as portas desta worktree** direto do `.env.local`:
   ```bash
   grep -E '^(WEB_PORT|API_PORT|AUTH_PORT|POSTGRES_HOST_PORT)=' .env.local
   ```

3. **Suba so o que o teste precisa**, nunca a stack inteira por reflexo.
   Rodando de dentro desta worktree:
   - Mudanca so no frontend que ja tem os dados que precisa: `pnpm dev:web`.
   - Mudanca de API/regra de negocio: `pnpm dev:api` (+ `pnpm dev:web` se o
     teste passa pelo browser).
   - Mudanca que envolve login/sessao/MFA: adicione `pnpm dev:auth`.
   - So use `pnpm dev` (os tres) quando o teste realmente cruza os tres.

   Rode cada comando via Bash com `run_in_background: true` — sao processos
   longos. Depois de rodar, `Bash` com `curl -fsS http://127.0.0.1:$API_PORT/...`
   (ou o health check do servico) e um jeito rapido de confirmar que subiu
   antes de ir para o browser.

4. **Abra o preview na porta certa desta worktree**, lendo a porta calculada do
   `.env.local`. Não use configurações fixas de outro agente, porque elas não
   conhecem a porta desta worktree. Use:
   ```
   preview_start({ url: "http://localhost:<WEB_PORT-desta-worktree>" })
   ```
   Se o teste for so de API, `curl`/`read_network_requests` bastam, sem
   precisar abrir o browser.

5. **Valide de verdade**, nao so "carregou sem erro":
   - Rede: `read_network_requests` para checar status code e payload das
     chamadas relevantes.
   - Console: `read_console_messages` para erros de runtime.
   - Estado da pagina: `read_page`/`get_page_text` em vez de confiar so em
     screenshot.
   - Fluxo completo: use `computer` (clique/type) para reproduzir o caminho
     que a mudanca afeta, nao so a tela inicial.

6. **Ao terminar**, encerre os processos de dev que voce subiu em background
   (nao precisa derrubar o Postgres da worktree — deixar rodando e normal
   entre sessoes de trabalho na mesma worktree). Só rode
   `bash scripts/worktree/teardown.sh <caminho>` quando for remover a
   worktree de vez — isso apaga o container e o volume do Postgres dela.

## O que nao fazer

- Nao rode `scripts/worktree/provision-env.sh` na worktree principal sem
  motivo forte — ela nao foi feita para isso e o script bloqueia por padrao.
- Nao assuma as portas 3000/3001/3002/54391 dentro de uma worktree secundaria
  — elas so valem no checkout principal. Leia sempre do `.env.local` local.
- Nao confunda isto com os testes automatizados (`npm run --silent test:ai`)
  — aquilo continua sendo a forma de rodar a suite Vitest; esta skill e para
  quando o pedido e efetivamente ligar a aplicacao e olhar o comportamento.
