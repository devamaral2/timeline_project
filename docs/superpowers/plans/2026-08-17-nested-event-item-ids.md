# Nested Event Item IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure nested `food` and `training` event items always have stable IDs for future update/delete operations, including legacy Firestore documents that do not yet store those IDs.

**Architecture:** Normalize nested data at the domain entity boundary so every `FoodEvent` and `TrainingEvent` instance has IDs on embedded items. Preserve existing IDs when present and generate missing ones with `ulid()` when creating new events or hydrating old persisted documents.

**Tech Stack:** TypeScript, Vitest, ULID, Firestore document mapper

## Global Constraints

- Use `ulid()` for embedded item IDs instead of relying on Firestore auto IDs because these items are stored inside event documents.
- Preserve backward compatibility when reading legacy documents without nested IDs.
- Add tests first and verify they fail before production changes.

---

### Task 1: Cover nested ID normalization with tests

**Files:**
- Modify: `src/models/events/domain/entities/event.entity.test.ts`
- Modify: `src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.test.ts`

**Interfaces:**
- Consumes: `FoodEvent.create(props)`, `TrainingEvent.create(props)`, `EventDocumentMapper.toDomain(document)`
- Produces: Failing tests that assert `FoodItem.id`, `Workout.id`, and `WorkoutSet.id` are present and preserved

- [ ] **Step 1: Write the failing tests**

```ts
test("assigns ids to nested training items", () => {
  const event = TrainingEvent.create({
    userId: "user-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: {
      workouts: [
        {
          type: "weightlifting",
          calories: 420,
          duration: 60,
          sets: [{ exercise: "Squat", repetitions: 8, weight: 100 }],
        },
      ],
    },
  });

  expect(event.data.workouts[0]).toHaveProperty("id");
  expect(event.data.workouts[0].sets[0]).toHaveProperty("id");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/models/events/domain/entities/event.entity.test.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/application/usecases/create-event.usecase.test.ts`
Expected: FAIL because embedded items do not currently expose `id`

- [ ] **Step 3: Write minimal implementation**

```ts
function ensureNestedId<T extends { id?: string }>(value: T): T & { id: string } {
  return { ...value, id: value.id ?? ulid() };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/models/events/domain/entities/event.entity.test.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/application/usecases/create-event.usecase.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-17-nested-event-item-ids.md src/models/events/domain/entities/event.entity.test.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/application/usecases/create-event.usecase.test.ts
git commit -m "test: cover nested event item ids"
```

### Task 2: Normalize nested IDs in food and training entities

**Files:**
- Modify: `src/models/events/domain/entities/food-event.entity.ts`
- Modify: `src/models/events/domain/entities/training-event.entity.ts`

**Interfaces:**
- Consumes: `EventProps<FoodEventData>`, `EventProps<TrainingEventData>`
- Produces: `FoodEvent.create(props)` and `TrainingEvent.create(props)` that always return nested items with IDs

- [ ] **Step 1: Write the failing implementation-facing test cases if any gap remains**

```ts
expect(foodEvent.data.items.every((item) => typeof item.id === "string")).toBe(true);
expect(trainingEvent.data.workouts.every((workout) => typeof workout.id === "string")).toBe(true);
```

- [ ] **Step 2: Run focused tests before editing**

Run: `npm test -- src/models/events/domain/entities/event.entity.test.ts`
Expected: FAIL or confirm existing failing coverage remains

- [ ] **Step 3: Write minimal implementation**

```ts
const normalizedItems = props.data.items.map((item) => ({ ...item, id: item.id ?? ulid() }));
const normalizedWorkouts = props.data.workouts.map((workout) =>
  workout.type === "weightlifting"
    ? { ...workout, id: workout.id ?? ulid(), sets: workout.sets.map((set) => ({ ...set, id: set.id ?? ulid() })) }
    : { ...workout, id: workout.id ?? ulid() },
);
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- src/models/events/domain/entities/event.entity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/events/domain/entities/food-event.entity.ts src/models/events/domain/entities/training-event.entity.ts
git commit -m "feat: normalize nested event item ids"
```

### Task 3: Verify creation flow and legacy document hydration

**Files:**
- Modify: `src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts`
- Modify: `src/models/events/application/usecases/create-event.usecase.test.ts`

**Interfaces:**
- Consumes: `CreateEventUseCase.execute(input, actor)`, `EventDocumentMapper.toDomain(document)`
- Produces: Regression coverage proving new events and restored legacy events carry nested IDs

- [ ] **Step 1: Add assertions for create/hydrate paths**

```ts
expect(savedFoodEvent.data.items[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
expect(restoredTrainingEvent.data.workouts[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
```

- [ ] **Step 2: Run targeted tests to verify behavior**

Run: `npm test -- src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/application/usecases/create-event.usecase.test.ts`
Expected: PASS

- [ ] **Step 3: Run final regression set**

Run: `npm test -- src/models/events/domain/entities/event.entity.test.ts src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/models/events/infra/persistence/repositories/mappers/event-document.mapper.test.ts src/models/events/application/usecases/create-event.usecase.test.ts src/models/events/infra/persistence/repositories/firestore-event.repository.test.ts
git commit -m "test: verify nested ids across event persistence"
```
