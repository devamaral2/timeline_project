# Repository Guide

- `apps/web`: browser interface for the timeline and event management.
- `apps/mobile`: mobile interface for the same personal tracking experience.
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
