# Durable AI jobs

Deploy the API schema migration before enabling `AiJobsModule`. Set
`RABBITMQ_URL` through the secret environment. In local development the
loader sets `AI_JOBS_QUEUE_PREFIX` to the current branch name with characters
outside `[a-zA-Z0-9._-]` removed (`feat/x` becomes `featx`); elsewhere set it to a
unique environment name. All API instances sharing a database must
share that prefix. Never share queues between different databases. Worktree
provisioning declares `<slug>.agent-turn`, `.transcript-event`, and `.meal-note`
and supplies the broker credential in memory, not in the checkout.

Queues are durable; messages are persistent job IDs only. PostgreSQL stores
ownership, payload, progress, result, status and the publication outbox.
Enqueue succeeds while RabbitMQ is down. Publisher confirms precede outbox
rescheduling; uncertain publication is safely duplicated. Pending jobs are
republished every 30 seconds, including jobs whose delivery was acknowledged
while handlers were unavailable or another agent turn was running.

`AI_JOBS_CONCURRENCY` (default 4) bounds handlers per instance, even across
reconnects. Agent turns additionally serialize per user across instances.
`AI_JOBS_LEASE_MS` defaults to 60 seconds. Heartbeats renew only live leases;
expired leases recover with new fencing tokens. `AI_JOBS_MAX_ATTEMPTS` defaults
to 4; worker deaths count as attempts. Retryable errors (429, 5xx, recognized
network timeouts or `RetryableAiJobError`) back off exponentially up to 60s.
Other handler errors are terminal. Broker reconnects also use bounded backoff
and a default 15-second AMQP heartbeat. Agent turns preserve submission order
per user, including when an earlier turn is delayed for retry.
No path executes AI directly as an enqueue fallback.

## Transaction rules

Call `setAiJobResult` before committing domain changes. The final operation
inside that same Drizzle transaction must be `completeCurrentAiJob(tx)`.
It atomically completes the receipt or throws on cancellation/stale lease,
rolling back domain changes. Never swallow that exception inside a transaction.
Every mutating handler must use this rule; lease expiry alone cannot guarantee
an old process stops running provider calls, but fencing prevents stale commits.
External nontransactional side effects require their own idempotency key.

Use `enqueueAiJobInTransaction(tx,input)` for note insert hooks, so domain row
and job/outbox are committed together. Dedupe keys are scoped to user and kind
and remain reserved for terminal jobs too. Never reuse a key for different input.
Terminal failure hooks call `setAiJobFailure("unavailable")` before the guarded
transaction completion to commit failed note state and failed job atomically.
If that transaction fails, the job retains its lease for recovery rather than
marking the receipt failed with a still-pending note. Exhausted jobs retry only
the failure projection, not the provider. Alert on repeatedly expired leases.

`wait` polls persisted progress; its optional AbortSignal only detaches the
watcher. `cancel` is explicit and owner-scoped. Cancellation racing a commit
is ordered by the job row lock: an already committed success remains success.
Internal `meal-note` jobs cannot be cancelled through this endpoint: deleting
the note invalidates its guarded completion instead. This prevents a cancelled
derived job from leaving a live note permanently pending.
Shutdown stops publishing/consuming and signals active handlers; abandoned
leases recover after expiry.

## Diagnose

Inspect `ai_jobs` grouped by status, `attempts`, `available_at`, `lease_until`
and `ai_job_outbox.available_at`. Queue unavailability logs intentionally omit
connection URLs and provider error bodies. Check broker readiness, credentials,
queue prefix and migration state. Do not purge outbox rows to repair a broker
outage. Failed/cancelled jobs do not automatically restart; submit a new job
with a new dedupe key after correcting the cause. Monitor oldest queued age,
expired leases, failed counts and outbox publication lag. Payloads/results
contain user data: apply database access control, backup and retention policies.
