---
name: e2e-tests
description: Use when adding or changing Playwright scenarios through the real web, Auth, and API chain with external dependencies mocked.
---

# Adding E2E scenarios

- Add `test/e2e/*.e2e.spec.ts`. In `beforeAll`, call `createE2eUserForFile(__filename)`; every file owns a different real Auth user. Keep tests within a file serial if they mutate that user's state. Files may run in parallel. Use a second user to verify ownership boundaries. Call `blockExternalBrowserRequests(page)` in browser scenarios.
- Drive the real UI with Playwright through Next → Auth → API and assert user-visible results plus important persisted effects. Direct DB access is only for fixtures/assertions, never a replacement for a user action.
- Mock all external HTTP via `test/e2e/external-mocks.mjs`, loaded only in E2E service processes. Keep internal service calls real. Block browser requests to public hosts. Never allow a real email, OpenRouter, broker, or other external call; add explicit non-HTTP publisher fakes when a flow needs them.
- Map applicable success, loading/navigation, validation, auth/ownership, persistence, conflict/retry, and external-failure behavior before adding tests. Cover all expected behavior for the integrated feature, not just one happy path.
- Reuse `test/e2e/global-setup.ts`: one E2E Testcontainers Postgres, separate Auth/API databases, migrations, real service startup, and teardown. Do not create a per-scenario container or globally truncate shared tables; clean only file-owned users/data.
- During feature development run only `npm run --silent test:unit:ai`. After the frontend and both services form the intended flow, run `npm run --silent test:e2e:ai`; use `test:e2e` for full output. Relevant integrated service tests run with `test:integration(:ai)`.
