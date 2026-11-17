# Repository Guide

- `apps/web`: browser interface for the timeline and task management.
- `apps/mobile`: Android native app (Kotlin + Compose) that mirrors the web experience.
- `apps/api`: business use cases and the HTTP API for tasks, artifacts, recurrences, and AI requests.
- `apps/auth`: identity gateway handling sign-in, sessions, access, and roles.
- `packages/contracts`: shared data contracts and types.
- `packages/timeline`: shared date windows, grouping, and timeline calculations.
- `packages/theme`: shared visual tokens and colors.

Use `pnpm` from the repository root. Common commands: `pnpm install`, `pnpm dev`, `pnpm build`, and `pnpm test`.
Create an isolated worktree with `pnpm worktree:new <caminho> -b <branch>`.
Toda criação de worktree DEVE seguir esse comando e não pode pular nenhum passo
(`scripts/worktree/provision-env.sh`): alias `<worktree>.braid.local` (Caddy +
`/etc/hosts`), `node_modules` íntegros, bases `<worktree>` e `<worktree>_auth` no
Postgres compartilhado (porta 54391), migrations, usuário `admin@admin.com`
(senha `ADMIN_PASSWORD`) e servidores de dev no ar. Ao final, informe o link `https://<worktree>.braid.local:8443`.
Remova com `pnpm worktree:teardown <caminho>`. Pré-requisitos únicos por máquina:
`sudo bash scripts/worktree/hosts-install.sh` e `pnpm caddy:trust` (confia na CA local do
Caddy; o alias sai em HTTPS porque o navegador só libera geolocalização em origem segura).
Run development commands from the root, not from an individual app directory.

## Paridade web ↔ mobile

O app Android (`apps/mobile`) repercute a experiência mobile do web
(`apps/web`). Toda mudança visível ao usuário em `apps/web` — tela, fluxo,
campo, texto, cor ou comportamento — precisa da mudança equivalente em
`apps/mobile`, no mesmo PR ou num PR vinculado, e de uma linha atualizada em
`docs/mobile-parity.md`.

Mudanças em `packages/contracts` ou `packages/theme` exigem rodar os testes de
contrato do mobile (`pnpm --filter @repo/mobile run test`).

O CI roda o job `mobile` (lint, testes com o gerador de fixtures e APK de debug como
artifact `braid-mobile-debug`) nos pull requests que mudam `apps/mobile`,
`packages/contracts`, `packages/timeline`, `packages/theme`, `scripts/mobile` ou o que o
gerador de fixtures importa do web (`apps/web/src/lib/**`, as pastas de
componentes `agenda`, `detail`, `hub`, `shell`, `task-detail`, `tasks` e `ui`, e
`styles/globals.css`). Acrescentar um import de outra pasta do web em
`scripts/mobile` pede acrescentá-la ao filtro `changes` de `.github/workflows/ci.yml`.
Os demais jobs do monorepo excluem `@repo/mobile`.

Para qualquer mudança em `apps/mobile`, carregue `.agents/skills/kotlin-android/SKILL.md`;
ela documenta as camadas, o procedimento de paridade e a validação Android.
