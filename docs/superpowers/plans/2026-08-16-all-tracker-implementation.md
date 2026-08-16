# All Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working version of All Tracker with public reads, authenticated owner-only writes, DDD backend structure under `src/models`, Firebase/Firestore persistence, and OpenRouter-powered food parsing.

**Architecture:** The app uses Next.js App Router for UI and HTTP entry points, while all backend behavior flows through `src/models/events` with DDD boundaries. Firestore stores public event data and tag suggestions, Firebase Authentication secures mutations, and the food flow uses an application service plus gateway to force structured JSON from OpenRouter before persisting `FoodEvent`s.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Firebase Authentication, Cloud Firestore, Firebase Admin SDK, Zod, ULID, Vitest, React Testing Library

## Global Constraints

- Public event visualization without login.
- Google login with Firebase Authentication.
- Authenticated create, edit, and delete for the event owner.
- Timeline as the main screen.
- Daily diet and training summary as a secondary screen.
- Dynamic reusable tags with suggestion support.
- Food event creation from free text interpreted through OpenRouter.
- Firestore persistence for events and tags.
- Backend organization under `src/models` using DDD.
- Event ids use `ulid`.
- The following components are instantiated through factories: services, use cases, controllers, daos, repositories.
- DAO reads and writes raw Firestore documents.
- Repository transforms raw persistence data into domain entities and back.
- Mappers are static classes.
- Any visitor can list and view all events.
- Only the authenticated owner can create, edit, or delete their own events.
- Ownership rules should be enforced in two places: application/backend logic and Firestore security rules.
- Food parsing responses must use English keys and can keep descriptive food values in Portuguese.
- The first supported event types are `RoutineEvent`, `FoodEvent`, `TrainingEvent`, and `SleepEvent`.
- Automatic sync with Zepp or other wearable providers is excluded from V1.
- Use `America/Sao_Paulo` as the V1 day-boundary timezone for daily aggregation until a per-user timezone model exists.

---

## File Map

### App shell and configuration

- Create: `tsconfig.json` — TypeScript compiler config for Next.js and test tooling
- Create: `next.config.ts` — Next.js runtime config
- Create: `next-env.d.ts` — Next.js TypeScript ambient types
- Create: `vitest.config.ts` — Vitest + jsdom configuration
- Create: `src/test/setup.ts` — global testing helpers
- Create: `src/config/env.ts` — central environment validation for client/server variables
- Create: `.env.example` — documented environment template for local and Vercel setup
- Create: `src/app/layout.tsx` — root layout
- Create: `src/app/page.tsx` — timeline page entry
- Create: `src/app/daily/page.tsx` — daily summary page entry
- Create: `src/styles/globals.css` — base styling tokens and layout primitives
- Modify: `package.json` — scripts and dependencies
- Modify: `README.md` — local setup and run instructions

### Firebase and auth infrastructure

- Create: `src/lib/firebase/client-app.ts` — browser Firebase app singleton
- Create: `src/lib/firebase/client-auth.ts` — browser auth helpers
- Create: `src/lib/firebase/admin-app.ts` — server Firebase Admin singleton
- Create: `src/lib/auth/verify-firebase-token.ts` — Firebase ID token verification
- Create: `src/lib/auth/auth-header.ts` — bearer token extraction utility

### Event domain and application

- Create: `src/models/events/domain/types/event-type.ts`
- Create: `src/models/events/domain/value-objects/event-id.ts`
- Create: `src/models/events/domain/value-objects/interruption.ts`
- Create: `src/models/events/domain/value-objects/tag-list.ts`
- Create: `src/models/events/domain/entities/event.entity.ts`
- Create: `src/models/events/domain/entities/routine-event.entity.ts`
- Create: `src/models/events/domain/entities/training-event.entity.ts`
- Create: `src/models/events/domain/entities/sleep-event.entity.ts`
- Create: `src/models/events/domain/entities/food-event.entity.ts`
- Create: `src/models/events/application/contracts/event-repository.ts`
- Create: `src/models/events/application/contracts/tag-repository.ts`
- Create: `src/models/events/application/contracts/food-parsing.gateway.ts`
- Create: `src/models/events/application/dtos/timeline-event-card.dto.ts`
- Create: `src/models/events/application/dtos/daily-overview.dto.ts`
- Create: `src/models/events/application/dtos/tag-suggestion.dto.ts`
- Create: `src/models/events/application/dtos/create-event.input.ts`
- Create: `src/models/events/application/dtos/update-event.input.ts`
- Create: `src/models/events/application/services/food-prompt-builder.service.ts`
- Create: `src/models/events/application/services/food-totals.service.ts`
- Create: `src/models/events/application/usecases/list-timeline-events.usecase.ts`
- Create: `src/models/events/application/usecases/get-daily-overview.usecase.ts`
- Create: `src/models/events/application/usecases/suggest-tags.usecase.ts`
- Create: `src/models/events/application/usecases/create-event.usecase.ts`
- Create: `src/models/events/application/usecases/update-event.usecase.ts`
- Create: `src/models/events/application/usecases/delete-event.usecase.ts`
- Create: `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`
- Create: `src/models/events/application/usecases/test-doubles/in-memory-tag.repository.ts`
- Create: `src/models/events/application/usecases/test-doubles/stub-food-parsing.gateway.ts`

### Persistence, controllers, and factories

- Create: `src/models/events/infra/persistence/daos/firestore-event.dao.ts`
- Create: `src/models/events/infra/persistence/daos/firestore-tag.dao.ts`
- Create: `src/models/events/infra/persistence/repositories/mappers/event-document.mapper.ts`
- Create: `src/models/events/infra/persistence/repositories/mappers/tag-document.mapper.ts`
- Create: `src/models/events/infra/persistence/repositories/firestore-event.repository.ts`
- Create: `src/models/events/infra/persistence/repositories/firestore-tag.repository.ts`
- Create: `src/models/events/infra/http/controller/list-timeline-events.controller.ts`
- Create: `src/models/events/infra/http/controller/get-daily-overview.controller.ts`
- Create: `src/models/events/infra/http/controller/suggest-tags.controller.ts`
- Create: `src/models/events/infra/http/controller/create-event.controller.ts`
- Create: `src/models/events/infra/http/controller/update-event.controller.ts`
- Create: `src/models/events/infra/http/controller/delete-event.controller.ts`
- Create: `src/models/events/infra/gateways/openrouter-food-parsing.gateway.ts`
- Create: `src/models/events/infra/factories/make-list-timeline-events-controller.ts`
- Create: `src/models/events/infra/factories/make-get-daily-overview-controller.ts`
- Create: `src/models/events/infra/factories/make-suggest-tags-controller.ts`
- Create: `src/models/events/infra/factories/make-create-event-controller.ts`
- Create: `src/models/events/infra/factories/make-update-event-controller.ts`
- Create: `src/models/events/infra/factories/make-delete-event-controller.ts`

### Route handlers and UI components

- Create: `src/app/api/events/route.ts`
- Create: `src/app/api/events/[eventId]/route.ts`
- Create: `src/app/api/events/daily/route.ts`
- Create: `src/app/api/tags/route.ts`
- Create: `src/components/providers/app-providers.tsx`
- Create: `src/components/auth/google-sign-in-button.tsx`
- Create: `src/components/events/event-card.tsx`
- Create: `src/components/events/interruption-list.tsx`
- Create: `src/components/events/event-form.tsx`
- Create: `src/components/events/tag-combobox.tsx`
- Create: `src/components/events/event-type-select.tsx`
- Create: `src/components/events/food-fields.tsx`
- Create: `src/components/events/training-fields.tsx`
- Create: `src/components/events/sleep-fields.tsx`
- Create: `src/components/daily/summary-card.tsx`
- Create: `src/components/daily/sleep-summary-card.tsx`
- Create: `src/components/daily/micros-dropdown.tsx`
- Create: `src/components/daily/food-event-card.tsx`
- Create: `src/components/daily/training-event-card.tsx`
- Create: `src/hooks/use-auth-session.ts`
- Create: `src/hooks/use-timeline-events.ts`
- Create: `src/hooks/use-daily-overview.ts`
- Create: `src/hooks/use-tag-suggestions.ts`

### Tests and Firebase rules

- Create: `src/app/page.test.tsx`
- Create: `src/app/daily/page.test.tsx`
- Create: `src/models/events/domain/entities/event.entity.test.ts`
- Create: `src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts`
- Create: `src/models/events/application/usecases/get-daily-overview.usecase.test.ts`
- Create: `src/models/events/application/usecases/create-event.usecase.test.ts`
- Create: `src/models/events/application/services/food-prompt-builder.service.test.ts`
- Create: `src/components/events/event-card.test.tsx`
- Create: `src/components/events/event-form.test.tsx`
- Create: `src/components/daily/micros-dropdown.test.tsx`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`

## Shared Interfaces

These signatures are the contracts later tasks rely on.

```ts
export type EventType = "routine" | "food" | "training" | "sleep";

export interface InterruptionProps {
  name: string;
  description: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface RoutineEventData {}

export interface TrainingEventData {
  caloriesBurned: number;
}

export interface SleepEventData {
  trackedSleepTime: number;
  score: number;
}

export interface FoodItem {
  food: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: {
    carbohydratesGrams: number;
    proteinsGrams: number;
    totalFatGrams: number;
    fiberGrams: number;
  };
  mainMicronutrients: Record<string, number>;
  otherData: Record<string, number>;
}

export interface FoodTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
  totalMicronutrients: Record<string, number>;
}

export interface FoodEventData {
  inputText: string;
  items: FoodItem[];
  totals: FoodTotals;
  modelProvider: string;
  modelName: string;
  parsedAt: Date;
}

export type EventData =
  | RoutineEventData
  | TrainingEventData
  | SleepEventData
  | FoodEventData;

export interface BaseEventInput {
  eventId?: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  interruptions: InterruptionProps[];
}

export type CreateEventInput =
  | ({ type: "routine"; data?: RoutineEventData } & BaseEventInput)
  | ({ type: "training"; data: TrainingEventData } & BaseEventInput)
  | ({ type: "sleep"; data: SleepEventData } & BaseEventInput)
  | ({ type: "food"; inputText: string } & BaseEventInput);

export type UpdateEventInput = CreateEventInput & { eventId: string };

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  displayName?: string;
}

export interface TimelineEventCardDto {
  id: string;
  type: EventType;
  accentColor: string;
  iconName: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  durationLabel: string;
  tags: string[];
  interruptions: Array<{
    name: string;
    description: string;
    durationLabel: string;
  }>;
}

export interface DailyOverviewDto {
  date: string;
  sleep: {
    id: string;
    trackedSleepTime: number;
    score: number;
    description: string;
  } | null;
  caloriesConsumed: number;
  caloriesBurned: number;
  macros: {
    protein: number;
    carbohydrate: number;
    fat: number;
  };
  micronutrients: Record<string, number>;
  foodEvents: Array<{
    id: string;
    name: string;
    description: string;
    startedAt: string;
    finishedAt?: string;
    kcal: number;
    protein: number;
    carbohydrate: number;
    fat: number;
    micronutrients: Record<string, number>;
  }>;
  trainingEvents: Array<{
    id: string;
    name: string;
    description: string;
    startedAt: string;
    finishedAt?: string;
    kcal: number;
  }>;
}

export interface TagSuggestionDto {
  id: string;
  name: string;
}

export interface EventRepository {
  save(event: DomainEvent): Promise<void>;
  update(event: DomainEvent): Promise<void>;
  delete(eventId: string): Promise<void>;
  findById(eventId: string): Promise<DomainEvent | null>;
  listTimeline(params: {
    from?: Date;
    to?: Date;
    type?: EventType;
    tag?: string;
  }): Promise<DomainEvent[]>;
  listByDay(params: {
    date: string;
    timeZone: string;
  }): Promise<DomainEvent[]>;
}

export interface TagRepository {
  upsertMany(tags: string[], createdBy: string): Promise<void>;
  suggest(params: {
    query: string;
    limit: number;
  }): Promise<TagSuggestionDto[]>;
}

export interface FoodParsingGateway {
  parseMeal(input: {
    text: string;
  }): Promise<{
    items: FoodItem[];
    modelProvider: string;
    modelName: string;
  }>;
}

export interface DomainEvent {
  id: string;
  type: EventType;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt?: Date;
  tags: string[];
  interruptions: Interruption[];
}
```

### Task 1: Bootstrap the Next.js, TypeScript, and testing baseline

**Files:**
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/config/env.ts`
- Create: `.env.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/daily/page.tsx`
- Create: `src/styles/globals.css`
- Test: `src/app/page.test.tsx`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: none
- Produces:
  - `default function RootLayout(props: { children: React.ReactNode }): JSX.Element`
  - `default function TimelinePage(): JSX.Element`
  - `default function DailyPage(): JSX.Element`
  - `export function getClientEnv(source?: Record<string, string | undefined>): ClientEnv`
  - `export function getServerEnv(source?: Record<string, string | undefined>): ServerEnv`

- [ ] **Step 1: Add scripts, dependencies, and the failing page smoke test**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "firebase": "^12.0.0",
    "firebase-admin": "^13.0.0",
    "next": "^16.3.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "ulid": "^3.0.1",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

```tsx
import { render, screen } from "@testing-library/react";
import TimelinePage from "./page";

test("renders the public app shell links", () => {
  render(<TimelinePage />);

  expect(
    screen.getByRole("heading", { name: /all tracker/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /timeline/i })).toHaveAttribute(
    "href",
    "/",
  );
  expect(screen.getByRole("link", { name: /daily overview/i })).toHaveAttribute(
    "href",
    "/daily",
  );
});
```

- [ ] **Step 2: Install dependencies and run the smoke test to confirm failure**

Run: `npm install`

Run: `npm run test -- src/app/page.test.tsx`

Expected: FAIL because `src/app/page.tsx` and the shell files do not exist yet.

- [ ] **Step 3: Create the minimal app shell, global styles, and environment parser**

```ts
import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});

const serverSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).optional(),
});

export function getClientEnv(source: Record<string, string | undefined> = process.env) {
  return clientSchema.parse(source);
}

export function getServerEnv(source: Record<string, string | undefined> = process.env) {
  return serverSchema.parse(source);
}
```

```tsx
import Link from "next/link";

export default function TimelinePage() {
  return (
    <main>
      <h1>All Tracker</h1>
      <nav>
        <Link href="/">Timeline</Link>
        <Link href="/daily">Daily Overview</Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 4: Run the smoke test to verify the baseline now passes**

Run: `npm run test -- src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Verify the app starts and record the local workflow in the README**

Run: `npm run build`

Expected: PASS and a production build completes with no missing module errors.

- [ ] **Step 6: Commit the baseline**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts next-env.d.ts vitest.config.ts src/test/setup.ts src/config/env.ts .env.example src/app/layout.tsx src/app/page.tsx src/app/daily/page.tsx src/styles/globals.css src/app/page.test.tsx README.md
git commit -m "chore: bootstrap next typescript baseline"
```

### Task 2: Implement the event domain entities and value objects

**Files:**
- Create: `src/models/events/domain/types/event-type.ts`
- Create: `src/models/events/domain/value-objects/event-id.ts`
- Create: `src/models/events/domain/value-objects/interruption.ts`
- Create: `src/models/events/domain/value-objects/tag-list.ts`
- Create: `src/models/events/domain/entities/event.entity.ts`
- Create: `src/models/events/domain/entities/routine-event.entity.ts`
- Create: `src/models/events/domain/entities/training-event.entity.ts`
- Create: `src/models/events/domain/entities/sleep-event.entity.ts`
- Create: `src/models/events/domain/entities/food-event.entity.ts`
- Test: `src/models/events/domain/entities/event.entity.test.ts`

**Interfaces:**
- Consumes:
  - none
- Produces:
  - `abstract class Event<TData>`
  - `class RoutineEvent extends Event<RoutineEventData>`
  - `class TrainingEvent extends Event<TrainingEventData>`
  - `class SleepEvent extends Event<SleepEventData>`
  - `class FoodEvent extends Event<FoodEventData>`
  - `class EventId`
  - `class Interruption`
  - `class TagList`

- [ ] **Step 1: Write failing domain tests for shared validation and type-specific payloads**

```ts
import { describe, expect, test } from "vitest";
import { TrainingEvent } from "./training-event.entity";
import { SleepEvent } from "./sleep-event.entity";

describe("Event entities", () => {
  test("rejects a finishedAt earlier than startedAt", () => {
    expect(() =>
      TrainingEvent.create({
        userId: "user-1",
        name: "Run",
        description: "Morning run",
        startedAt: new Date("2026-08-16T09:00:00-03:00"),
        finishedAt: new Date("2026-08-16T08:00:00-03:00"),
        tags: ["cardio"],
        interruptions: [],
        data: { caloriesBurned: 250 },
      }),
    ).toThrow("finishedAt must be equal to or after startedAt");
  });

  test("keeps trackedSleepTime independent from the event duration", () => {
    const sleepEvent = SleepEvent.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Imported manually",
      startedAt: new Date("2026-08-15T23:00:00-03:00"),
      finishedAt: new Date("2026-08-16T07:00:00-03:00"),
      tags: ["sleep"],
      interruptions: [],
      data: { trackedSleepTime: 6.5, score: 88 },
    });

    expect(sleepEvent.data.trackedSleepTime).toBe(6.5);
    expect(sleepEvent.getDurationMinutes()).toBe(480);
  });
});
```

- [ ] **Step 2: Run the domain tests to confirm they fail**

Run: `npm run test -- src/models/events/domain/entities/event.entity.test.ts`

Expected: FAIL because the entity and value object files do not exist yet.

- [ ] **Step 3: Implement `Event<TData>`, the specialized event classes, and the supporting value objects**

```ts
export abstract class Event<TData> {
  protected constructor(
    readonly id: string,
    readonly type: EventType,
    readonly userId: string,
    readonly name: string,
    readonly description: string,
    readonly startedAt: Date,
    readonly finishedAt: Date | undefined,
    readonly tags: string[],
    readonly interruptions: Interruption[],
    readonly data: TData,
  ) {
    if (finishedAt && finishedAt < startedAt) {
      throw new Error("finishedAt must be equal to or after startedAt");
    }
  }

  getDurationMinutes(): number | null {
    if (!this.finishedAt) return null;
    return Math.round((this.finishedAt.getTime() - this.startedAt.getTime()) / 60000);
  }
}
```

```ts
import { ulid } from "ulid";

export class EventId {
  static create(): string {
    return ulid();
  }
}
```

- [ ] **Step 4: Re-run the domain tests to verify the entities and value objects pass**

Run: `npm run test -- src/models/events/domain/entities/event.entity.test.ts`

Expected: PASS

- [ ] **Step 5: Build once to catch import/type mistakes from the new domain layer**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit the domain layer**

```bash
git add src/models/events/domain/types/event-type.ts src/models/events/domain/value-objects/event-id.ts src/models/events/domain/value-objects/interruption.ts src/models/events/domain/value-objects/tag-list.ts src/models/events/domain/entities/event.entity.ts src/models/events/domain/entities/routine-event.entity.ts src/models/events/domain/entities/training-event.entity.ts src/models/events/domain/entities/sleep-event.entity.ts src/models/events/domain/entities/food-event.entity.ts src/models/events/domain/entities/event.entity.test.ts
git commit -m "feat: add event domain entities"
```

### Task 3: Add Firestore persistence contracts, repositories, DAOs, and rules

**Files:**
- Create: `src/lib/firebase/client-app.ts`
- Create: `src/lib/firebase/client-auth.ts`
- Create: `src/lib/firebase/admin-app.ts`
- Create: `src/models/events/application/contracts/event-repository.ts`
- Create: `src/models/events/application/contracts/tag-repository.ts`
- Create: `src/models/events/infra/persistence/daos/firestore-event.dao.ts`
- Create: `src/models/events/infra/persistence/daos/firestore-tag.dao.ts`
- Create: `src/models/events/infra/persistence/repositories/mappers/event-document.mapper.ts`
- Create: `src/models/events/infra/persistence/repositories/mappers/tag-document.mapper.ts`
- Create: `src/models/events/infra/persistence/repositories/firestore-event.repository.ts`
- Create: `src/models/events/infra/persistence/repositories/firestore-tag.repository.ts`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Test: `src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts`

**Interfaces:**
- Consumes:
  - `Event<TData>` entities from Task 2
- Produces:
  - `interface EventRepository`
  - `interface TagRepository`
  - `class FirestoreEventDao`
  - `class FirestoreTagDao`
  - `class FirestoreEventRepository implements EventRepository`
  - `class FirestoreTagRepository implements TagRepository`
  - `class EventDocumentMapper`
  - `class TagDocumentMapper`

- [ ] **Step 1: Write a failing mapper round-trip test for a `TrainingEvent` document**

```ts
import { expect, test } from "vitest";
import { TrainingEvent } from "@/models/events/domain/entities/training-event.entity";
import { EventDocumentMapper } from "./event-document.mapper";

test("maps a training event to and from persistence", () => {
  const event = TrainingEvent.create({
    userId: "user-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    finishedAt: new Date("2026-08-16T19:00:00-03:00"),
    tags: ["gym", "legs"],
    interruptions: [],
    data: { caloriesBurned: 420 },
  });

  const document = EventDocumentMapper.toPersistence(event);
  const restored = EventDocumentMapper.toDomain(document);

  expect(document.type).toBe("training");
  expect(restored).toBeInstanceOf(TrainingEvent);
  expect(restored.tags).toEqual(["gym", "legs"]);
});
```

- [ ] **Step 2: Run the mapper test to confirm failure**

Run: `npm run test -- src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts`

Expected: FAIL because the persistence layer does not exist yet.

- [ ] **Step 3: Implement Firebase singletons, Firestore document mappers, DAOs, repositories, and owner-write/public-read rules**

```ts
export interface EventDocument {
  id: string;
  type: EventType;
  userId: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  interruptions: InterruptionProps[];
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

```ts
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{eventId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
    }

    match /tags/{tagId} {
      allow read: if true;
      allow create, update: if request.auth != null;
    }
  }
}
```

- [ ] **Step 4: Re-run the mapper test and a production build**

Run: `npm run test -- src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit the Firestore persistence foundation**

```bash
git add src/lib/firebase/client-app.ts src/lib/firebase/client-auth.ts src/lib/firebase/admin-app.ts src/models/events/application/contracts/event-repository.ts src/models/events/application/contracts/tag-repository.ts src/models/events/infra/persistence/daos/firestore-event.dao.ts src/models/events/infra/persistence/daos/firestore-tag.dao.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.ts src/models/events/infra/persistence/repositories/mappers/tag-document.mapper.ts src/models/events/infra/persistence/repositories/firestore-event.repository.ts src/models/events/infra/persistence/repositories/firestore-tag.repository.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts firestore.rules firestore.indexes.json
git commit -m "feat: add firestore repositories and rules"
```

### Task 4: Implement public read use cases, controllers, factories, and query routes

**Files:**
- Create: `src/models/events/application/dtos/timeline-event-card.dto.ts`
- Create: `src/models/events/application/dtos/daily-overview.dto.ts`
- Create: `src/models/events/application/dtos/tag-suggestion.dto.ts`
- Create: `src/models/events/application/usecases/list-timeline-events.usecase.ts`
- Create: `src/models/events/application/usecases/get-daily-overview.usecase.ts`
- Create: `src/models/events/application/usecases/suggest-tags.usecase.ts`
- Create: `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`
- Create: `src/models/events/infra/http/controller/list-timeline-events.controller.ts`
- Create: `src/models/events/infra/http/controller/get-daily-overview.controller.ts`
- Create: `src/models/events/infra/http/controller/suggest-tags.controller.ts`
- Create: `src/models/events/infra/factories/make-list-timeline-events-controller.ts`
- Create: `src/models/events/infra/factories/make-get-daily-overview-controller.ts`
- Create: `src/models/events/infra/factories/make-suggest-tags-controller.ts`
- Create: `src/app/api/events/route.ts`
- Create: `src/app/api/events/daily/route.ts`
- Create: `src/app/api/tags/route.ts`
- Test: `src/models/events/application/usecases/get-daily-overview.usecase.test.ts`

**Interfaces:**
- Consumes:
  - `EventRepository`
  - `TagRepository`
- Produces:
  - `class ListTimelineEventsUseCase { execute(input: { from?: string; to?: string; type?: EventType; tag?: string }): Promise<TimelineEventCardDto[]> }`
  - `class GetDailyOverviewUseCase { execute(input: { date: string; timeZone?: string }): Promise<DailyOverviewDto> }`
  - `class SuggestTagsUseCase { execute(input: { query: string; limit?: number }): Promise<TagSuggestionDto[]> }`
  - `GET /api/events`
  - `GET /api/events/daily`
  - `GET /api/tags`

- [ ] **Step 1: Write a failing daily overview use case test covering food totals, burned calories, and most recent sleep**

```ts
import { expect, test } from "vitest";
import { GetDailyOverviewUseCase } from "./get-daily-overview.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { SleepEvent } from "@/models/events/domain/entities/sleep-event.entity";
import { TrainingEvent } from "@/models/events/domain/entities/training-event.entity";
import { FoodEvent } from "@/models/events/domain/entities/food-event.entity";

test("builds the daily overview for a Sao Paulo day", async () => {
  const repository = new InMemoryEventRepository([
    SleepEvent.create({
      userId: "user-1",
      name: "Night sleep",
      description: "Manual entry",
      startedAt: new Date("2026-08-15T23:00:00-03:00"),
      finishedAt: new Date("2026-08-16T07:00:00-03:00"),
      tags: ["sleep"],
      interruptions: [],
      data: { trackedSleepTime: 6.5, score: 88 },
    }),
    TrainingEvent.create({
      userId: "user-1",
      name: "Leg day",
      description: "Gym session",
      startedAt: new Date("2026-08-16T18:00:00-03:00"),
      finishedAt: new Date("2026-08-16T19:00:00-03:00"),
      tags: ["gym"],
      interruptions: [],
      data: { caloriesBurned: 420 },
    }),
    FoodEvent.create({
      userId: "user-1",
      name: "Lunch",
      description: "Rice, chicken, and beans",
      startedAt: new Date("2026-08-16T12:00:00-03:00"),
      finishedAt: new Date("2026-08-16T12:30:00-03:00"),
      tags: ["lunch"],
      interruptions: [],
      data: {
        inputText: "arroz, frango e feijao",
        items: [],
        totals: {
          totalCaloriesKcal: 560,
          totalProteinGrams: 32,
          totalCarbohydrateGrams: 58,
          totalFatGrams: 12,
          totalFiberGrams: 8,
          totalMicronutrients: { ironMg: 4.1 },
        },
        modelProvider: "stub",
        modelName: "stub-model",
        parsedAt: new Date("2026-08-16T12:00:00-03:00"),
      },
    }),
  ]);
  const useCase = new GetDailyOverviewUseCase(repository);

  const overview = await useCase.execute({
    date: "2026-08-16",
    timeZone: "America/Sao_Paulo",
  });

  expect(overview.caloriesConsumed).toBe(560);
  expect(overview.caloriesBurned).toBe(420);
  expect(overview.macros.protein).toBe(32);
  expect(overview.sleep?.score).toBe(88);
});
```

- [ ] **Step 2: Run the daily overview test to confirm failure**

Run: `npm run test -- src/models/events/application/usecases/get-daily-overview.usecase.test.ts`

Expected: FAIL because the DTOs, use cases, and read controllers do not exist yet.

- [ ] **Step 3: Implement the public read DTOs, use cases, controllers, factories, and routes**

```ts
export class GetDailyOverviewUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: { date: string; timeZone?: string }): Promise<DailyOverviewDto> {
    const timeZone = input.timeZone ?? "America/Sao_Paulo";
    const events = await this.eventRepository.listByDay({
      date: input.date,
      timeZone,
    });

    const sleepEvents = events.filter((event) => event.type === "sleep");
    const foodEvents = events.filter((event) => event.type === "food");
    const trainingEvents = events.filter((event) => event.type === "training");

    return buildDailyOverview(input.date, sleepEvents, foodEvents, trainingEvents);
  }
}
```

```ts
export async function GET(request: Request) {
  const controller = makeGetDailyOverviewController();
  return controller.handle(request);
}
```

- [ ] **Step 4: Run the use case test and add one route smoke test for `/api/events/daily`**

Run: `npm run test -- src/models/events/application/usecases/get-daily-overview.usecase.test.ts`

Expected: PASS

Run: `npm run build`

Expected: PASS and route handlers compile.

- [ ] **Step 5: Commit the public read pipeline**

```bash
git add src/models/events/application/dtos/timeline-event-card.dto.ts src/models/events/application/dtos/daily-overview.dto.ts src/models/events/application/dtos/tag-suggestion.dto.ts src/models/events/application/usecases/list-timeline-events.usecase.ts src/models/events/application/usecases/get-daily-overview.usecase.ts src/models/events/application/usecases/suggest-tags.usecase.ts src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts src/models/events/infra/http/controller/list-timeline-events.controller.ts src/models/events/infra/http/controller/get-daily-overview.controller.ts src/models/events/infra/http/controller/suggest-tags.controller.ts src/models/events/infra/factories/make-list-timeline-events-controller.ts src/models/events/infra/factories/make-get-daily-overview-controller.ts src/models/events/infra/factories/make-suggest-tags-controller.ts src/app/api/events/route.ts src/app/api/events/daily/route.ts src/app/api/tags/route.ts src/models/events/application/usecases/get-daily-overview.usecase.test.ts
git commit -m "feat: add public event query routes"
```

### Task 5: Implement authenticated mutation use cases, controllers, factories, and owner checks

**Files:**
- Create: `src/lib/auth/auth-header.ts`
- Create: `src/lib/auth/verify-firebase-token.ts`
- Create: `src/models/events/application/dtos/create-event.input.ts`
- Create: `src/models/events/application/dtos/update-event.input.ts`
- Create: `src/models/events/application/usecases/create-event.usecase.ts`
- Create: `src/models/events/application/usecases/update-event.usecase.ts`
- Create: `src/models/events/application/usecases/delete-event.usecase.ts`
- Create: `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`
- Create: `src/models/events/application/usecases/test-doubles/in-memory-tag.repository.ts`
- Create: `src/models/events/application/usecases/test-doubles/stub-food-parsing.gateway.ts`
- Create: `src/models/events/infra/http/controller/create-event.controller.ts`
- Create: `src/models/events/infra/http/controller/update-event.controller.ts`
- Create: `src/models/events/infra/http/controller/delete-event.controller.ts`
- Create: `src/models/events/infra/factories/make-create-event-controller.ts`
- Create: `src/models/events/infra/factories/make-update-event-controller.ts`
- Create: `src/models/events/infra/factories/make-delete-event-controller.ts`
- Modify: `src/app/api/events/route.ts`
- Create: `src/app/api/events/[eventId]/route.ts`
- Test: `src/models/events/application/usecases/create-event.usecase.test.ts`

**Interfaces:**
- Consumes:
  - `EventRepository`
  - `TagRepository`
  - `FoodParsingGateway` interface, but only non-food cases are exercised in this task
  - `AuthenticatedUser`
- Produces:
  - `class CreateEventUseCase { execute(input: CreateEventInput, actor: AuthenticatedUser): Promise<{ eventId: string }> }`
  - `class UpdateEventUseCase { execute(input: UpdateEventInput, actor: AuthenticatedUser): Promise<void> }`
  - `class DeleteEventUseCase { execute(input: { eventId: string }, actor: AuthenticatedUser): Promise<void> }`
  - `POST /api/events`
  - `PATCH /api/events/[eventId]`
  - `DELETE /api/events/[eventId]`

- [ ] **Step 1: Write failing mutation tests for owner assignment, owner-only update, and tag upsert**

```ts
import { expect, test } from "vitest";
import { CreateEventUseCase } from "./create-event.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "./test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "./test-doubles/stub-food-parsing.gateway";

test("creates a training event for the authenticated owner and upserts tags", async () => {
  const eventRepository = new InMemoryEventRepository();
  const tagRepository = new InMemoryTagRepository();
  const foodGateway = new StubFoodParsingGateway();
  const result = await new CreateEventUseCase(eventRepository, tagRepository, foodGateway).execute(
    {
      type: "training",
      name: "Leg day",
      description: "Gym session",
      startedAt: "2026-08-16T18:00:00-03:00",
      finishedAt: "2026-08-16T19:00:00-03:00",
      tags: ["Gym", "Legs"],
      interruptions: [],
      data: { caloriesBurned: 420 },
    },
    { userId: "firebase-user-1" },
  );

  expect(result.eventId).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(tagRepository.upsertedTags).toEqual(["gym", "legs"]);
});
```

- [ ] **Step 2: Run the mutation test to confirm failure**

Run: `npm run test -- src/models/events/application/usecases/create-event.usecase.test.ts`

Expected: FAIL because the mutation use cases and auth helpers do not exist yet.

- [ ] **Step 3: Implement token verification, mutation use cases, owner checks, controllers, and routes**

```ts
export class CreateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly tagRepository: TagRepository,
    private readonly foodParsingGateway: FoodParsingGateway,
  ) {}

  async execute(input: CreateEventInput, actor: AuthenticatedUser) {
    if (input.type === "food") {
      throw new Error("food events require the parsing gateway and are temporarily disabled");
    }

    const event = createDomainEventFromInput(input, actor.userId);

    await this.eventRepository.save(event);
    await this.tagRepository.upsertMany(event.tags, actor.userId);

    return { eventId: event.id };
  }
}
```

```ts
export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const controller = makeUpdateEventController();
  return controller.handle(request, context);
}
```

- [ ] **Step 4: Re-run the mutation test and verify route compilation**

Run: `npm run test -- src/models/events/application/usecases/create-event.usecase.test.ts`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit the authenticated mutation pipeline**

```bash
git add src/lib/auth/auth-header.ts src/lib/auth/verify-firebase-token.ts src/models/events/application/dtos/create-event.input.ts src/models/events/application/dtos/update-event.input.ts src/models/events/application/usecases/create-event.usecase.ts src/models/events/application/usecases/update-event.usecase.ts src/models/events/application/usecases/delete-event.usecase.ts src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts src/models/events/application/usecases/test-doubles/in-memory-tag.repository.ts src/models/events/application/usecases/test-doubles/stub-food-parsing.gateway.ts src/models/events/infra/http/controller/create-event.controller.ts src/models/events/infra/http/controller/update-event.controller.ts src/models/events/infra/http/controller/delete-event.controller.ts src/models/events/infra/factories/make-create-event-controller.ts src/models/events/infra/factories/make-update-event-controller.ts src/models/events/infra/factories/make-delete-event-controller.ts src/app/api/events/route.ts src/app/api/events/[eventId]/route.ts src/models/events/application/usecases/create-event.usecase.test.ts
git commit -m "feat: add authenticated event mutations"
```

### Task 6: Add OpenRouter food parsing, totals calculation, and `FoodEvent` creation

**Files:**
- Create: `src/models/events/application/contracts/food-parsing.gateway.ts`
- Create: `src/models/events/application/services/food-prompt-builder.service.ts`
- Create: `src/models/events/application/services/food-totals.service.ts`
- Create: `src/models/events/infra/gateways/openrouter-food-parsing.gateway.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.ts`
- Modify: `src/models/events/application/usecases/update-event.usecase.ts`
- Modify: `src/models/events/infra/factories/make-create-event-controller.ts`
- Modify: `src/models/events/infra/factories/make-update-event-controller.ts`
- Test: `src/models/events/application/services/food-prompt-builder.service.test.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.test.ts`

**Interfaces:**
- Consumes:
  - `CreateEventUseCase`
  - `UpdateEventUseCase`
  - `FoodEvent`
  - `FoodParsingGateway`
- Produces:
  - `class FoodPromptBuilderService { build(inputText: string): string }`
  - `class FoodTotalsService { calculate(items: FoodItem[]): FoodTotals }`
  - `class OpenRouterFoodParsingGateway implements FoodParsingGateway`
  - full `food` support in `CreateEventUseCase` and `UpdateEventUseCase`

- [ ] **Step 1: Write failing tests for the prompt contract and food event creation**

```ts
import { expect, test } from "vitest";
import { FoodPromptBuilderService } from "./food-prompt-builder.service";

test("includes the strict english-key JSON contract in the prompt", () => {
  const prompt = new FoodPromptBuilderService().build(
    "1 banana. 2 colheres de iogurte natural e 5 morangos",
  );

  expect(prompt).toContain('"food"');
  expect(prompt).toContain('"approximateWeightGrams"');
  expect(prompt).toContain("As chaves do JSON devem estar em inglês");
});
```

```ts
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "./test-doubles/in-memory-tag.repository";
import { StubFoodParsingGateway } from "./test-doubles/stub-food-parsing.gateway";

test("creates a food event from parsed AI items and calculated totals", async () => {
  const eventRepository = new InMemoryEventRepository();
  const tagRepository = new InMemoryTagRepository();
  const useCase = new CreateEventUseCase(
    eventRepository,
    tagRepository,
    new StubFoodParsingGateway({
      items: [
        {
          food: "Banana prata",
          portion: "1 unidade média",
          approximateWeightGrams: 100,
          caloriesKcal: 89,
          macronutrients: {
            carbohydratesGrams: 22.8,
            proteinsGrams: 1.1,
            totalFatGrams: 0.3,
            fiberGrams: 2.6,
          },
          mainMicronutrients: {
            potassiumMg: 358,
            magnesiumMg: 27,
          },
          otherData: {
            sodiumMg: 1,
          },
        },
        {
          food: "Iogurte natural tradicional",
          portion: "2 colheres de sopa",
          approximateWeightGrams: 40,
          caloriesKcal: 45,
          macronutrients: {
            carbohydratesGrams: 4.0,
            proteinsGrams: 3.0,
            totalFatGrams: 1.5,
            fiberGrams: 0,
          },
          mainMicronutrients: {
            calciumMg: 48,
          },
          otherData: {
            sodiumMg: 18,
          },
        },
      ],
      modelProvider: "openrouter",
      modelName: "test-model",
    }),
  );

  const result = await useCase.execute(
    {
      type: "food",
      name: "Cafe da manha",
      description: "Banana, iogurte e morango",
      startedAt: "2026-08-16T08:00:00-03:00",
      tags: ["Breakfast"],
      interruptions: [],
      inputText: "1 banana. 2 colheres de iogurte natural e 5 morangos",
    },
    { userId: "firebase-user-1" },
  );

  expect(result.eventId).toBeDefined();
  expect(eventRepository.savedEvent?.type).toBe("food");
  expect(eventRepository.savedEvent?.data.totals.totalCaloriesKcal).toBe(134);
});
```

- [ ] **Step 2: Run the prompt and food creation tests to confirm failure**

Run: `npm run test -- src/models/events/application/services/food-prompt-builder.service.test.ts src/models/events/application/usecases/create-event.usecase.test.ts`

Expected: FAIL because food parsing is still not implemented.

- [ ] **Step 3: Implement the prompt builder, totals service, OpenRouter gateway, and food branches in the mutation use cases**

```ts
export class FoodPromptBuilderService {
  build(inputText: string): string {
    return [
      "Consulte os dados de calorias, micronutrientes e macronutrientes para cada um dos alimentos e responda apenas com JSON válido.",
      "As chaves do JSON devem estar em inglês, mas os valores podem permanecer em português quando necessário.",
      "Use exatamente esta estrutura por item:",
      JSON.stringify({
        food: "Banana prata",
        portion: "1 unidade média",
        approximateWeightGrams: 100,
        caloriesKcal: 89,
        macronutrients: {
          carbohydratesGrams: 22.8,
          proteinsGrams: 1.1,
          totalFatGrams: 0.3,
          fiberGrams: 2.6,
        },
        mainMicronutrients: {
          potassiumMg: 358,
          magnesiumMg: 27,
          vitaminCMg: 8.7,
          vitaminB6Mg: 0.4,
        },
        otherData: {
          glycemicIndex: 51,
          sodiumMg: 1,
        },
      }),
      `Texto do usuário: ${inputText}`,
    ].join("\n\n");
  }
}
```

```ts
if (input.type === "food") {
  const parsedMeal = await this.foodParsingGateway.parseMeal({ text: input.inputText });
  const totals = this.foodTotalsService.calculate(parsedMeal.items);

  const event = FoodEvent.create({
    userId: actor.userId,
    name: input.name,
    description: input.description,
    startedAt: new Date(input.startedAt),
    finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
    tags: input.tags,
    interruptions: input.interruptions,
    data: {
      inputText: input.inputText,
      items: parsedMeal.items,
      totals,
      modelProvider: parsedMeal.modelProvider,
      modelName: parsedMeal.modelName,
      parsedAt: new Date(),
    },
  });
}
```

- [ ] **Step 4: Re-run the food tests and the build**

Run: `npm run test -- src/models/events/application/services/food-prompt-builder.service.test.ts src/models/events/application/usecases/create-event.usecase.test.ts`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit the food parsing flow**

```bash
git add src/models/events/application/contracts/food-parsing.gateway.ts src/models/events/application/services/food-prompt-builder.service.ts src/models/events/application/services/food-totals.service.ts src/models/events/infra/gateways/openrouter-food-parsing.gateway.ts src/models/events/application/usecases/create-event.usecase.ts src/models/events/application/usecases/update-event.usecase.ts src/models/events/infra/factories/make-create-event-controller.ts src/models/events/infra/factories/make-update-event-controller.ts src/models/events/application/services/food-prompt-builder.service.test.ts src/models/events/application/usecases/create-event.usecase.test.ts
git commit -m "feat: add openrouter food parsing"
```

### Task 7: Build the public timeline UI, auth entry, and event creation/edit flows

**Files:**
- Create: `src/components/providers/app-providers.tsx`
- Create: `src/components/auth/google-sign-in-button.tsx`
- Create: `src/components/events/event-card.tsx`
- Create: `src/components/events/interruption-list.tsx`
- Create: `src/components/events/event-form.tsx`
- Create: `src/components/events/tag-combobox.tsx`
- Create: `src/components/events/event-type-select.tsx`
- Create: `src/components/events/food-fields.tsx`
- Create: `src/components/events/training-fields.tsx`
- Create: `src/components/events/sleep-fields.tsx`
- Create: `src/hooks/use-auth-session.ts`
- Create: `src/hooks/use-timeline-events.ts`
- Create: `src/hooks/use-tag-suggestions.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/events/event-card.test.tsx`
- Test: `src/components/events/event-form.test.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/events`
  - `GET /api/tags`
  - `POST /api/events`
  - `PATCH /api/events/[eventId]`
  - `DELETE /api/events/[eventId]`
  - `TimelineEventCardDto`
  - `CreateEventInput`
- Produces:
  - `function EventCard(props: { event: TimelineEventCardDto; canEdit: boolean; onEdit(): void; onDelete(): Promise<void> }): JSX.Element`
  - `function EventForm(props: { initialValue?: Partial<CreateEventInput>; onSubmit(input: CreateEventInput): Promise<void> }): JSX.Element`
  - authenticated create/edit/delete UI on the timeline page

- [ ] **Step 1: Write failing component tests for the timeline card layout and event-form branching**

```tsx
import { render, screen } from "@testing-library/react";
import { EventCard } from "./event-card";

test("renders the timeline card with interruption details", () => {
  render(
    <EventCard
      canEdit={false}
      onEdit={() => {}}
      onDelete={async () => {}}
      event={{
        id: "01J4...",
        type: "routine",
        accentColor: "blue",
        iconName: "clock",
        name: "Deep work",
        description: "Coding session",
        startedAt: "2026-08-16T09:00:00-03:00",
        finishedAt: "2026-08-16T11:00:00-03:00",
        durationLabel: "2h 00m",
        tags: ["focus"],
        interruptions: [
          {
            name: "Coffee break",
            description: "Kitchen stop",
            durationLabel: "10m",
          },
        ],
      }}
    />,
  );

  expect(screen.getByText("Deep work")).toBeInTheDocument();
  expect(screen.getByText("Interruptions")).toBeInTheDocument();
  expect(screen.getByText("Coffee break")).toBeInTheDocument();
});
```

```tsx
test("shows the food text input when the selected type is food", () => {
  render(<EventForm onSubmit={async () => {}} />);
  expect(screen.getByLabelText(/food description text/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component tests to confirm failure**

Run: `npm run test -- src/components/events/event-card.test.tsx src/components/events/event-form.test.tsx`

Expected: FAIL because the UI components do not exist yet.

- [ ] **Step 3: Implement providers, auth button, timeline cards, tag suggestions, and the event form**

```tsx
export function EventCard({ event, canEdit, onEdit, onDelete }: EventCardProps) {
  return (
    <article data-event-type={event.type}>
      <header>
        <div>
          <span>{event.iconName}</span>
          <h2>{event.name}</h2>
        </div>
        <div>{event.startedAt} - {event.finishedAt ?? "--"}</div>
      </header>
      <div>
        <p>{event.description}</p>
        <strong>{event.durationLabel}</strong>
      </div>
      {event.interruptions.length > 0 ? (
        <section>
          <h3>Interruptions</h3>
          <InterruptionList interruptions={event.interruptions} />
        </section>
      ) : null}
      {canEdit ? <button onClick={onEdit}>Edit</button> : null}
      {canEdit ? <button onClick={() => void onDelete()}>Delete</button> : null}
    </article>
  );
}
```

```tsx
{selectedType === "food" ? (
  <label>
    Food description text
    <textarea name="inputText" />
  </label>
) : null}
```

- [ ] **Step 4: Re-run the component tests and build the app**

Run: `npm run test -- src/components/events/event-card.test.tsx src/components/events/event-form.test.tsx`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit the timeline UI and mutation form flow**

```bash
git add src/components/providers/app-providers.tsx src/components/auth/google-sign-in-button.tsx src/components/events/event-card.tsx src/components/events/interruption-list.tsx src/components/events/event-form.tsx src/components/events/tag-combobox.tsx src/components/events/event-type-select.tsx src/components/events/food-fields.tsx src/components/events/training-fields.tsx src/components/events/sleep-fields.tsx src/hooks/use-auth-session.ts src/hooks/use-timeline-events.ts src/hooks/use-tag-suggestions.ts src/app/layout.tsx src/app/page.tsx src/components/events/event-card.test.tsx src/components/events/event-form.test.tsx
git commit -m "feat: add timeline ui and event forms"
```

### Task 8: Build the daily overview screen and finish end-to-end verification

**Files:**
- Create: `src/components/daily/summary-card.tsx`
- Create: `src/components/daily/sleep-summary-card.tsx`
- Create: `src/components/daily/micros-dropdown.tsx`
- Create: `src/components/daily/food-event-card.tsx`
- Create: `src/components/daily/training-event-card.tsx`
- Create: `src/hooks/use-daily-overview.ts`
- Modify: `src/app/daily/page.tsx`
- Test: `src/app/daily/page.test.tsx`
- Test: `src/components/daily/micros-dropdown.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes:
  - `GET /api/events/daily`
  - `DailyOverviewDto`
- Produces:
  - `function MicrosDropdown(props: { micronutrients: Record<string, number> }): JSX.Element`
  - `function DailyPage(): JSX.Element` rendering sleep, calories, macros, micros, food cards, and training cards

- [ ] **Step 1: Write failing UI tests for the daily overview cards and micros dropdown**

```tsx
import { render, screen } from "@testing-library/react";
import DailyPage from "./page";

test("renders the daily summary cards", () => {
  render(<DailyPage />);

  expect(screen.getByText(/sleep/i)).toBeInTheDocument();
  expect(screen.getByText(/calories consumed/i)).toBeInTheDocument();
  expect(screen.getByText(/calories burned/i)).toBeInTheDocument();
  expect(screen.getByText(/macros/i)).toBeInTheDocument();
  expect(screen.getByText(/micros/i)).toBeInTheDocument();
});
```

```tsx
test("toggles the micronutrient list", async () => {
  render(
    <MicrosDropdown micronutrients={{ potassiumMg: 358, vitaminCMg: 8.7 }} />,
  );

  await user.click(screen.getByRole("button", { name: /show micros/i }));
  expect(screen.getByText(/potassiumMg/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the daily overview tests to confirm failure**

Run: `npm run test -- src/app/daily/page.test.tsx src/components/daily/micros-dropdown.test.tsx`

Expected: FAIL because the daily UI components do not exist yet.

- [ ] **Step 3: Implement the daily page, summary cards, food/training cards, and micros dropdown**

```tsx
export default function DailyPage() {
  const { data, isLoading } = useDailyOverview();

  if (isLoading) return <main>Loading...</main>;
  if (!data) return <main>No data for this day.</main>;

  return (
    <main>
      <SleepSummaryCard sleep={data.sleep} />
      <SummaryCard title="Calories consumed" value={String(data.caloriesConsumed)} />
      <SummaryCard title="Calories burned" value={String(data.caloriesBurned)} />
      <SummaryCard title="Macros" value={`${data.macros.protein} / ${data.macros.carbohydrate} / ${data.macros.fat}`} />
      <MicrosDropdown micronutrients={data.micronutrients} />
      {data.foodEvents.map((event) => <FoodEventCard key={event.id} event={event} />)}
      {data.trainingEvents.map((event) => <TrainingEventCard key={event.id} event={event} />)}
    </main>
  );
}
```

- [ ] **Step 4: Run the full targeted test set and one production build**

Run: `npm run test -- src/models/events/domain/entities/event.entity.test.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/application/usecases/get-daily-overview.usecase.test.ts src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/services/food-prompt-builder.service.test.ts src/components/events/event-card.test.tsx src/components/events/event-form.test.tsx src/app/daily/page.test.tsx src/components/daily/micros-dropdown.test.tsx`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Update the README with Firebase, Firestore, and OpenRouter setup plus local verification commands**

```md
## Environment variables

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
```

- [ ] **Step 6: Commit the daily view and final verification checkpoint**

```bash
git add src/components/daily/summary-card.tsx src/components/daily/sleep-summary-card.tsx src/components/daily/micros-dropdown.tsx src/components/daily/food-event-card.tsx src/components/daily/training-event-card.tsx src/hooks/use-daily-overview.ts src/app/daily/page.tsx src/app/daily/page.test.tsx src/components/daily/micros-dropdown.test.tsx README.md
git commit -m "feat: add daily overview screen"
```

## Self-Review

### Spec coverage

- Public read without login: Tasks 4, 7, and 8
- Google login with Firebase Authentication: Tasks 3 and 7
- Owner-only create, edit, delete: Tasks 3 and 5
- Timeline as main screen: Task 7
- Daily diet/training summary: Tasks 4 and 8
- Dynamic tag suggestions: Tasks 3, 4, 5, and 7
- Food parsing via OpenRouter with English JSON keys: Task 6
- DDD backend under `src/models`: Tasks 2 through 6
- ULID ids: Task 2
- Firestore rules plus backend enforcement: Tasks 3 and 5
- Vercel/Firebase/OpenRouter setup guidance: Task 8 via README, plus the already-approved spec

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task includes explicit files, interfaces, tests, implementation direction, verification commands, and commit commands.

### Type consistency

- `CreateEventInput`, `UpdateEventInput`, `TimelineEventCardDto`, `DailyOverviewDto`, `EventRepository`, `TagRepository`, and `FoodParsingGateway` are defined once in Shared Interfaces and reused consistently.
- `TrainingEvent` is the canonical training entity name everywhere.
- `trackedSleepTime` is used consistently in the domain and daily summary DTO.
