---
name: running-tests
description: Run and diagnose this monorepo's Vitest and Playwright tests, including workspace and file filters.
---

# Running tests

Run commands from the repository root. During normal feature development, use
the quiet unit-test command:

```bash
pnpm run --silent test:unit:ai
```

`test:ai` is an alias for the same unit-test suite. Integration tests and E2E
tests should run only after the corresponding flow is integrated.

## Test commands

```bash
pnpm test:unit                                  # full unit-test output
pnpm run --silent test:unit:ai -- path/to/test  # one unit-test file
pnpm run --silent test:integration:ai -- --project api-integration
pnpm test:e2e                                   # full Playwright output
```

Use `test:integration` for API/Auth integration tests and `test:e2e` for the
full Web → Auth → API flow.

The quiet reporter prints `Tests pass` on success. On failure, it prints the
first failing test and the total number of failures; use the full-output
commands above when more context is needed.

## Workspace behavior

`vitest.workspace.ts` resolves `@repo/*` packages directly from TypeScript
source, so unit tests do not require a build first. Unit-test workspaces are:
`web`, `mobile`, `api`, `auth`, `contracts`, `timeline`, and `theme`.

The `mobile` workspace runs in Node and includes only `*.test.ts`; React Native
component rendering requires a native runtime and is not supported by this
Vitest setup.

When a test fails, first rerun the narrowest relevant file or workspace with
full output. Fix the underlying failure instead of weakening or skipping the
test.
