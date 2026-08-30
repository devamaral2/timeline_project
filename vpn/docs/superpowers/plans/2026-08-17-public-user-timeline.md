# Public User Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a read-only `/{userId}` timeline that retrieves one fixed seven-day history page at a time and loads all older user events through responsive infinite scroll.

**Architecture:** The existing controller/use-case/repository/DAO path will own page validation, Sao Paulo calendar-window calculation, event retrieval, and `hasNextPage`. A small client API adapter and pagination hook will feed adapted `my-daily-flow` presentation components; the Next.js dynamic page stays a Server Component and passes its awaited `userId` param into the client timeline boundary.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Firestore Admin SDK, Vitest, React Testing Library, Tailwind CSS 4, Lucide React, Zod 4.

**Spec:** `docs/superpowers/specs/2026-08-17-public-user-timeline-design.md`

## Global Constraints

- The public route is exactly `/{userId}` and never renders the profile name, handle, or raw `userId`.
- The API is exactly `GET /api/events?userId=<id>&page=<positive-integer>`; omitted `page` defaults to `1`.
- Each API page covers exactly seven calendar days in `America/Sao_Paulo`.
- Page 1 covers today and the preceding six days; page 2 covers the seventh through thirteenth preceding days.
- Date windows are half-open: `[from, toExclusive)`.
- `hasNextPage` is based on the existence of an older event, not the current page's item count.
- Events and rendered day groups remain newest-first; older days append downward on mobile and to the right on desktop.
- Calendar days without events are not rendered.
- The UI is public and read-only; do not add authentication, filters, profile lookup, or mutation controls.
- Reuse only the focused visual components and tokens from `C:\Users\amara\Documents\projects\my-daily-flow`; do not copy its complete UI catalog.
- Treat all pre-existing uncommitted files as user-owned changes and stage only the files named by the current task.
- Before editing Next.js code, follow the bundled Next 16 guidance already inspected in `node_modules/next/dist/docs/01-app/`: dynamic `params` is a promise, interactive state belongs below a `"use client"` boundary, and Tailwind 4 uses `@tailwindcss/postcss` plus `@import "tailwindcss"`.

## File Structure

### Backend files

- Create `src/models/events/application/services/timeline-page-window.service.ts`: deterministic Sao Paulo weekly boundary calculation.
- Create `src/models/events/application/services/timeline-page-window.service.test.ts`: boundary and page-offset tests.
- Create `src/models/events/application/dtos/timeline-events-page.dto.ts`: paginated response contract.
- Create `src/models/events/application/usecases/list-timeline-events.usecase.test.ts`: pagination orchestration and DTO mapping tests.
- Modify `src/models/events/application/contracts/event-repository.ts`: half-open list range and older-event existence contract.
- Modify `src/models/events/application/usecases/list-timeline-events.usecase.ts`: return a page DTO from `userId` and `page`.
- Modify `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`: mirror range, sort, and existence semantics.
- Modify `src/models/events/infra/http/controller/list-timeline-events.controller.ts`: validate `page` and serialize the page DTO.
- Modify `src/models/events/infra/http/controller/read-controllers.test.ts`: controller contract tests.
- Modify `src/models/events/infra/persistence/daos/admin-firestore-event.dao.ts`: exclusive upper bound and limited older-event query.
- Modify `src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts`: Firestore constraint tests.
- Modify `src/models/events/infra/persistence/daos/firestore-event.dao.ts`: keep the browser DAO structurally compatible.
- Modify `src/models/events/infra/persistence/repositories/firestore-event.repository.ts`: expose the new repository methods.
- Modify `src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`: DAO delegation tests.
- Modify `src/models/events/infra/factories/make-list-timeline-events-controller.ts`: compose the window service and clock.
- Modify `src/app/api/events/route.test.ts`: GET forwarding and response regression test.

### Frontend files

- Create `postcss.config.mjs`: Tailwind 4 PostCSS plugin.
- Modify `package.json` and `package-lock.json`: focused visual dependencies.
- Modify `src/styles/globals.css`: reference design tokens, Tailwind import, accessibility, scrollbar, and reduced-motion behavior.
- Modify `src/app/layout.tsx`: Portuguese document language and public timeline metadata.
- Create `src/lib/utils.ts`: shared `cn` class merger.
- Create `src/lib/utils.test.ts`: class-merging test.
- Create `src/components/routine/timeline.types.ts`: client response and grouped-day types.
- Create `src/components/routine/timeline-date.ts`: Sao Paulo grouping and formatting.
- Create `src/components/routine/timeline-date.test.ts`: timezone and order tests.
- Create `src/components/routine/timeline-api.ts`: validated fetch adapter.
- Create `src/components/routine/timeline-api.test.ts`: URL, HTTP-error, and malformed-body tests.
- Create `src/components/routine/event-visuals.ts`: API-type-to-icon/style mapping.
- Create `src/components/routine/EventCard.tsx`: read-only expandable event card.
- Create `src/components/routine/EventCard.test.tsx`: finished/ongoing/detail tests.
- Create `src/components/routine/DayColumn.tsx`: day heading and event list.
- Create `src/components/routine/DaySkeleton.tsx`: initial and incremental placeholder.
- Create `src/components/routine/use-timeline-pagination.ts`: request coordination, deduplication, retries, and empty-page traversal.
- Create `src/components/routine/RoutineTimeline.tsx`: responsive layout and intersection sentinels.
- Create `src/components/routine/RoutineTimeline.test.tsx`: infinite-scroll state tests.
- Create `src/components/routine/PublicTimelinePage.tsx`: generic header, legend, and timeline composition.
- Create `src/components/routine/PublicTimelinePage.test.tsx`: public-shell privacy and composition test.
- Create `src/app/[userId]/page.tsx`: awaited Next 16 route param handoff.
- Modify `README.md`: document the public route and test/build commands.

---

### Task 1: Sao Paulo Seven-Day Window Service

**Files:**
- Create: `src/models/events/application/services/timeline-page-window.service.ts`
- Create: `src/models/events/application/services/timeline-page-window.service.test.ts`

**Interfaces:**
- Consumes: `page: number`, `now: Date`.
- Produces: `TIMELINE_TIME_ZONE`, `TIMELINE_DAYS_PER_PAGE`, `TimelinePageWindow`, and `TimelinePageWindowService.calculate(page, now)`.

- [ ] **Step 1: Write the failing window tests**

```ts
import { describe, expect, test } from "vitest";
import { TimelinePageWindowService } from "./timeline-page-window.service";

describe("TimelinePageWindowService", () => {
  const service = new TimelinePageWindowService();
  const now = new Date("2026-08-17T15:00:00.000Z");

  test("page 1 covers today and the previous six Sao Paulo calendar days", () => {
    expect(service.calculate(1, now)).toEqual({
      from: new Date("2026-08-11T03:00:00.000Z"),
      toExclusive: new Date("2026-08-18T03:00:00.000Z"),
    });
  });

  test("page 2 continues without overlap", () => {
    expect(service.calculate(2, now)).toEqual({
      from: new Date("2026-08-04T03:00:00.000Z"),
      toExclusive: new Date("2026-08-11T03:00:00.000Z"),
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `npm run test -- src/models/events/application/services/timeline-page-window.service.test.ts`

Expected: FAIL because `timeline-page-window.service.ts` does not exist.

- [ ] **Step 3: Implement deterministic IANA-timezone boundaries**

Use calendar arithmetic on UTC date parts, then convert each local midnight to an instant with `Intl.DateTimeFormat`. Recalculate the offset against the first candidate so the helper remains correct across offset changes.

```ts
export const TIMELINE_TIME_ZONE = "America/Sao_Paulo";
export const TIMELINE_DAYS_PER_PAGE = 7;

export interface TimelinePageWindow {
  from: Date;
  toExclusive: Date;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export class TimelinePageWindowService {
  calculate(page: number, now: Date): TimelinePageWindow {
    const today = dateInTimeZone(now, TIMELINE_TIME_ZONE);
    const toDate = addCalendarDays(today, 1 - (page - 1) * TIMELINE_DAYS_PER_PAGE);
    const fromDate = addCalendarDays(toDate, -TIMELINE_DAYS_PER_PAGE);
    return {
      from: localMidnightToUtc(fromDate, TIMELINE_TIME_ZONE),
      toExclusive: localMidnightToUtc(toDate, TIMELINE_TIME_ZONE),
    };
  }
}
```

Define `dateInTimeZone`, `addCalendarDays`, `localMidnightToUtc`, and `offsetAt` in the same file. `dateInTimeZone` reads numeric year/month/day parts; `addCalendarDays` uses `Date.UTC`; `offsetAt` formats year/month/day/hour/minute/second in the requested zone and compares that synthetic UTC value with the instant.

- [ ] **Step 4: Run the service tests**

Run: `npm run test -- src/models/events/application/services/timeline-page-window.service.test.ts`

Expected: PASS (2 tests).

- [ ] **Step 5: Commit the window service**

```powershell
git add -- src/models/events/application/services/timeline-page-window.service.ts src/models/events/application/services/timeline-page-window.service.test.ts
git commit -m "feat: calculate weekly timeline windows"
```

---

### Task 2: Older-Event Existence Query

**Files:**
- Modify: `src/models/events/application/contracts/event-repository.ts`
- Modify: `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`
- Modify: `src/models/events/infra/persistence/daos/admin-firestore-event.dao.ts`
- Modify: `src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts`
- Modify: `src/models/events/infra/persistence/daos/firestore-event.dao.ts`
- Modify: `src/models/events/infra/persistence/repositories/firestore-event.repository.ts`
- Modify: `src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`

**Interfaces:**
- Consumes: `{ userId: string; before: Date }`.
- Produces: `EventRepository.hasTimelineBefore(...)` without changing the existing list signature yet.

- [ ] **Step 1: Add a failing repository delegation test**

Add tests that capture the DAO calls:

```ts
test("checks for an older user event without listing history", async () => {
  let received: unknown;
  const repository = new FirestoreEventRepository({
    hasAnyBefore: async (userId: string, before: string) => {
      received = { userId, before };
      return true;
    },
  } as never);

  await expect(
    repository.hasTimelineBefore({
      userId: "user-1",
      before: new Date("2026-08-11T03:00:00.000Z"),
    }),
  ).resolves.toBe(true);
  expect(received).toEqual({
    userId: "user-1",
    before: "2026-08-11T03:00:00.000Z",
  });
});
```

- [ ] **Step 2: Add a failing Admin DAO constraint test**

Use the existing chainable Firestore fake and record `where`, `orderBy`, and `limit` calls. Assert that older-event detection uses `userId ==`, `startedAt < before`, descending order, and `limit(1)`.

```ts
expect(constraints).toContainEqual([
  "startedAt",
  "<",
  "2026-08-18T03:00:00.000Z",
]);
expect(requestedLimit).toBe(1);
```

- [ ] **Step 3: Run the focused persistence tests and verify failures**

Run: `npm run test -- src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts`

Expected: FAIL because `hasTimelineBefore` and `hasAnyBefore` do not exist.

- [ ] **Step 4: Extend the repository and DAO contracts**

Add this method to the application contract without changing `listTimeline` in this task:

```ts
hasTimelineBefore(params: {
  userId: string;
  before: Date;
}): Promise<boolean>;
```

Add this method to the DAO contract:

```ts
hasAnyBefore(userId: string, before: string): Promise<boolean>;
```

Implement `hasAnyBefore` in both Firestore DAOs with the composite `userId`/`startedAt` query, descending ordering, and `limit(1)`. The existing `firestore.indexes.json` already declares the required composite index.

- [ ] **Step 5: Update repository and in-memory behavior**

`FirestoreEventRepository.hasTimelineBefore` delegates to `hasAnyBefore` using `before.toISOString()`.

The in-memory repository keeps its current list behavior in this task and adds:

```ts
async hasTimelineBefore(params: { userId: string; before: Date }): Promise<boolean> {
  return this.events.some(
    (event) => event.userId === params.userId && event.startedAt < params.before,
  );
}
```

- [ ] **Step 6: Run persistence tests and type-check structural compatibility**

Run: `npm run test -- src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts`

Run: `npx tsc --noEmit`

Expected: focused tests PASS and TypeScript reports no DAO-interface mismatch.

- [ ] **Step 7: Commit persistence pagination support**

```powershell
git add -- src/models/events/application/contracts/event-repository.ts src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts src/models/events/infra/persistence/daos/admin-firestore-event.dao.ts src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts src/models/events/infra/persistence/daos/firestore-event.dao.ts src/models/events/infra/persistence/repositories/firestore-event.repository.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts
git commit -m "feat: detect older timeline events"
```

---

### Task 3: Paginated Timeline Use Case and HTTP Contract

**Files:**
- Modify: `src/models/events/application/contracts/event-repository.ts`
- Create: `src/models/events/application/dtos/timeline-events-page.dto.ts`
- Create: `src/models/events/application/usecases/list-timeline-events.usecase.test.ts`
- Modify: `src/models/events/application/usecases/list-timeline-events.usecase.ts`
- Modify: `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`
- Modify: `src/models/events/infra/http/controller/list-timeline-events.controller.ts`
- Modify: `src/models/events/infra/http/controller/read-controllers.test.ts`
- Modify: `src/models/events/infra/persistence/daos/admin-firestore-event.dao.ts`
- Modify: `src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts`
- Modify: `src/models/events/infra/persistence/daos/firestore-event.dao.ts`
- Modify: `src/models/events/infra/persistence/repositories/firestore-event.repository.ts`
- Modify: `src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`
- Modify: `src/models/events/infra/factories/make-list-timeline-events-controller.ts`
- Modify: `src/app/api/events/route.test.ts`

**Interfaces:**
- Consumes: `ListTimelineEventsUseCase.execute({ userId: string; page: number })`.
- Produces: `Promise<TimelineEventsPageDto>` with `{ events, pagination: { page, daysPerPage: 7, hasNextPage } }`.

- [ ] **Step 1: Write failing use-case pagination tests**

Construct the use case with an in-memory repository, `new TimelinePageWindowService()`, and a fixed clock `() => new Date("2026-08-17T15:00:00.000Z")`. Cover these assertions:

```ts
expect(result.pagination).toEqual({
  page: 1,
  daysPerPage: 7,
  hasNextPage: true,
});
expect(result.events.map((event) => event.name)).toEqual([
  "Newest in window",
  "Oldest in window",
]);
```

The fixture must also contain an event at `2026-08-18T03:00:00.000Z` to prove the upper boundary is exclusive, an event before `from` to make `hasNextPage` true, and an event owned by another user to prove isolation.

In the repository and Admin DAO tests, add a failing assertion that the page list forwards and applies `startedAt >= from` plus `startedAt < toExclusive`:

```ts
expect(received).toEqual({
  userId: "user-1",
  from: "2026-08-11T03:00:00.000Z",
  toExclusive: "2026-08-18T03:00:00.000Z",
});
expect(constraints).toContainEqual([
  "startedAt",
  "<",
  "2026-08-18T03:00:00.000Z",
]);
```

- [ ] **Step 2: Write failing controller tests for page validation and response shape**

Replace obsolete `from`/`to` validation coverage with table-driven page validation:

```ts
test.each(["0", "-1", "1.5", "abc", ""])(
  "rejects invalid timeline page %s",
  async (page) => {
    const response = await controller.handle(
      new Request(`http://localhost/api/events?userId=user-1&page=${page}`),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid page" });
  },
);
```

Also assert that omitted `page` invokes page 1 and a valid response contains the `events` and `pagination` keys.

- [ ] **Step 3: Run the use-case and controller tests and verify failures**

Run: `npm run test -- src/models/events/application/usecases/list-timeline-events.usecase.test.ts src/models/events/infra/http/controller/read-controllers.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts`

Expected: FAIL because the current use case accepts date filters and returns a bare array.

- [ ] **Step 4: Add the response DTO**

```ts
import type { TimelineEventCardDto } from "./timeline-event-card.dto";

export interface TimelineEventsPageDto {
  events: TimelineEventCardDto[];
  pagination: {
    page: number;
    daysPerPage: 7;
    hasNextPage: boolean;
  };
}
```

- [ ] **Step 5: Apply half-open list semantics and implement use-case orchestration**

Change `EventRepository.listTimeline` to the exact required shape:

```ts
listTimeline(params: {
  userId: string;
  from: Date;
  toExclusive: Date;
}): Promise<DomainEvent[]>;
```

Rename the DAO filter's inclusive `to` field to `toExclusive`, use `where("startedAt", "<", filters.toExclusive)` in both Firestore DAOs, forward `toExclusive.toISOString()` from the repository, and apply the same `<` boundary plus descending sort in the in-memory repository.

Inject `EventRepository`, `TimelinePageWindowService`, and `now: () => Date`. Calculate the window once, retrieve the current page and older-event existence concurrently, retain the current event-to-card mapping, and return:

```ts
return {
  events: events.map(toTimelineEventCard),
  pagination: {
    page: input.page,
    daysPerPage: TIMELINE_DAYS_PER_PAGE,
    hasNextPage,
  },
};
```

Keep `formatDuration` and the type presentation mapping private to the use-case module. Do not accept `from`, `to`, `type`, or `tag` in this public use case input.

- [ ] **Step 6: Implement controller validation and factory composition**

Controller parsing must use:

```ts
const pageValue = query.get("page");
const page = pageValue === null ? 1 : Number(pageValue);
if (!Number.isInteger(page) || page < 1) {
  return Response.json({ error: "Invalid page" }, { status: 400 });
}
return Response.json(await this.useCase.execute({ userId, page }));
```

The factory creates one `TimelinePageWindowService` and passes `() => new Date()` as the production clock.

Update every controller-test construction to pass `new TimelinePageWindowService()` and a fixed clock, so tests never depend on the machine date.

- [ ] **Step 7: Add GET route forwarding coverage**

Extend the existing hoisted controller mock to cover both factories, import `GET` and `POST`, and assert:

```ts
controller.handle.mockResolvedValue(
  Response.json({
    events: [],
    pagination: { page: 1, daysPerPage: 7, hasNextPage: false },
  }),
);
const response = await GET(new Request("http://localhost/api/events?userId=user-1&page=1"));
expect(response.status).toBe(200);
expect(controller.handle).toHaveBeenCalledOnce();
```

- [ ] **Step 8: Run backend timeline tests, then the full backend suite**

Run: `npm run test -- src/models/events/application/services/timeline-page-window.service.test.ts src/models/events/application/usecases/list-timeline-events.usecase.test.ts src/models/events/infra/http/controller/read-controllers.test.ts src/app/api/events/route.test.ts`

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 9: Commit the public API contract**

```powershell
git add -- src/models/events/application/contracts/event-repository.ts src/models/events/application/dtos/timeline-events-page.dto.ts src/models/events/application/usecases/list-timeline-events.usecase.ts src/models/events/application/usecases/list-timeline-events.usecase.test.ts src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts src/models/events/infra/http/controller/list-timeline-events.controller.ts src/models/events/infra/http/controller/read-controllers.test.ts src/models/events/infra/persistence/daos/admin-firestore-event.dao.ts src/models/events/infra/persistence/daos/admin-firestore-event.dao.test.ts src/models/events/infra/persistence/daos/firestore-event.dao.ts src/models/events/infra/persistence/repositories/firestore-event.repository.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts src/models/events/infra/factories/make-list-timeline-events-controller.ts src/app/api/events/route.test.ts
git commit -m "feat: paginate public timeline API"
```

---

### Task 4: Focused Frontend Design Foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `postcss.config.mjs`
- Modify: `src/styles/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/lib/utils.ts`
- Create: `src/lib/utils.test.ts`

**Interfaces:**
- Consumes: class fragments accepted by `clsx`.
- Produces: `cn(...inputs: ClassValue[]): string`, Tailwind utilities, reference semantic color tokens, and Portuguese root metadata.

- [ ] **Step 1: Install only the reference dependencies used by this feature**

Run:

```powershell
npm install lucide-react@^0.575.0 clsx@^2.1.1 tailwind-merge@^3.5.0 tw-animate-css@^1.3.4
npm install --save-dev tailwindcss@^4.2.1 @tailwindcss/postcss@^4.2.1
```

Expected: `package.json` and `package-lock.json` change; no unrelated UI packages are installed.

- [ ] **Step 2: Write the failing `cn` test**

```ts
import { expect, test } from "vitest";
import { cn } from "./utils";

test("merges conditional and conflicting Tailwind classes", () => {
  expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4");
});
```

- [ ] **Step 3: Run the utility test and confirm the missing module failure**

Run: `npm run test -- src/lib/utils.test.ts`

Expected: FAIL because `src/lib/utils.ts` does not exist.

- [ ] **Step 4: Add the class utility and Tailwind PostCSS configuration**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 5: Port the reference design tokens into global CSS**

Start `src/styles/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: "Inter", "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --color-sleep: var(--sleep);
  --color-training: var(--training);
  --color-food: var(--food);
  --color-routine: var(--routine);
  --shadow-card: var(--shadow-card);
  --shadow-card-hover: var(--shadow-card-hover);
}
```

Copy the reference light/dark neutral values and rename event tokens to the API vocabulary: `sleep`, `training`, `food`, and `routine`. Retain `box-sizing`, zero body margin, focus-visible outline, `scrollbar-slim`, and `prefers-reduced-motion`. Remove the old global rule that constrains every `main` element to `max-width: 48rem` so it cannot constrain the timeline shell.

- [ ] **Step 6: Update document metadata and language**

Set `metadata.title` to `Routine Tracker`, set the description to `Timeline pública para acompanhar eventos e atividades de uma rotina.`, and change `<html lang="en">` to `<html lang="pt-BR">`.

- [ ] **Step 7: Run utility tests and a production CSS build**

Run: `npm run test -- src/lib/utils.test.ts`

Run: `npm run build`

Expected: test PASS and Next production build succeeds with Tailwind processing `globals.css`.

- [ ] **Step 8: Commit the visual foundation**

```powershell
git add -- package.json package-lock.json postcss.config.mjs src/styles/globals.css src/app/layout.tsx src/lib/utils.ts src/lib/utils.test.ts
git commit -m "feat: add timeline design foundation"
```

---

### Task 5: Timeline Models, Date Grouping, and Event Cards

**Files:**
- Create: `src/components/routine/timeline.types.ts`
- Create: `src/components/routine/timeline-date.ts`
- Create: `src/components/routine/timeline-date.test.ts`
- Create: `src/components/routine/event-visuals.ts`
- Create: `src/components/routine/EventCard.tsx`
- Create: `src/components/routine/EventCard.test.tsx`
- Create: `src/components/routine/DayColumn.tsx`
- Create: `src/components/routine/DaySkeleton.tsx`

**Interfaces:**
- Consumes: `TimelineEventCardDto` and API event types `routine | food | training | sleep`.
- Produces: `TimelineDay`, `groupEventsByDay(events)`, `formatEventTime(iso)`, and the four presentational components/mappings.

- [ ] **Step 1: Define the frontend response and grouped-day types**

```ts
import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";

export type TimelineEvent = TimelineEventCardDto;

export interface TimelinePageResponse {
  events: TimelineEvent[];
  pagination: {
    page: number;
    daysPerPage: 7;
    hasNextPage: boolean;
  };
}

export interface TimelineDay {
  id: string;
  date: Date;
  isToday: boolean;
  events: TimelineEvent[];
}
```

- [ ] **Step 2: Write failing Sao Paulo grouping tests**

```ts
import { expect, test } from "vitest";
import { groupEventsByDay } from "./timeline-date";
import type { TimelineEvent } from "./timeline.types";

const baseEvent: TimelineEvent = {
  id: "event-1",
  type: "routine",
  accentColor: "blue",
  iconName: "clock",
  name: "Foco",
  description: "",
  startedAt: "2026-08-18T02:30:00.000Z",
  durationLabel: "30m",
  tags: [],
  interruptions: [],
};

test("groups a UTC instant by its Sao Paulo calendar day", () => {
  const days = groupEventsByDay([baseEvent], new Date("2026-08-18T12:00:00.000Z"));
  expect(days[0]?.id).toBe("2026-08-17");
});

test("orders day groups and events newest first", () => {
  const older = { ...baseEvent, id: "older", startedAt: "2026-08-16T12:00:00.000Z" };
  const newer = { ...baseEvent, id: "newer", startedAt: "2026-08-17T12:00:00.000Z" };
  const days = groupEventsByDay([older, newer], new Date("2026-08-18T12:00:00.000Z"));
  expect(days.map((day) => day.id)).toEqual(["2026-08-17", "2026-08-16"]);
});
```

- [ ] **Step 3: Write failing card behavior tests**

Render one finished event with a description/interruption and one event without `finishedAt`. Assert that clicking `Ver detalhes` reveals description and interruption duration, and assert that the open event displays `Em andamento` plus `--`.

```tsx
render(<EventCard event={{ ...baseEvent, finishedAt: undefined, durationLabel: "--" }} />);
expect(screen.getByText("Em andamento")).toBeInTheDocument();
expect(screen.getByText("--")).toBeInTheDocument();
```

- [ ] **Step 4: Run focused presentation tests and confirm failures**

Run: `npm run test -- src/components/routine/timeline-date.test.ts src/components/routine/EventCard.test.tsx`

Expected: FAIL because grouping and card modules do not exist.

- [ ] **Step 5: Implement date grouping and formatting**

Use one `Intl.DateTimeFormat` configuration with `timeZone: "America/Sao_Paulo"`. `groupEventsByDay` must deduplicate by event id, sort events descending by `startedAt`, create groups only from dates present in the event array, and set `isToday` by comparing the group's key with the Sao Paulo key for `now`.

Export these exact functions:

```ts
export function dateKeyInSaoPaulo(value: Date | string): string;
export function groupEventsByDay(events: TimelineEvent[], now?: Date): TimelineDay[];
export function shortDate(date: Date): string;
export function longDate(date: Date): string;
export function weekday(date: Date): string;
export function formatEventTime(value: string): string;
```

Create each group's `date` at `T12:00:00.000Z` from its `YYYY-MM-DD` key so formatting the calendar label cannot roll to an adjacent date.

- [ ] **Step 6: Port and adapt the visual mapping**

Use the reference `event-visuals.ts` structure with API names:

```ts
export const typeIcons = {
  sleep: Moon,
  training: Dumbbell,
  food: Utensils,
  routine: Clock,
} satisfies Record<EventType, LucideIcon>;

export const typeLabels: Record<EventType, string> = {
  sleep: "Sono",
  training: "Treino",
  food: "Alimentação",
  routine: "Comum",
};
```

Map the classes to `text-sleep`, `text-training`, `text-food`, and `text-routine`, with matching translucent icon backgrounds and left bars.

- [ ] **Step 7: Port and adapt `EventCard`**

Keep the reference card shape, left accent bar, icon, tag pills, expandable details, hover/focus behavior, and accessible labels. Make it read-only: no context menu and no whole-card action.

Time rendering must follow:

```tsx
<span>{formatEventTime(event.startedAt)}</span>
<span aria-hidden>→</span>
{event.finishedAt ? (
  <span>{formatEventTime(event.finishedAt)}</span>
) : (
  <span>Em andamento</span>
)}
```

Render interruption `description` beneath its name when non-empty and render the API-provided `durationLabel`; do not parse it back into minutes.

- [ ] **Step 8: Port and adapt `DayColumn` and `DaySkeleton`**

`DayColumn` accepts:

```ts
interface DayColumnProps {
  day: TimelineDay;
  variant: "vertical" | "column";
}
```

Keep the long mobile date, short desktop date, weekday, `Hoje` badge, fixed desktop width, and event count. Remove the mock-specific “hours registered” total and default-expanded card behavior. `DaySkeleton` retains the reference `vertical | column` variants and three placeholder cards.

- [ ] **Step 9: Run presentation tests and build**

Run: `npm run test -- src/components/routine/timeline-date.test.ts src/components/routine/EventCard.test.tsx`

Run: `npm run build`

Expected: tests PASS and all new Tailwind/Lucide imports compile.

- [ ] **Step 10: Commit presentational components**

```powershell
git add -- src/components/routine/timeline.types.ts src/components/routine/timeline-date.ts src/components/routine/timeline-date.test.ts src/components/routine/event-visuals.ts src/components/routine/EventCard.tsx src/components/routine/EventCard.test.tsx src/components/routine/DayColumn.tsx src/components/routine/DaySkeleton.tsx
git commit -m "feat: add public timeline cards"
```

---

### Task 6: Validated Timeline API Client

**Files:**
- Create: `src/components/routine/timeline-api.ts`
- Create: `src/components/routine/timeline-api.test.ts`

**Interfaces:**
- Consumes: `userId: string`, `page: number`, optional `AbortSignal`.
- Produces: `fetchTimelinePage(userId, page, signal?): Promise<TimelinePageResponse>` and `TimelineRequestError`.

- [ ] **Step 1: Write failing adapter tests**

Mock `global.fetch` and cover URL encoding, the same-origin path, HTTP errors, and malformed success bodies.

```ts
await fetchTimelinePage("user/a b", 2);
expect(fetch).toHaveBeenCalledWith(
  "/api/events?userId=user%2Fa+b&page=2",
  expect.objectContaining({ signal: undefined }),
);
```

For a 503 response, expect `TimelineRequestError` with status 503. For `{ events: [] }`, expect rejection because pagination metadata is missing.

- [ ] **Step 2: Run the adapter test and confirm the missing module failure**

Run: `npm run test -- src/components/routine/timeline-api.test.ts`

Expected: FAIL because `timeline-api.ts` does not exist.

- [ ] **Step 3: Implement Zod response validation and fetch behavior**

Define a Zod schema that mirrors `TimelineEventCardDto` and requires literal `daysPerPage: 7`. Export:

```ts
export class TimelineRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "TimelineRequestError";
  }
}

export async function fetchTimelinePage(
  userId: string,
  page: number,
  signal?: AbortSignal,
): Promise<TimelinePageResponse> {
  const query = new URLSearchParams({ userId, page: String(page) });
  const response = await fetch(`/api/events?${query.toString()}`, { signal });
  if (!response.ok) {
    throw new TimelineRequestError(response.status, "Não foi possível carregar a timeline.");
  }
  return timelinePageSchema.parse(await response.json());
}
```

- [ ] **Step 4: Run adapter tests**

Run: `npm run test -- src/components/routine/timeline-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the client adapter**

```powershell
git add -- src/components/routine/timeline-api.ts src/components/routine/timeline-api.test.ts
git commit -m "feat: add timeline API client"
```

---

### Task 7: Infinite Pagination Hook and Responsive Timeline

**Files:**
- Create: `src/components/routine/use-timeline-pagination.ts`
- Create: `src/components/routine/RoutineTimeline.tsx`
- Create: `src/components/routine/RoutineTimeline.test.tsx`

**Interfaces:**
- Consumes: `fetchTimelinePage`, `groupEventsByDay`, and `userId`.
- Produces: `useTimelinePagination(userId)` state/actions and `<RoutineTimeline userId />`.

- [ ] **Step 1: Write the failing initial-load and privacy request test**

Mock `fetch` with page 1 and render `<RoutineTimeline userId="private-user-id" />`. Assert the request URL contains the encoded id, the card renders, and the raw id never appears in visible text.

```tsx
expect(fetch).toHaveBeenCalledWith(
  "/api/events?userId=private-user-id&page=1",
  expect.any(Object),
);
expect(screen.queryByText("private-user-id")).not.toBeInTheDocument();
```

- [ ] **Step 2: Write failing infinite-scroll, empty-week, terminal, and retry tests**

Install a local `IntersectionObserverMock` whose `trigger()` invokes the saved callback with `{ isIntersecting: true }`. Cover:

- page 1 with events and `hasNextPage: true`, followed by an observer trigger that requests page 2;
- page 1 empty with `hasNextPage: true`, automatically followed by page 2 without waiting for a new observer transition;
- a terminal empty page displaying `Nenhum evento encontrado`;
- a 500 response displaying `Tentar novamente`, followed by a successful retry;
- a later-page error preserving the first page's rendered event;
- repeated ids across pages rendering once.

- [ ] **Step 3: Run the timeline test and verify failures**

Run: `npm run test -- src/components/routine/RoutineTimeline.test.tsx`

Expected: FAIL because the hook and component do not exist.

- [ ] **Step 4: Implement `useTimelinePagination`**

Expose this result shape:

```ts
interface TimelinePaginationState {
  events: TimelineEvent[];
  hasNextPage: boolean;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  retry: () => void;
}
```

Use refs for `nextPage`, `hasNextPage`, current `AbortController`, route generation, and in-flight status. On `userId` change, abort the previous request, clear accumulated events, reset to page 1, and start the initial request.

Within one load operation, cross empty pages in a loop:

```ts
let pageToLoad = nextPageRef.current;
while (true) {
  const result = await fetchTimelinePage(userId, pageToLoad, controller.signal);
  appendUniqueEvents(result.events);
  nextPageRef.current = pageToLoad + 1;
  hasNextPageRef.current = result.pagination.hasNextPage;
  setHasNextPage(result.pagination.hasNextPage);
  if (result.events.length > 0 || !result.pagination.hasNextPage) break;
  pageToLoad += 1;
}
```

Only advance `nextPageRef` after a successful response. Consequently `retry()` naturally retries the failed page. Ignore `AbortError`; all other errors set the Portuguese error message without clearing accumulated events.

- [ ] **Step 5: Implement the responsive `RoutineTimeline`**

Port the reference `useIsDesktop` media-query hook with `(min-width: 1024px)`. Group hook events with `groupEventsByDay`. Attach one observer with `rootMargin: "200px"` to the currently rendered sentinel and call `loadMore` only when it intersects.

Render:

- initial skeletons while `isInitialLoading`;
- `DayColumn variant="vertical"` in the mobile/tablet vertical layout;
- `DayColumn variant="column"` in the desktop horizontal snap container;
- an appended `DaySkeleton` while `isLoadingMore`;
- `Nenhum evento encontrado` only when loading is finished, no days exist, no error exists, and `hasNextPage` is false;
- an error panel with a `Tentar novamente` button;
- an `aria-live="polite"` status containing the loading state or loaded-day count.

- [ ] **Step 6: Run timeline tests**

Run: `npm run test -- src/components/routine/RoutineTimeline.test.tsx`

Expected: all pagination, retry, deduplication, and state tests PASS.

- [ ] **Step 7: Run all frontend component tests**

Run: `npm run test -- src/components/routine src/lib/utils.test.ts`

Expected: all frontend tests PASS.

- [ ] **Step 8: Commit infinite scrolling**

```powershell
git add -- src/components/routine/use-timeline-pagination.ts src/components/routine/RoutineTimeline.tsx src/components/routine/RoutineTimeline.test.tsx
git commit -m "feat: load timeline with infinite scroll"
```

---

### Task 8: Dynamic Public Page and Integrated Verification

**Files:**
- Create: `src/components/routine/PublicTimelinePage.tsx`
- Create: `src/components/routine/PublicTimelinePage.test.tsx`
- Create: `src/app/[userId]/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `PublicTimelinePage({ userId: string })` and Next `params: Promise<{ userId: string }>`.
- Produces: the public `/{userId}` page and updated local-development documentation.

- [ ] **Step 1: Write the failing public-shell test**

Mock `RoutineTimeline` so the test can inspect the passed prop without issuing requests. Render `PublicTimelinePage` and assert the generic header/legend is visible while the raw id and all mutation controls are absent.

```tsx
expect(screen.getByRole("heading", { level: 1, name: "Routine Tracker" })).toBeInTheDocument();
expect(screen.getByText("Sono")).toBeInTheDocument();
expect(screen.queryByText("user-secret")).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /novo evento/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the shell test and confirm the missing module failure**

Run: `npm run test -- src/components/routine/PublicTimelinePage.test.tsx`

Expected: FAIL because `PublicTimelinePage.tsx` does not exist.

- [ ] **Step 3: Implement the generic public shell**

Port the reference header proportions, `Sparkles` mark, maximum width, summary date, and four-item event legend. Replace owner-specific content with the fixed copy `Timeline pública de eventos`. Pass `userId` only to `<RoutineTimeline userId={userId} />`; do not interpolate it into text, labels, metadata, or data attributes.

- [ ] **Step 4: Add the Next 16 dynamic page**

Use the bundled Next.js 16 `params` promise convention:

```tsx
import { PublicTimelinePage } from "@/components/routine/PublicTimelinePage";

export default async function UserTimelinePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <PublicTimelinePage userId={userId} />;
}
```

Do not add `generateStaticParams`; user ids are runtime values.

- [ ] **Step 5: Update the README**

Replace the Hello World statement with:

```md
Open `http://localhost:3000/<userId>` to view that user's public timeline. The page loads history from `GET /api/events?userId=<userId>&page=1` in seven-day windows and continues through infinite scroll.
```

Keep the existing install, environment, focused-test, full-test, and production-build instructions accurate.

- [ ] **Step 6: Run shell and full automated tests**

Run: `npm run test -- src/components/routine/PublicTimelinePage.test.tsx`

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 7: Run type and production verification**

Run: `npx tsc --noEmit`

Run: `npm run build`

Run: `git diff --check`

Expected: TypeScript succeeds, Next builds both `/[userId]` and `/api/events`, and Git reports no whitespace errors.

- [ ] **Step 8: Perform responsive visual smoke checks**

Run `npm run dev`, open `http://localhost:3000/test-user`, and check these exact conditions in the browser:

- at 390px width, day sections stack vertically and no horizontal page overflow appears;
- at 1280px width, fixed-width day columns scroll horizontally and snap from newest to older;
- initial and incremental skeletons use the same card geometry as loaded content;
- event type is identified by icon and accent, not color alone;
- keyboard focus is visible on detail and retry buttons;
- the header contains no `test-user` text and exposes no mutation controls.

If the configured Firestore contains no `test-user` data, verify the empty state visually and rely on the mocked component tests for populated/incremental states.

- [ ] **Step 9: Commit the public route and documentation**

```powershell
git add -- src/components/routine/PublicTimelinePage.tsx src/components/routine/PublicTimelinePage.test.tsx 'src/app/[userId]/page.tsx' README.md
git commit -m "feat: add public user timeline page"
```

- [ ] **Step 10: Record final evidence before declaring completion**

Run:

```powershell
git status --short
git log -8 --oneline
npm test
npm run build
```

Expected: only the user's pre-existing unrelated changes remain unstaged; the timeline commits are visible; tests and build exit with code 0.
