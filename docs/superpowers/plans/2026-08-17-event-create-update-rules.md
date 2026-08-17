# Event Creation and Update Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the event creation and update routes with the new business rules for automatic timestamps, event-specific naming, tag synchronization, interruption handling, and nested update semantics.

**Architecture:** Split the work into three layers: input contracts that reject forbidden payload shapes, application-layer normalization/merge services that derive server-owned fields, and repository support for closing the latest open event before a new one is created. Keep entity constructors responsible for invariant enforcement and ID normalization, while the use cases own cross-event behaviors and partial-update merge rules.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, Firestore repositories, ULID

## Global Constraints

- Treat the user request in this plan as the source of truth for event create/update behavior.
- Creation must never trust client-provided `startedAt`, `finishedAt`, `interruptions`, `type`-specific auto names, or `userId`.
- Update must never allow changes to `type` or `userId`.
- Tags are always submitted as a full array on create/update; every submitted tag must be normalized and upserted if missing.
- New interruptions, `food.items`, `training.workouts`, and `weightlifting.sets` without `id` must receive generated IDs during normalization.
- `description` is optional in requests even if persistence currently stores it as a string.
- Add tests first and confirm they fail before implementing each production change.

## Requested Behavior Summary

- Create route:
  - When a new event is created, the latest event for the same user must be finished with the current datetime if it does not already have `finishedAt`.
  - The request must never accept `startedAt` or `finishedAt`.
  - `startedAt` is always `now()`.
  - `finishedAt` starts undefined.
  - `description` is optional.
  - `tags` is optional and must be an array when present.
  - Submitted tags must be created in the tag list if they do not already exist.
  - `interruptions` cannot be created together with the event.
  - `sleep` events always use `name = "Sono"` and may optionally receive `trackedSleepTime` and `score`.
  - `routine` events must receive `name` from the route payload.
  - `training` events always use `name = "Treino"` and may optionally receive a `workouts` array that follows `src/models/events/domain/entities/training-event.entity.ts`.
  - `food` events never receive `name` from the user; the system derives the name from the creation time and `inputText` is mandatory.
- Update route:
  - The route must not alter `type` or `userId`.
  - Shared editable fields are `name`, `description`, `finishedAt`, `tags`, and `interruptions`.
  - Tags must always be sent as the full final array.
  - Submitted tags must be added to the global tag list if missing.
  - New interruptions must be appended to existing interruptions.
  - Every interruption must have `name`; `description`, `startedAt`, and `finishedAt` are optional.
  - Missing interruption timestamps default to `now()` and `now() + 2 minutes`.
  - If `interruptions` is present, items without `id` are created and items with `id` patch only the fields sent in the request.
  - `food` updates must receive the full `items` array; all `foodItem` fields except `food` and `id` are editable, and new items without `id` must receive generated IDs.
  - `sleep` updates may edit `score` and `trackedSleepTime`.
  - `training` updates must receive the full `workouts` array; every workout field is editable, new workout IDs must be generated, and `weightlifting.sets` without `id` must also receive generated IDs.

---

### Task 1: Redesign request contracts around server-owned create/update fields

**Files:**
- Modify: `src/models/events/application/dtos/create-event.input.ts`
- Modify: `src/models/events/application/dtos/update-event.input.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.test.ts`
- Create: `src/models/events/application/usecases/update-event.usecase.test.ts`

**Interfaces:**
- Consumes: current `CreateEventInput`, current `UpdateEventInput`, `CreateEventUseCase.execute(input, actor)`, `UpdateEventUseCase.execute(input, actor)`
- Produces:
  - `CreateEventInput` variants that omit `startedAt`, `finishedAt`, and `interruptions`
  - `UpdateEventInput` variants that omit `type` and `userId`, and allow partial event-specific payloads plus interruption patch items

- [ ] **Step 1: Write the failing tests for the new contracts**

```ts
test("creates a training event with server-defined timestamps and name", async () => {
  const result = await useCase.execute(
    {
      type: "training",
      description: "Gym session",
      tags: ["Gym"],
      data: { workouts: [{ type: "running", pace: 320, distance: 5, duration: 25, calories: 320 }] },
    },
    { userId: "firebase-user-1" },
  );

  const savedEvent = await eventRepository.findById(result.eventId);
  expect(savedEvent?.name).toBe("Treino");
  expect(savedEvent?.finishedAt).toBeUndefined();
  expect(savedEvent?.interruptions).toEqual([]);
});

test("updates an event without requiring type or startedAt in the payload", async () => {
  await expect(
    updateUseCase.execute(
      {
        eventId: existingEvent.id,
        description: "Updated description",
        tags: ["focus"],
      },
      { userId: "firebase-user-1" },
    ),
  ).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/usecases/update-event.usecase.test.ts`
Expected: FAIL because the DTOs and use cases still require client-owned timestamp/name/interruption fields

- [ ] **Step 3: Write minimal contract changes**

```ts
export interface CreateBaseEventInput {
  description?: string;
  tags?: string[];
}

export type CreateEventInput =
  | { type: "routine"; name: string; description?: string; tags?: string[] }
  | { type: "sleep"; description?: string; tags?: string[]; data?: Partial<SleepEventData> }
  | { type: "training"; description?: string; tags?: string[]; data?: { workouts?: Workout[] } }
  | { type: "food"; description?: string; tags?: string[]; inputText: string };

export interface InterruptionPatchInput {
  id?: string;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
}
```

- [ ] **Step 4: Run tests to verify the contract layer is aligned**

Run: `npm test -- src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/usecases/update-event.usecase.test.ts`
Expected: FAIL now moves from type-shape errors to missing production behavior, confirming the contract redesign is wired in

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-17-event-create-update-rules.md src/models/events/application/dtos/create-event.input.ts src/models/events/application/dtos/update-event.input.ts src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/usecases/update-event.usecase.test.ts
git commit -m "test: redefine event create and update contracts"
```

### Task 2: Implement create-flow normalization and close the latest open event

**Files:**
- Modify: `src/models/events/application/contracts/event-repository.ts`
- Modify: `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`
- Modify: `src/models/events/infra/persistence/daos/firestore-event.dao.ts`
- Modify: `src/models/events/infra/persistence/repositories/firestore-event.repository.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.test.ts`
- Create: `src/models/events/application/services/event-creation-normalizer.service.ts`
- Create: `src/models/events/application/services/event-creation-normalizer.service.test.ts`

**Interfaces:**
- Consumes: `CreateEventInput`, `EventRepository.save(event)`, `TagRepository.upsertMany(tags, userId)`
- Produces:
  - `EventRepository.findLatestOpenByUserId(userId): Promise<DomainEvent | null>`
  - `normalizeCreateEventInput(input, now): NormalizedCreateEvent`
  - create flow that closes the previous open event before saving the new one

- [ ] **Step 1: Write failing tests for automatic close + server-owned create fields**

```ts
test("finishes the latest open event before creating a new one", async () => {
  const openEvent = TrainingEvent.create({
    id: "01K2TESTOPENEVENT1234567890",
    userId: "firebase-user-1",
    name: "Treino",
    description: "",
    startedAt: new Date("2026-08-17T08:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: { workouts: [] },
  });

  const eventRepository = new InMemoryEventRepository([openEvent]);
  const beforeCreate = new Date();
  const result = await useCase.execute({ type: "routine", name: "Planejamento" }, { userId: "firebase-user-1" });
  const updatedOpenEvent = await eventRepository.findById(openEvent.id);

  expect(updatedOpenEvent?.finishedAt).toBeInstanceOf(Date);
  expect(updatedOpenEvent?.finishedAt?.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
  expect(result.eventId).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/services/event-creation-normalizer.service.test.ts`
Expected: FAIL because the repository cannot query the latest open event and creation still trusts client timestamps/names

- [ ] **Step 3: Write minimal implementation**

```ts
export interface EventRepository {
  findLatestOpenByUserId(userId: string): Promise<DomainEvent | null>;
}

const previousOpenEvent = await this.eventRepository.findLatestOpenByUserId(actor.userId);
if (previousOpenEvent && !previousOpenEvent.finishedAt) {
  const closedPreviousEvent = recreateEventWithChanges(previousOpenEvent, { finishedAt: now });
  await this.eventRepository.update(closedPreviousEvent, actor.userId);
}

const normalized = normalizeCreateEventInput(input, now);
await this.eventRepository.save(buildDomainEvent(normalized, actor.userId));
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/services/event-creation-normalizer.service.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/events/application/contracts/event-repository.ts src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts src/models/events/infra/persistence/daos/firestore-event.dao.ts src/models/events/infra/persistence/repositories/firestore-event.repository.ts src/models/events/application/usecases/create-event.usecase.ts src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/services/event-creation-normalizer.service.ts src/models/events/application/services/event-creation-normalizer.service.test.ts
git commit -m "feat: normalize event creation and close open events"
```

### Task 3: Enforce type-specific creation rules for sleep, training, routine, and food

**Files:**
- Modify: `src/models/events/application/usecases/create-event.usecase.ts`
- Modify: `src/models/events/domain/entities/sleep-event.entity.ts`
- Modify: `src/models/events/domain/entities/training-event.entity.ts`
- Modify: `src/models/events/domain/entities/food-event.entity.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.test.ts`
- Create: `src/models/events/application/services/food-event-name.service.ts`
- Create: `src/models/events/application/services/food-event-name.service.test.ts`

**Interfaces:**
- Consumes: `normalizeCreateEventInput(input, now)`, `FoodParsingGateway.parseMeal({ text })`, `TrainingEvent.create(props)`
- Produces:
  - derived names for `sleep`, `training`, and `food`
  - optional `SleepEventData`
  - optional `training.data.workouts`
  - food meal-name derivation based on the creation clock

- [ ] **Step 1: Write failing tests for per-type create rules**

```ts
test.each([
  ["2026-08-17T05:00:00-03:00", "Desjejum"],
  ["2026-08-17T07:00:00-03:00", "Café da manhã"],
  ["2026-08-17T10:30:00-03:00", "Colação"],
  ["2026-08-17T12:00:00-03:00", "Almoço"],
  ["2026-08-17T16:30:00-03:00", "Lanche da tarde"],
  ["2026-08-17T20:00:00-03:00", "Jantar"],
])("derives the correct food name for %s", async (iso, expectedName) => {
  const event = await createFoodEventFromInput(
    { type: "food", description: "", tags: [], inputText: "banana" },
    "firebase-user-1",
    foodGateway,
    totalsService,
    new Date(iso),
  );

  expect(event.name).toBe(expectedName);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/services/food-event-name.service.test.ts`
Expected: FAIL because names and optional payload rules are not yet derived by the server

- [ ] **Step 3: Write minimal implementation**

```ts
function deriveEventName(input: CreateEventInput, now: Date): string {
  if (input.type === "routine") return input.name;
  if (input.type === "sleep") return "Sono";
  if (input.type === "training") return "Treino";
  return getFoodEventName(now);
}

const sleepData: SleepEventData = {
  trackedSleepTime: input.data?.trackedSleepTime ?? 0,
  score: input.data?.score ?? 0,
};
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/services/food-event-name.service.test.ts src/models/events/domain/entities/event.entity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/events/application/usecases/create-event.usecase.ts src/models/events/domain/entities/sleep-event.entity.ts src/models/events/domain/entities/training-event.entity.ts src/models/events/domain/entities/food-event.entity.ts src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/services/food-event-name.service.ts src/models/events/application/services/food-event-name.service.test.ts
git commit -m "feat: enforce type-specific event creation rules"
```

### Task 4: Implement patch-style updates, interruption merge rules, and nested editable arrays

**Files:**
- Modify: `src/models/events/application/usecases/update-event.usecase.ts`
- Modify: `src/models/events/application/dtos/update-event.input.ts`
- Modify: `src/models/events/domain/value-objects/interruption.ts`
- Modify: `src/models/events/domain/entities/food-event.entity.ts`
- Modify: `src/models/events/domain/entities/training-event.entity.ts`
- Modify: `src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts`
- Create: `src/models/events/application/services/event-update-merger.service.ts`
- Create: `src/models/events/application/services/event-update-merger.service.test.ts`
- Create: `src/models/events/application/usecases/update-event.usecase.test.ts`

**Interfaces:**
- Consumes: `existingEvent: DomainEvent`, `UpdateEventInput`, `TagRepository.upsertMany(tags, userId)`
- Produces:
  - `mergeEventUpdate(existingEvent, input, now): DomainEvent`
  - interruption patch semantics that append new interruptions and patch existing ones by `id`
  - full-array replacement semantics for `tags`, `food.items`, and `training.workouts`

- [ ] **Step 1: Write failing tests for merge semantics**

```ts
test("appends new interruptions and patches existing ones by id", async () => {
  await useCase.execute(
    {
      eventId: existingEvent.id,
      interruptions: [
        { id: existingInterruption.id, description: "Updated pause" },
        { name: "Phone call" },
      ],
    },
    { userId: "firebase-user-1" },
  );

  const savedEvent = await eventRepository.findById(existingEvent.id);
  expect(savedEvent?.interruptions).toHaveLength(2);
  expect(savedEvent?.interruptions[0].description).toBe("Updated pause");
  expect(savedEvent?.interruptions[1].finishedAt.getTime() - savedEvent?.interruptions[1].startedAt.getTime()).toBe(120000);
});

test("updates food items without changing food or id", async () => {
  await useCase.execute({
    eventId: existingFoodEvent.id,
    data: {
      items: [
        {
          id: existingItem.id,
          food: existingItem.food,
          portion: "200 g",
          approximateWeightGrams: 200,
          caloriesKcal: 180,
          macronutrients: existingItem.macronutrients,
          mainMicronutrients: existingItem.mainMicronutrients,
          otherData: existingItem.otherData,
        },
      ],
    },
  }, actor);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/models/events/application/usecases/update-event.usecase.test.ts src/models/events/application/services/event-update-merger.service.test.ts`
Expected: FAIL because update still rebuilds events from create input instead of merging with the persisted event

- [ ] **Step 3: Write minimal implementation**

```ts
function buildInterruption(input: InterruptionPatchInput, now: Date): Interruption {
  const startedAt = input.startedAt ? new Date(input.startedAt) : now;
  const finishedAt = input.finishedAt ? new Date(input.finishedAt) : new Date(now.getTime() + 120000);
  return Interruption.create({
    id: input.id,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description ?? "",
    startedAt,
    finishedAt,
  });
}

const mergedTags = input.tags ? [...input.tags] : existingEvent.tags;
const mergedFoodItems = input.data?.items ? normalizeFoodItems(input.data.items, existingEvent.data.items) : existingEvent.data.items;
const mergedWorkouts = input.data?.workouts ? normalizeTrainingWorkouts(input.data.workouts) : existingEvent.data.workouts;
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- src/models/events/application/usecases/update-event.usecase.test.ts src/models/events/application/services/event-update-merger.service.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/events/application/usecases/update-event.usecase.ts src/models/events/application/dtos/update-event.input.ts src/models/events/domain/value-objects/interruption.ts src/models/events/domain/entities/food-event.entity.ts src/models/events/domain/entities/training-event.entity.ts src/models/events/application/usecases/test-doubles/in-memory-event.repository.ts src/models/events/application/services/event-update-merger.service.ts src/models/events/application/services/event-update-merger.service.test.ts src/models/events/application/usecases/update-event.usecase.test.ts
git commit -m "feat: merge event updates and interruption patches"
```

### Task 5: Verify route-level behavior and regression coverage end-to-end

**Files:**
- Modify: `src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts`
- Modify: `src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`
- Create: `src/models/events/infra/http/controller/create-event.controller.test.ts`
- Create: `src/models/events/infra/http/controller/update-event.controller.test.ts`
- Modify: `src/app/api/events/route.ts`
- Modify: `src/app/api/events/[eventId]/route.ts`

**Interfaces:**
- Consumes: `CreateEventController.handle(request)`, `UpdateEventController.handle(request, context)`, `EventDocumentMapper.toPersistence(event)`
- Produces:
  - regression tests proving the route payloads match the new contracts
  - persistence tests proving server-derived fields remain stable through Firestore mapping

- [ ] **Step 1: Write failing route/controller regression tests**

```ts
test("POST /api/events ignores forbidden create fields from the client payload", async () => {
  const request = new Request("http://localhost/api/events", {
    method: "POST",
    body: JSON.stringify({
      type: "sleep",
      name: "Hack",
      startedAt: "2020-01-01T00:00:00.000Z",
      finishedAt: "2020-01-01T01:00:00.000Z",
      interruptions: [{ name: "Not allowed" }],
    }),
  });

  const response = await controller.handle(request);
  expect(response.status).toBe(201);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/models/events/infra/http/controller/create-event.controller.test.ts src/models/events/infra/http/controller/update-event.controller.test.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`
Expected: FAIL because no route/controller coverage exists yet for the new request semantics

- [ ] **Step 3: Write minimal implementation and assertions**

```ts
expect(persistedEvent.startedAt).toBeDefined();
expect(persistedEvent.finishedAt).toBeUndefined();
expect(persistedEvent.name).toBe("Sono");
expect(persistedEvent.interruptions).toEqual([]);
```

- [ ] **Step 4: Run final regression suite**

Run: `npm test -- src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/application/usecases/update-event.usecase.test.ts src/models/events/application/services/event-creation-normalizer.service.test.ts src/models/events/application/services/event-update-merger.service.test.ts src/models/events/application/services/food-event-name.service.test.ts src/models/events/infra/http/controller/create-event.controller.test.ts src/models/events/infra/http/controller/update-event.controller.test.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts src/models/events/infra/http/controller/create-event.controller.test.ts src/models/events/infra/http/controller/update-event.controller.test.ts src/app/api/events/route.ts src/app/api/events/[eventId]/route.ts
git commit -m "test: verify event route rules end to end"
```

## Self-Review

- Spec coverage:
  - Automatic close of the latest open event is covered in Task 2.
  - Create payload restrictions, optional description/tags, and tag upsert behavior are covered in Tasks 1 and 2.
  - Event-specific creation rules for sleep, routine, training, and food are covered in Task 3.
  - Update immutability rules, interruption merge behavior, and nested array update semantics are covered in Task 4.
  - Route and persistence regressions are covered in Task 5.
- Placeholder scan:
  - No `TODO`, `TBD`, or unnamed helper references remain; each new helper/service is named explicitly.
- Type consistency:
  - `findLatestOpenByUserId`, `normalizeCreateEventInput`, and `mergeEventUpdate` are referenced consistently across tasks.

## Missing-Or-Ambiguous Items To Resolve During Implementation

- The request says `description` is optional, but current entities persist `description` as required `string`; implementation should normalize omitted values to `""` unless the domain model is intentionally widened to `string | undefined`.
- The request says sleep create data is optional; if omitted, the implementation should decide whether to persist `{ trackedSleepTime: 0, score: 0 }` or allow a partial/empty sleep data shape end-to-end.
- Food meal-name derivation depends on the server clock timezone; implementation should make the chosen timezone explicit and cover boundary times with tests.
- The plan assumes the "latest event" means the latest started event for the same user whose `finishedAt` is missing. If the product wants a different definition, adjust Task 2 before coding.

Plan complete and saved to `docs/superpowers/plans/2026-08-17-event-create-update-rules.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
