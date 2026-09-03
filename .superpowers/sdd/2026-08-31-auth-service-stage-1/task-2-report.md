# Task 2 report — Bootstrap validated service configuration

## Scope

Implemented only Task 2 for `apps/auth`: closed runtime/migration/test
configuration, fixed security policy, the Nest process shell, immutable request
context, live health endpoint, safe exception mapping, real HTTP E2E support,
and documented auth environment variables. No database, migration, Twilio
transport, CORS, or cookie behavior was introduced.

## RED evidence

The configuration matrix was written first and run before the new API existed.

```text
npm run --silent test:ai apps/auth/src/config/env.test.ts
exit 1
FAIL ... TypeError: loadRootEnv is not a function
6 of 9 tests failed
```

This proves the matrix was exercising the missing loader/API rather than an
already implemented path.

After the environment implementation reached GREEN, the real Nest shell E2E
test was added and run before its test helper, module, middleware, and filter
existed.

```text
npm run --silent test:ai apps/auth/src/http/http-shell.e2e.test.ts
exit 1
FAIL ... Failed to load url ../testing/create-test-app
1 failure outside of tests (0 tests collected)
```

The failure identifies the missing production/test shell boundary that the E2E
test requires.

## GREEN evidence

Focused checks after the implementation:

```text
npm run --silent test:ai apps/auth/src/config/env.test.ts
Tests pass

npm run --silent test:ai apps/auth/src/http/http-shell.e2e.test.ts
Tests pass

pnpm --filter @repo/auth run typecheck
$ tsc -p tsconfig.json --noEmit
```

The full required runner was also executed after the implementation:

```text
npm run --silent test:ai
Tests pass
```

## Delivered behavior

- `loadRootEnv` applies shell > `.env.local` > `.env` precedence without
  mutating the caller's process environment.
- `getRuntimeEnv` reads only runtime keys, validates a canonical 32-byte
  Base64URL KEK, isolates migration/test credentials, and enforces local-only
  fake OTP, complete Twilio credentials, fixed limits, and disabled WhatsApp.
- `SECURITY_POLICY` holds all fixed token, attempt, recovery, key-retirement,
  and 32 KiB body limits.
- `AppModule.forRoot(env)` supplies clock/secret-generator seams and the health
  controller. `main.ts` parses configuration before creating Nest providers.
- The HTTP shell disables `x-powered-by`, sets immutable socket-derived request
  context, preserves only valid correlation IDs, uses the 32 KiB JSON parser,
  and returns the frozen safe error taxonomy.
- The real E2E suite proves liveness, generic 404 behavior, correlation
  propagation/replacement, socket IP precedence over `X-Forwarded-For`, and
  safe 413 handling.

## Files changed

- Added configuration loader, validated environment contract, security policy,
  and environment matrix tests under `apps/auth/src/config`.
- Added Nest module/main, clock, secret generator, health controller, request
  middleware, exception filter, E2E helper, and E2E test.
- Updated immutable `RequestContext` and `.env.example`.

## Scope and self-review

- Runtime configuration never reads `AUTH_DATABASE_MIGRATION_URL`; migrations
  require their own URL and test DB credentials are rejected outside test mode.
- The KEK parser rejects padding, non-URL-safe encodings, and any byte length
  other than 32.
- No Twilio SDK/call, database connection/migration, CORS setup, cookie parser,
  or lockfile/workspace-file edit was added.
- `pnpm-lock.yaml` and `vitest.workspace.ts` were already modified and are left
  unstaged/uncommitted as required.

## Fix round 1

- RED: the workspace-root test initially failed because it imported the new
  resolver from `env.ts` instead of its owning `load-env.ts`; after correcting
  that test seam, it proves a process started in `apps/auth` loads root `.env`.
- GREEN: `env.test.ts`, `http-shell.e2e.test.ts`, auth typecheck, and the full
  official suite passed. `main.ts` resolves the monorepo root from `__dirname`;
  generic HTTP 429 responses now include `Retry-After: 1`.
