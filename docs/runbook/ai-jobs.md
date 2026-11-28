# AI jobs: the single queue in the API database

AI work runs from one table, `jobs`, in the API database
([ADR 0013](../adr/0013-ia-sem-tabelas-proprias-e-fila-unica.md)). There is no
broker and no outbox table: the worker lives inside the API process
(`apps/api/src/infrastructure/jobs/jobs.service.ts`) and reads the table
directly (`apps/api/src/infrastructure/persistence/jobs/postgres-job.store.ts`).

Nothing has to be provisioned besides the database, a SQLite file
([ADR 0024](../adr/0024-api-em-sqlite-sem-orm.md)). The table is created by the
API migration (`apps/api/migrations/0000_inicial.sql`), so every environment and
every worktree gets its own queue with its own file, and deleting the file
deletes the queue.

The job is disposable. The source of truth is the task the job points to
(`jobs.task_id`: the request or the step it executes) and that task's
entries. A job has no result column; `progress` is a passing snapshot that is
cleared when the job ends.

## Settings

All optional; the API validates them at boot (`apps/api/src/config/env.ts`).

| Variable | Default | Range | Meaning |
| --- | --- | --- | --- |
| `AI_JOBS_POLL_MS` | 500 | 50 to 60000 | How often the worker looks at the queue. |
| `AI_JOBS_CONCURRENCY` | 4 | 1 to 64 | Jobs running at once in one API instance. |
| `AI_JOBS_LEASE_MS` | 60000 | 3000 to 3600000 | How long a claimed job stays reserved without a heartbeat. |
| `AI_JOBS_MAX_ATTEMPTS` | 4 | 1 to 20 | Attempts before the job fails for good. A worker that died counts as one. |

## How a job moves

1. **Enqueue.** A row is inserted with status `queued`, normally in the same
   transaction that writes the task (`enqueueJobInTransaction`). `dedupe_key`
   is unique per user and kind: enqueueing again with the same key returns the
   job that already exists.
2. **Claim.** Every `AI_JOBS_POLL_MS` the worker takes up to its free slots of
   jobs that are `queued`, have `available_at <= now()` and are of a kind it has
   a handler for, oldest `available_at` first, in one `BEGIN IMMEDIATE`
   transaction on the single writer connection: two claims never take the same
   job. There is one API instance per database file (the deployment uses
   `strategy: Recreate`), so this holds for the whole queue. The claim
   sets `running`, adds one to `attempts` and writes a new `lease_token` and
   `lease_until`.
3. **One at a time per key.** A job with a `concurrency_key` is only claimed
   when no other job with the same key is running or has been queued for
   longer. This is what keeps the finalization of one request in order.
4. **Lease.** While the handler runs, a heartbeat renews `lease_until` every
   third of `AI_JOBS_LEASE_MS`. If the heartbeat finds the lease gone (expired,
   or the job is no longer `running`), the handler is aborted.
5. **Success.** A handler that writes domain data closes the job inside that
   same transaction, as its last statement (`completeCurrentJob(tx)`): either
   both commit or neither does. If the lease was lost or the job was cancelled,
   that statement throws and the domain writes roll back. Never swallow that
   error. Other handlers are closed by the worker when they return.
6. **Retry.** A retryable error (HTTP 429 or 5xx from a provider, a network
   timeout or reset, `RetryableJobError`) puts the job back to `queued` with
   `available_at` in the future: 2 s after the first attempt, doubling up to
   60 s. Any other error, or a retryable one on the last attempt, ends the job
   as `failed`.
7. **Dead worker.** On every pass the worker returns to the queue, 2 seconds
   ahead, each `running` job whose `lease_until` has passed, with `error`
   set to `Worker lease expired`. The next claim counts as a new attempt; a
   job claimed beyond `AI_JOBS_MAX_ATTEMPTS` fails without calling the handler.
8. **Failure reaches the task first.** When a job fails for good, the failure
   handler registered for its kind (if there is one) marks the task as
   `failed` before the job row becomes `failed`. If that write does not go
   through, the job keeps its lease, comes back by step 7 and only the failure
   is retried, not the provider call.
9. **Cleanup.** On every pass the worker deletes jobs that are `succeeded`,
   `failed` or `cancelled` and have not been touched for 7 days
   (`FINISHED_RETENTION` in the store). Nothing else needs to purge the table.

`jobs.error` holds a short code (`unavailable`, `conflict`, `invalid_input`,
`limit_reached`, `forbidden`) or `Worker lease expired`, never the provider's
message, which may carry credentials or user data.

## Cancelling

The user cancels a request with `POST /api/requests/:requestId/cancel`. The
live jobs of the request's tasks (`queued` or `running`, same owner) become
`cancelled` and the handlers running in that API instance are aborted at once.
A handler running in another instance stops at its next heartbeat, and its
guarded completion (step 5) fails, so a cancelled job never commits domain
changes. A commit that won the race against the cancellation stays committed.

Deleting a task deletes its jobs (`task_id` is `ON DELETE CASCADE`).

## Shutdown and outages

On shutdown the API stops polling, aborts the handlers in progress and waits
for them. A handler that did not finish is never marked as succeeded: its lease
expires and another worker picks the job up.

If the database cannot be read or written (disk full, file locked by another
process) the worker logs `Job queue unavailable` and tries again with a growing
wait (up to 60 s). There is nothing to repair afterwards.

## Diagnose

Open the API database read-only. Locally it is `.data/api.sqlite` at the root
of the worktree; in production, `/data/api.sqlite` in the `api` pod
(`kubectl -n braid exec -it deploy/api -- node`, then
`const db = new (process.getBuiltinModule("node:sqlite").DatabaseSync)(process.env.API_DATABASE_PATH, { readOnly: true })`
and `db.prepare("<sql>").all()`). Times are ISO-8601 UTC text, so they compare
with `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.

Overview by status and kind:

```sql
SELECT status, kind, count(*) AS jobs, min(created_at) AS oldest
FROM jobs
GROUP BY status, kind
ORDER BY status, kind;
```

Queued jobs, and whether each is ready or waiting for a retry:

```sql
SELECT id, kind, task_id, attempts, error, available_at,
       available_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS ready, concurrency_key, created_at
FROM jobs
WHERE status = 'queued'
ORDER BY available_at, id
LIMIT 50;
```

A job that is `ready` for long and is not claimed means one of: no API instance
is running, the instance has no handler for that `kind` (older build), all
`AI_JOBS_CONCURRENCY` slots are busy, or another job with the same
`concurrency_key` is ahead of it:

```sql
SELECT concurrency_key,
       sum(status = 'running') AS running,
       sum(status = 'queued') AS queued,
       min(created_at) AS oldest
FROM jobs
WHERE concurrency_key IS NOT NULL AND status IN ('queued', 'running')
GROUP BY concurrency_key
HAVING count(*) > 1;
```

Running jobs and their leases:

```sql
SELECT id, kind, task_id, attempts, lease_until,
       lease_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS lease_expired, progress, updated_at
FROM jobs
WHERE status = 'running'
ORDER BY lease_until;
```

A row with `lease_expired = 1` that stays there means no worker is polling:
the first pass of any live API instance returns it to the queue.

Jobs that failed (kept for 7 days):

```sql
SELECT id, kind, task_id, attempts, error, updated_at
FROM jobs
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 50;
```

Every job of one request (the request task and its steps):

```sql
SELECT j.id, j.kind, j.status, j.attempts, j.error, j.available_at, j.lease_until
FROM jobs j
WHERE j.task_id = '<requestId>'
   OR j.task_id IN (
     SELECT to_task_id FROM task_task_relation
     WHERE from_task_id = '<requestId>' AND relation = 'step')
ORDER BY j.created_at, j.id;
```

## What to do

- **Jobs pile up as `queued` and `ready`.** Check that the API is up and look
  for `Job queue unavailable` in its log. Raise `AI_JOBS_CONCURRENCY` only if
  the running jobs are healthy and the provider is not rate limiting.
- **Jobs keep returning with `Worker lease expired`.** The API process is dying
  or restarting mid-job, or a handler blocks the Node.js loop for longer than
  the lease. Look at the API restarts before raising `AI_JOBS_LEASE_MS`.
- **Many jobs `failed` with `unavailable`.** The provider (OpenRouter, Hermes)
  was down or refused the call for all attempts. Fix the cause; failed and
  cancelled jobs do not restart by themselves, and the task already shows the
  failure to the user, who sends the request again.
- **A retry is waiting and you do not want to wait.** `UPDATE jobs SET
  available_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<id>' AND
  status = 'queued';` is safe (open the file read-write for this one).
- **Do not** set a `failed` or `cancelled` job back to `queued` by hand (its
  task was already closed as failed or cancelled), and do not delete `running`
  rows: let the lease expire or cancel the request through the API.

Payloads and progress contain user data: the database access rules, backups and
retention apply to this table too.
