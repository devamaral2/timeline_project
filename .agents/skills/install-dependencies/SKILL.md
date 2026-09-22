---
name: install-dependencies
description: Install, add, or repair dependencies in this pnpm monorepo.
---

# Install dependencies

Use `pnpm` from the repository root. The declared version is in the root
`package.json` (`pnpm@11.24.0`). Prefer `corepack pnpm` so the repository's
package-manager version is used.

## Install or repair

```bash
corepack pnpm install --frozen-lockfile
```

Use `--frozen-lockfile` for reproducible installs. If the manifest changed,
update the lockfile deliberately with `corepack pnpm install`, then run the
frozen install again.

## Add a dependency

Add it to the workspace that owns the code, not the repository root:

```bash
corepack pnpm --filter @repo/api add <package>
```

Use the appropriate workspace filter (`@repo/web`, `@repo/mobile`,
`@repo/auth`, or a package under `packages/`). Commit the corresponding
manifest and `pnpm-lock.yaml` changes.

## Common failures

- `ERR_PNPM_IGNORED_BUILDS`: inspect `allowBuilds` in `pnpm-workspace.yaml`.
  Allow only packages that genuinely need install scripts; do not enable every
  package.
- Lockfile or resolution errors: run the install from the root and check that
  `package.json` and `pnpm-lock.yaml` describe the intended change.
- Missing or broken generated dependencies: confirm the exact workspace and
  package-manager version before repairing anything.

Do not delete source files, manifests, or `pnpm-lock.yaml` to fix an install.
`node_modules` is generated and may be recreated only after the cause is
understood.

## Verify

After dependency changes, run the affected workspace's checks:

```bash
corepack pnpm --filter <workspace> typecheck
corepack pnpm --filter <workspace> build
```

Run the focused test command when behavior changed:

```bash
corepack pnpm run --silent test:unit:ai
```

Stop when installation succeeds and the affected checks pass. Report warnings
separately from actual installation failures, and do not upgrade unrelated
dependencies.
