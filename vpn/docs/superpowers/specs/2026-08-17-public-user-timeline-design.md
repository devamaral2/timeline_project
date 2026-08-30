# Public User Timeline Design

Date: 2026-08-17
Status: Approved in conversation, written for final review

## 1. Objective

Build the first public frontend for the application at `/{userId}`. Any visitor can use this route to view the selected user's events. The page is read-only and reuses the visual language and focused routine components from `C:\Users\amara\Documents\projects\my-daily-flow`.

The timeline starts with the current day and moves backward through the user's history. Data is fetched in fixed seven-day pages and loaded progressively with infinite scroll.

## 2. Scope

### Included

- Public dynamic route at `src/app/[userId]/page.tsx`
- Public event query scoped by the route's `userId`
- Fixed seven-day, page-number-based API pagination
- Date boundaries calculated in `America/Sao_Paulo`
- Infinite scroll until the API reports no older events
- Responsive timeline copied and adapted from `my-daily-flow`
- Vertical navigation on mobile and tablet
- Horizontal day columns on desktop
- Event grouping by the start date in `America/Sao_Paulo`
- Loading, incremental loading, empty, and error states
- Rendering for finished and ongoing events
- Automated coverage for the API contract and frontend behavior

### Excluded

- User profile lookup or display
- Display of the raw `userId`
- Authentication
- Owner/visitor mode switching
- Event creation, editing, or deletion
- Filters, search, and tag selection
- Daily summary functionality

## 3. API Contract

The public endpoint remains `GET /api/events` and accepts:

- `userId`: required non-empty string
- `page`: optional positive integer, defaulting to `1`

Example:

```http
GET /api/events?userId=user-123&page=1
```

Response:

```json
{
  "events": [],
  "pagination": {
    "page": 1,
    "daysPerPage": 7,
    "hasNextPage": true
  }
}
```

The API no longer exposes `from` and `to` as the public pagination contract for this listing. Its seven-day page size is fixed and cannot be overridden by the client.

Invalid or non-positive page values return HTTP 400 with a validation error. A missing `userId` continues to return HTTP 400.

## 4. Date Window Semantics

All calendar boundaries are calculated in `America/Sao_Paulo`, independently from the Vercel server's system timezone and the visitor's browser timezone.

The current calendar day is page 1's newest day:

- Page 1 covers today and the six preceding calendar days.
- Page 2 covers the seventh through thirteenth preceding calendar days.
- Each subsequent page moves backward by another seven calendar days.

Queries use half-open intervals, `[from, to)`, so an event on a boundary cannot appear in two pages. The upper boundary of page 1 is the start of tomorrow in `America/Sao_Paulo`. Events are assigned to pages and frontend day groups using `startedAt`.

Events in each response are ordered by `startedAt` descending.

## 5. Pagination Metadata

`hasNextPage` means at least one event exists for the requested user with `startedAt` earlier than the current page's lower boundary. It is not derived from whether the current seven-day page contains events.

This distinction allows the frontend to cross empty weeks without ending the timeline prematurely. The persistence layer should use a limited existence query for older events instead of loading the complete remaining history.

The backend changes remain within the existing architecture:

1. The controller parses and validates `userId` and `page`.
2. The list use case calculates the weekly range through a focused pagination/date helper and returns events with pagination metadata.
3. The repository contract supports the half-open range query and an efficient older-event existence check.
4. The DAO applies the Firestore filters, descending order, and limited existence query.
5. The controller serializes the response contract.

The existing factory remains the dependency-composition point.

## 6. Frontend Architecture

`src/app/[userId]/page.tsx` is the public route entry. It passes the decoded dynamic route parameter to a client-side timeline component. The timeline performs the required first API request for page 1 and owns incremental loading state.

The implementation ports and adapts only the required pieces from `my-daily-flow`:

- `RoutineTimeline`
- `DayColumn`
- `EventCard`
- `DaySkeleton`
- `event-visuals`
- the small date, type, and class-name utilities those components require

The full UI component catalog from the reference project is not copied. Only runtime and styling dependencies used by the selected components are added, including Tailwind CSS, Lucide icons, `clsx`, `tailwind-merge`, and the existing animation utilities where needed.

The root page can remain outside this feature's scope. The public timeline is addressed specifically by `/{userId}`.

## 7. Frontend Data Flow

1. The dynamic page supplies `userId` to `RoutineTimeline`.
2. The client requests `/api/events?userId=<encoded-id>&page=1`.
3. The client validates the API response shape, deduplicates events by `id`, and accumulates them in descending chronological order.
4. The frontend groups accumulated events by their `startedAt` calendar date in `America/Sao_Paulo`.
5. Dates without events are omitted.
6. An `IntersectionObserver` watches the end sentinel.
7. When the sentinel approaches, the next page is requested if `hasNextPage` is true and no request is already active.
8. If an empty page reports `hasNextPage: true`, loading advances again until events are found or the end is reached.
9. When `hasNextPage` becomes false, the observer no longer requests pages.

Request coordination prevents duplicate page requests. Event identity prevents duplicates if a response is replayed. Stale requests are ignored or cancelled when the route's `userId` changes.

## 8. Responsive Presentation

The public page preserves the design tokens and visual behavior of the reference application while removing owner-specific controls.

### Mobile and tablet

- Days form a vertical timeline.
- The order is today toward progressively older days.
- Loading skeletons appear after the existing content.

### Desktop

- Each day is a fixed-width vertical column.
- Columns use horizontal scrolling and snap alignment.
- The first visible column is the newest loaded day.
- Older days are appended to the right.
- Loading skeletons appear at the right edge.

The page retains a generic visual header and event-type legend. It does not show a profile name, handle, raw user id, owner-mode control, or new-event action.

## 9. Event Mapping and Rendering

Backend event types map to the reference visuals as follows:

| API type | Visual meaning | Icon |
| --- | --- | --- |
| `sleep` | Sleep | Moon |
| `training` | Workout | Dumbbell |
| `food` | Meal | Utensils |
| `routine` | Common routine | Clock |

Each card displays:

- event name
- formatted start and finish times
- duration label supplied by the API
- tags
- expandable description when present
- expandable interruption names, descriptions, and duration labels when present

An event without `finishedAt` is rendered as ongoing. Its card shows the start time, a pulsing status indicator, the text `Em andamento`, and duration `--`.

Day summaries use the number of events. Duration totals include only durations that can be represented safely from the returned event data; no synthetic duration is created for ongoing events.

## 10. Loading, Empty, and Error States

The UI has four explicit states:

- Initial loading: day-column skeletons replace content.
- Incremental loading: a skeleton is appended after loaded days.
- Definitive empty state: `Nenhum evento encontrado` appears only when no accumulated events exist and `hasNextPage` is false.
- Error state: a concise error message and `Tentar novamente` button are shown.

An incremental request failure preserves already-rendered events. Retrying repeats only the failed page. Accessible live-region text announces loading and the number of loaded days.

## 11. Error Handling

The API explicitly handles:

- missing `userId`
- invalid `page`
- invalid date-window calculation
- persistence failures through the existing HTTP error boundary behavior

The client treats non-2xx responses and malformed response bodies as load failures. It never interprets an error as the end of the timeline.

## 12. Testing Strategy

Backend coverage includes:

- default page value
- rejection of invalid, zero, negative, and fractional pages
- exact seven-day ranges in `America/Sao_Paulo`
- half-open boundaries without overlap
- user isolation
- descending event ordering
- `hasNextPage` when the current page is empty but older events exist
- `hasNextPage: false` at the end of history
- serialized response shape

Frontend coverage includes:

- dynamic `userId` request construction
- initial page loading
- grouping by Sao Paulo calendar day
- hiding empty days
- descending day order
- loading the next page from the observer
- crossing an empty page with `hasNextPage: true`
- stopping when `hasNextPage` is false
- event deduplication
- initial and incremental skeleton states
- definitive empty state
- initial and incremental error recovery
- ongoing-event presentation
- expandable descriptions and interruptions
- essential mobile and desktop rendering behavior

## 13. Success Criteria

The feature is complete when a visitor can open `/{userId}`, see only that user's events from the latest seven-day page, and continue backward through all available history via responsive infinite scroll. Empty weekly windows do not hide older history, empty calendar days do not render, date boundaries are stable in `America/Sao_Paulo`, and no write or profile functionality is exposed.
