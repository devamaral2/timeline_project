---
name: install-dependencies
description: Install or repair dependencies for this pnpm monorepo, including workspace additions, lockfile validation, and pnpm build-script policy errors.
---

# Install dependencies

Use this skill when installing, repairing, or adding dependencies in this
repository.

## Required workflow

- Run commands from the repository root.
- Read the root `package.json` and confirm its `packageManager` field before
  installing.
- This repository uses pnpm workspaces. Use `corepack pnpm` (or the declared
  pnpm version), never `npm install` or `npm i`.
- For a normal reproducible install, run:

  `corepack pnpm install --frozen-lockfile`

- For a new dependency, add it to the owning workspace, not the root. For
  example:

  `corepack pnpm --filter @repo/api add <package>`

  Re-run the frozen install after the manifest and lockfile change.

## Known failure modes

- If npm reports `Cannot read properties of null (reading 'matches')` from
  `@npmcli/arborist`, treat it as npm trying to consume pnpm's
  `node_modules/.pnpm` layout. Do not migrate the repository to npm or create
  a competing `package-lock.json`; use pnpm from the root instead.
- If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, inspect the `allowBuilds` policy in
  `pnpm-workspace.yaml`. Optional packages that must not run install scripts
  should be listed there with `false`; packages that need native generation
  should be explicitly allowed with `true`. Do not approve every package.
- Never delete source files, lockfiles, or the whole workspace to repair an
  install. `node_modules` is generated and may be recreated only after the
  exact cause and target are confirmed.

## Verification

After installation or dependency changes:

- Confirm the lockfile is clean and the target package resolves the new
  module.
- Run the affected workspace's `typecheck` and `build` scripts.
- For repository-wide confidence, use the documented root test command:
  `npm run --silent test:ai`.
- Report any deprecation or peer-dependency warnings separately from actual
  installation failures.

Stop once installation succeeds and the affected workspace passes its focused
checks; do not upgrade unrelated dependencies.
