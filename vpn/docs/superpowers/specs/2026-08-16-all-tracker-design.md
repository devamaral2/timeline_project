# All Tracker Design

Date: 2026-08-16
Status: Draft approved in conversation, written for final user review

## 1. Objective

Build the first product design for a multi-user event tracking application using Next.js, Firebase Authentication, Firestore, Vercel, and OpenRouter.

The application is centered on a public timeline/routine tracker with authenticated write access. Users can create, edit, and delete their own events after logging in with Google through Firebase Authentication. Any visitor can view all events without logging in.

The first supported event types are:

- `RoutineEvent`
- `FoodEvent`
- `TrainingEvent`
- `SleepEvent`

The design must remain extensible so new event types can be added later without forcing a large refactor of the domain or persistence layers.

## 2. Product Scope for V1

### Included

- Public event visualization without login
- Google login with Firebase Authentication
- Authenticated create, edit, and delete for the event owner
- Timeline as the main screen
- Daily diet and training summary as a secondary screen
- Dynamic reusable tags with suggestion support
- Food event creation from free text interpreted through OpenRouter
- Firestore persistence for events and tags
- Backend organization under `src/models` using DDD

### Excluded from V1

- Automatic sync with Zepp or other wearable providers
- User-defined event schema builder UI
- Private events
- Per-user visibility restrictions
- Advanced analytics beyond the daily summary view

## 3. High-Level Architecture

### 3.1 Main stack

- Frontend: Next.js
- Authentication: Firebase Authentication with Google Sign-In
- Database: Cloud Firestore
- Hosting: Vercel
- AI integration for food parsing: OpenRouter

### 3.2 Architectural direction

Next.js acts as the delivery layer and server entry point, but the backend behavior must be driven by the domain/application layers inside `src/models`.

Controllers must stay thin. Business rules, orchestration, and persistence translation must live in the model structure.

### 3.3 Backend structure

```text
src/
  models/
    events/
      domain/
        entities/
        value-objects/
      application/
        services/
        usecases/
      infra/
        http/
          controller/
        persistence/
          repositories/
            mappers/
          daos/
        factories/
```

Additional folders may be introduced when justified by complexity, but this is the baseline structure.

## 4. DDD Roles and Construction Rules

### 4.1 Role of each layer

- `domain/entities`: instantiated domain classes with behavior and invariants
- `domain/value-objects`: small explicit structures that deserve their own rules and semantics
- `application/services`: reusable application or domain services that do not belong naturally inside one entity
- `application/usecases`: orchestration of business scenarios
- `infra/http/controller`: adapters between Next.js request/response and application use cases
- `infra/persistence/daos`: raw Firebase/Firestore access
- `infra/persistence/repositories`: domain/persistence bridge
- `infra/persistence/repositories/mappers`: static mapping classes
- `infra/factories`: dependency composition and instance assembly

### 4.2 Instantiation policy

The following components are instantiated through factories:

- services
- use cases
- controllers
- daos
- repositories

This is an architectural rule, not an implementation convenience. Dependency assembly must be centralized so constructors are not scattered across route handlers or unrelated files.

### 4.3 Mapping policy

- Entities are instantiated classes
- Mappers are static classes
- DAOs talk directly to Firebase
- Repositories convert domain objects to persistence objects and persistence objects back to domain objects

## 5. Domain Model

### 5.1 Event inheritance model

An abstract generic event entity is the base for all concrete event types.

Conceptually:

```ts
abstract class Event<TData> {
  id: string; // ULID
  userId: string; // Firebase Authentication user id
  name: string;
  description: string;
  startedAt: Date;
  finishedAt?: Date;
  tags: string[];
  data: TData;
  interruptions: Interruption[];
}
```

Concrete events:

- `RoutineEvent extends Event<RoutineEventData>`
- `FoodEvent extends Event<FoodEventData>`
- `TrainingEvent extends Event<TrainingEventData>`
- `SleepEvent extends Event<SleepEventData>`

The canonical name is `TrainingEvent`, not `TraningEvent`.

### 5.2 Shared event responsibilities

The base `Event<TData>` entity owns shared logic such as:

- identity handling
- author ownership
- common field validation
- time interval validation
- tag normalization integration
- interruption registration/validation
- duration helpers where applicable

### 5.3 Event data objects

`data` must not be an unbounded JSON blob. Each concrete event type must define an explicit data structure.

Initial direction:

- `RoutineEventData`: minimal event-specific payload, can remain light in V1
- `TrainingEventData`:
  - `caloriesBurned: number`
- `SleepEventData`:
  - `trackedSleepTime: number`
  - `score: number`
- `FoodEventData`:
  - `inputText: string`
  - `items: FoodItem[]`
  - `totals: FoodTotals`
  - `modelProvider: string`
  - `modelName: string`
  - `parsedAt: Date`

### 5.4 Value objects

The following should be modeled as value objects or equivalent explicit structures as needed:

- `Interruption`
- `EventId`
- tag normalization value or helper structure
- date interval helpers if validations become substantial

`Interruption` should contain:

- `name`
- `description`
- `startedAt`
- `finishedAt`

## 6. Identity, Ownership, and Access

### 6.1 Identity

- Event ids use `ulid`
- `userId` stores the Firebase Authentication user id

### 6.2 Visibility

- Any visitor can list and view all events
- Only the authenticated owner can create, edit, or delete their own events

### 6.3 Enforcement

Ownership rules should be enforced in two places:

- application/backend logic
- Firestore security rules

The system must not depend on only one enforcement layer.

## 7. Persistence Design

### 7.1 Collections

Initial Firestore collections:

- `events`
- `tags`

### 7.2 `events` document structure

Each event document represents one normalized event ready for timeline and daily-view queries.

Suggested fields:

- `id`
- `type`
- `userId`
- `name`
- `description`
- `startedAt`
- `finishedAt`
- `tags`
- `interruptions`
- `data`
- `createdAt`
- `updatedAt`

### 7.3 `tags` document structure

Suggested fields:

- `id`
- `name`
- `normalizedName`
- `createdBy`
- `createdAt`
- `usageCount`

Purpose:

- suggest previously created tags during event creation
- reduce duplication
- support autocomplete without scanning all events

### 7.4 Repository and DAO split

- DAO reads and writes raw Firestore documents
- Repository transforms raw persistence data into domain entities and back
- Mapper classes are static helpers used by repositories

## 8. Application Flows

### 8.1 Common event creation flow

1. User opens the creation flow.
2. User selects an event type.
3. User fills common fields.
4. User adds tags with suggestions from the `tags` collection.
5. Controller delegates to the factory-built use case.
6. Use case validates ownership/authentication requirements.
7. Repository persists the resulting domain entity.

### 8.2 Routine event flow

Routine events use the common event flow with minimal additional payload in V1.

### 8.3 Training event flow

Training events extend the common flow with:

- `caloriesBurned`

This field is manual in V1, but the design leaves room for future imported data.

### 8.4 Sleep event flow

Sleep events extend the common flow with:

- `trackedSleepTime`
- `score`

These values are independent from the event `startedAt` and `finishedAt`.

### 8.5 Food event flow

Food event creation is special:

1. User submits free text, for example: `1 banana. 2 colheres de iogurte natural e 5 morangos`.
2. The food use case calls a service responsible for AI parsing.
3. The service sends a request through OpenRouter.
4. The prompt must force a JSON response in the required template.
5. The backend validates the JSON shape.
6. The backend calculates totals for the meal.
7. The backend creates a `FoodEvent` with the parsed items and totals.
8. The event is persisted only if the response is valid.

No partially parsed meal should be stored.

## 9. Food Parsing Contract Through OpenRouter

### 9.1 Prompting rule

The backend should always send the same response template expectation to the model.

The prompt content should guide the model to:

- identify foods from the user text
- estimate calories, macronutrients, and micronutrients
- return strict JSON
- use English keys
- keep descriptive values in Portuguese when applicable

### 9.2 JSON contract direction

The response shape should follow this conceptual structure:

```json
[
  {
    "food": "Banana prata",
    "portion": "1 unidade media",
    "approximateWeightGrams": 100,
    "caloriesKcal": 89,
    "macronutrients": {
      "carbohydratesGrams": 22.8,
      "proteinsGrams": 1.1,
      "totalFatGrams": 0.3,
      "fiberGrams": 2.6
    },
    "mainMicronutrients": {
      "potassiumMg": 358,
      "magnesiumMg": 27,
      "vitaminCMg": 8.7,
      "vitaminB6Mg": 0.4
    },
    "otherData": {
      "glycemicIndex": 51,
      "sodiumMg": 1
    }
  }
]
```

The exact response schema can evolve during implementation, but these rules are fixed:

- keys in English
- food values can stay in Portuguese
- valid JSON only
- array of parsed food items
- nutrition data per item

### 9.3 Food totals

The backend must calculate and store meal totals explicitly instead of recalculating them only in the UI.

Minimum total fields:

- `totalCaloriesKcal`
- `totalProteinGrams`
- `totalCarbohydrateGrams`
- `totalFatGrams`
- `totalFiberGrams`
- `totalMicronutrients`

## 10. Query and Read Model Direction

The V1 read model can stay close to the write model because:

- reads are public
- the main queries are predictable
- Firestore favors denormalized, query-oriented documents

Expected main query families:

- timeline ordered by event date/time
- daily events by date
- daily food events by date
- daily training events by date
- daily sleep event by date when applicable
- tag suggestion lookup

If daily summary queries become expensive later, derived summary documents can be added without changing the domain boundaries.

## 11. Screen Design for V1

## 11.1 Timeline / Routine Tracker

This is the main screen.

Events are shown chronologically. Each event card displays:

- top left: `name`
- top right: `startedAt - finishedAt`
- second row left: `description`
- second row right: `duration`

If interruptions exist, the card shows an `Interruptions` block where each interruption displays:

- `name`
- `duration`
- `description`

The goal is quick scanning. Cards should remain compact, with expansion or a dedicated detail view for heavy data if needed.

## 11.2 Daily diet and training view

This is the secondary screen.

Top summary cards:

1. `Sleep`
   - `trackedSleepTime`
   - `score`
   - `description`
2. `Calories consumed`
   - sum of all consumed calories for the day
3. `Calories burned`
   - sum of all calories burned by training events for the day
4. `Macros`
   - `protein`
   - `carbohydrate`
   - `fat`
5. `Micros`
   - aggregated list of micronutrients consumed during the day
   - shown inside a dropdown/expandable area because the list may be long

After the summary cards, the screen shows event cards for food and training entries of the day.

If more than one sleep event exists for the selected day, the summary card should display the most recent sleep event for that day in V1. This keeps the UI deterministic without adding sleep aggregation rules yet.

### Food event cards

Each food card displays:

- `name`
- `startDate - endDate`
- `description`
- `kcal`
- macros block:
  - `protein`
  - `carbohydrate`
  - `fat`
- micros block:
  - dropdown with the micronutrient total list

### Training event cards

Each training card displays:

- `name`
- `startDate - endDate`
- `description`
- `kcal`

## 11.3 Visual differentiation by type

Each event type should have a distinct icon and accent color:

- `RoutineEvent`: blue or graphite, icon such as clock or checklist
- `FoodEvent`: green or soft orange, icon such as utensils or apple
- `TrainingEvent`: red or amber, icon such as dumbbell or activity
- `SleepEvent`: dark blue or indigo, icon such as moon or bed

The color should act as an accent, not a heavy background. Recognition speed is the main goal.

## 12. Controller, Use Case, and Factory Direction

### 12.1 Control flow

Recommended request flow:

1. Next.js entry point receives the request.
2. Controller adapts request/response structures.
3. Factory instantiates the required controller/use case graph.
4. Use case orchestrates the business scenario.
5. Services are used when specialized cross-entity logic is required.
6. Repository persists or retrieves domain entities.
7. DAO communicates with Firestore.

### 12.2 Responsibility boundaries

- controllers do not hold business rules
- use cases do not know persistence details
- DAOs do not know domain rules
- repositories do not orchestrate scenarios
- factories are the official composition point

## 13. Error Handling Direction

The system should explicitly handle:

- unauthenticated write attempts
- unauthorized edit/delete attempts
- invalid event data
- invalid time intervals
- invalid interruption ranges
- OpenRouter response shape failures
- OpenRouter timeouts or provider failures
- Firestore write/read failures

Food parsing failures should return a clear error and should not create an event with incomplete nutrition data.

## 14. Testing Direction

The implementation plan should later include at least:

- entity tests for shared event invariants
- entity tests for event-specific validations
- mapper tests for persistence/domain conversion
- use case tests for create/update/list flows
- food parsing contract validation tests
- controller tests for permission-sensitive flows

The first implementation should prioritize domain and application tests before UI-heavy coverage.

## 15. Future Expansion Paths

The design intentionally leaves room for:

- additional event types
- imported fitness/sleep sources
- richer routine data
- user-specific dashboards
- summary materialization collections
- more advanced search and filtering

This should be achieved without abandoning the base `Event<TData>` hierarchy or the repository/DAO separation.

## 16. Deployment and Service Setup Guide

This section is the requested practical guide for Firebase, Firestore, and Vercel setup.

### 16.1 Firebase project setup

1. Create a Firebase project in the Firebase Console.
2. Enable Authentication.
3. Enable Google as a sign-in provider.
4. Create a Firestore database in production mode.
5. Choose a Firestore region close to the expected users.
6. Create a web app inside the Firebase project.
7. Copy the Firebase web configuration values.
8. Prepare Firestore security rules that allow public read and owner-only write.

Recommended environment variables to capture:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### 16.2 Firestore modeling tasks

1. Create the `events` collection.
2. Create the `tags` collection.
3. Add indexes required by timeline and daily filtering queries as they are identified during implementation.
4. Write security rules for:
   - public read
   - authenticated create
   - owner-only update
   - owner-only delete

### 16.3 OpenRouter setup

1. Create an OpenRouter account.
2. Generate an API key.
3. Store the key as a server-only environment variable.
4. Choose the initial model used for food parsing.
5. Keep the prompt template centralized in the food parsing service or equivalent config module.

Recommended environment variables:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

### 16.4 Vercel setup

1. Create or log into a Vercel account.
2. Import the Git repository into Vercel.
3. Configure the project as a Next.js deployment.
4. Add all required environment variables in the Vercel project settings.
5. Make sure server-only secrets are not exposed with `NEXT_PUBLIC_`.
6. Trigger the first deployment.
7. Validate that Firebase auth callbacks and public pages work correctly in the deployed environment.

### 16.5 Environment variable split

Public client variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Server-only variables:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

### 16.6 Suggested deployment checklist

Before going live:

1. Confirm Firebase Authentication with Google is enabled.
2. Confirm Firestore rules match the public-read/owner-write model.
3. Confirm OpenRouter secrets exist only on the server.
4. Confirm Vercel environment variables are set for all target environments.
5. Confirm the deployed app can:
   - read public events without login
   - log in with Google
   - create an event while authenticated
   - block edit/delete for non-owners
   - parse and save a food event correctly

## 17. Recommended First Implementation Order

The next planning phase should probably break implementation into:

1. project baseline and folder structure
2. Firebase auth integration
3. domain entities and factories
4. repositories, DAOs, and Firestore integration
5. event create/list/update/delete use cases
6. tag suggestion flow
7. food parsing service with OpenRouter
8. timeline UI
9. daily summary UI

This is not the implementation plan yet. It is only a direction for the next planning skill.
