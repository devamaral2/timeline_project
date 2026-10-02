# Repository Guide

- `apps/web`: browser interface for the timeline and event management.
- `apps/mobile`: Android native app (Kotlin + Compose) that mirrors the web experience.
- `apps/api`: business use cases and the HTTP API for events, notes, tasks, and recurrences.
- `apps/auth`: identity gateway handling sign-in, sessions, access, and roles.
- `packages/contracts`: shared data contracts and types.
- `packages/timeline`: shared date windows, grouping, and timeline calculations.
- `packages/theme`: shared visual tokens and colors.
- `packages/entities`: shared domain entities and DTOs.
- `packages/persistence`: database schemas, migrations, repositories, and persistence queries.

Use `pnpm` from the repository root. Common commands: `pnpm install`, `pnpm dev`, `pnpm build`, and `pnpm test`.
Create an isolated worktree with `pnpm worktree:new`.
Run development commands from the root, not from an individual app directory.

## Paridade web ↔ mobile

O app Android (`apps/mobile`) repercute a experiência mobile do web
(`apps/web`). Toda mudança visível ao usuário em `apps/web` — tela, fluxo,
campo, texto, cor ou comportamento — precisa da mudança equivalente em
`apps/mobile`, no mesmo PR ou num PR vinculado, e de uma linha atualizada em
`docs/mobile-parity.md`.

Mudanças em `packages/contracts` ou `packages/theme` exigem rodar os testes de
contrato do mobile (`pnpm --filter @repo/mobile run test`).

Para qualquer mudança em `apps/mobile`, carregue `.agents/skills/kotlin-android/SKILL.md`;
ela documenta as camadas, o procedimento de paridade e a validação Android.
