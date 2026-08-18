# Final Fix Wave Report

## Status

DONE_WITH_CONCERNS

This wave resolves the merge-blocking findings from the whole-branch review and keeps unrelated working-tree changes outside the commit.

## Scope Completed

1. Added the previously untracked `FoodTotalsService`, making the event create/update implementation self-contained.
2. Reused and completed the pending event mapper changes so undefined fields are omitted, interruption IDs are persisted and restored, and legacy documents without nested IDs are normalized safely.
3. Made training hydration backward-compatible with the legacy `{ caloriesBurned }` shape and the new `{ workouts }` shape. Normalized domain data exposes both `workouts` and `caloriesBurned`, and training PATCH preserves legacy calories when workouts are not replaced.
4. Replaced the mutation-prone create sequence with `saveClosingLatestOpen`. The production Admin Firestore implementation parses/builds the event and upserts tags before a transaction atomically closes the latest open event and creates its replacement.
5. Made food-event naming timezone-explicit with `America/Sao_Paulo` in the creation normalizer while keeping the naming service independently testable with any IANA timezone.
6. Wired the runtime create factory to `OpenRouterFoodParsingGateway` instead of the test stub and included the required server Firestore, gateway, prompt, and tag DAO dependencies.
7. Changed latest-event queries to `limit(1)` and added the composite Firestore index for `userId ASC, startedAt DESC`.
8. Removed the temporary `unknown` compatibility exports from `create-event.usecase.ts`.
9. Reused the single creation clock for `startedAt`, previous-event `finishedAt`, and food `parsedAt`.
10. Added a deterministic assertion proving `startedAt` is server-owned, plus regression coverage for parsing failure, timezone behavior, transaction writes, mapper IDs, undefined omission, and legacy training hydration/update.

## TDD Evidence

The new regression tests were observed failing before the production fixes:

- Explicit timezone was ignored.
- Injected server clock was ignored for `startedAt` and `parsedAt`.
- A failed food parse left the previous event closed.
- Admin latest-event lookup did not call `limit(1)`.
- The transactional create method did not exist.
- Legacy training hydration threw while reading `workouts.map`.
- Training PATCH reset legacy `caloriesBurned` from `420` to `0`.

All of these tests passed after the corresponding minimal fixes.

## Verification

The exact staged snapshot was materialized in a detached temporary worktree so unrelated local changes could not affect verification.

- `npm test`: PASS, 20 test files and 68 tests.
- `npx tsc --noEmit --pretty false`: PASS, exit code 0.
- `git diff --cached --check`: PASS.

The broader current working tree also passed `npm test` with 22 test files and 75 tests, and passed `npx tsc --noEmit --pretty false`.

## Residual Concern

The production create factory uses the Admin Firestore transaction, so close-and-create is atomic in the runtime path. The legacy Web/client `FirestoreEventDao` now uses a single atomic write batch after a limited lookup, but the lookup itself is outside the batch because the Web transaction API cannot transactionally read a query. Directly wiring that client DAO into a concurrent create path could still allow two replacement events; it should remain a compatibility adapter rather than the production create dependency.

## Working-Tree Preservation

Frontend removal, daily-overview redesign, environment files, other factory migrations, generated TypeScript state, and local instruction/configuration files were intentionally left unstaged and uncommitted.
