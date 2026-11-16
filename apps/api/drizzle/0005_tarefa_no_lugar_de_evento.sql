ALTER TABLE "events" RENAME TO "tasks";--> statement-breakpoint
ALTER TABLE "event_entries" RENAME TO "task_entries";--> statement-breakpoint
ALTER TABLE "event_tags" RENAME TO "task_tags";--> statement-breakpoint
ALTER TABLE "event_event_relation" RENAME TO "task_task_relation";--> statement-breakpoint
ALTER TABLE "event_artifact_relation" RENAME TO "task_artifact_relation";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME COLUMN "event_id" TO "task_id";--> statement-breakpoint
ALTER TABLE "task_tags" RENAME COLUMN "event_id" TO "task_id";--> statement-breakpoint
ALTER TABLE "task_task_relation" RENAME COLUMN "from_event_id" TO "from_task_id";--> statement-breakpoint
ALTER TABLE "task_task_relation" RENAME COLUMN "to_event_id" TO "to_task_id";--> statement-breakpoint
ALTER TABLE "task_artifact_relation" RENAME COLUMN "event_id" TO "task_id";--> statement-breakpoint
ALTER TABLE "jobs" RENAME COLUMN "event_id" TO "task_id";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_actor_valid" TO "tasks_actor_valid";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_block_span" TO "tasks_block_span";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_data_object" TO "tasks_data_object";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_kind_matches_actor" TO "tasks_kind_matches_actor";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_location_human" TO "tasks_location_human";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_location_length" TO "tasks_location_length";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_long_running_notify" TO "tasks_long_running_notify";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_long_running_shape" TO "tasks_long_running_shape";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_notify_offsets_valid" TO "tasks_notify_offsets_valid";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_occurrence_requires_day" TO "tasks_occurrence_requires_day";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_priority_valid" TO "tasks_priority_valid";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_revision_min" TO "tasks_revision_min";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_status_matches_actor" TO "tasks_status_matches_actor";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_pkey" TO "tasks_pkey";--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT "events_recurrence_id_recurrences_id_fk" TO "tasks_recurrence_id_recurrences_id_fk";--> statement-breakpoint
ALTER INDEX "events_agenda_idx" RENAME TO "tasks_agenda_idx";--> statement-breakpoint
ALTER INDEX "events_recurrence_occurrence_unique" RENAME TO "tasks_recurrence_occurrence_unique";--> statement-breakpoint
ALTER INDEX "events_requests_idx" RENAME TO "tasks_requests_idx";--> statement-breakpoint
ALTER INDEX "events_tracked_idx" RENAME TO "tasks_tracked_idx";--> statement-breakpoint
ALTER INDEX "events_user_live_idx" RENAME TO "tasks_user_live_idx";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME CONSTRAINT "event_entries_data_object" TO "task_entries_data_object";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME CONSTRAINT "event_entries_kind_valid" TO "task_entries_kind_valid";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME CONSTRAINT "event_entries_role_only_in_message" TO "task_entries_role_only_in_message";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME CONSTRAINT "event_entries_role_valid" TO "task_entries_role_valid";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME CONSTRAINT "event_entries_trace_without_text" TO "task_entries_trace_without_text";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME CONSTRAINT "event_entries_pkey" TO "task_entries_pkey";--> statement-breakpoint
ALTER TABLE "task_entries" RENAME CONSTRAINT "event_entries_event_id_events_id_fk" TO "task_entries_task_id_tasks_id_fk";--> statement-breakpoint
ALTER INDEX "event_entries_event_idx" RENAME TO "task_entries_task_idx";--> statement-breakpoint
ALTER TABLE "task_tags" RENAME CONSTRAINT "event_tags_event_id_tag_id_pk" TO "task_tags_task_id_tag_id_pk";--> statement-breakpoint
ALTER TABLE "task_tags" RENAME CONSTRAINT "event_tags_event_id_events_id_fk" TO "task_tags_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_tags" RENAME CONSTRAINT "event_tags_tag_id_tags_id_fk" TO "task_tags_tag_id_tags_id_fk";--> statement-breakpoint
ALTER INDEX "event_tags_tag_idx" RENAME TO "task_tags_tag_idx";--> statement-breakpoint
ALTER TABLE "task_task_relation" RENAME CONSTRAINT "event_event_not_self" TO "task_task_not_self";--> statement-breakpoint
ALTER TABLE "task_task_relation" RENAME CONSTRAINT "event_event_relation_valid" TO "task_task_relation_valid";--> statement-breakpoint
ALTER TABLE "task_task_relation" RENAME CONSTRAINT "event_event_relation_from_event_id_relation_to_event_id_pk" TO "task_task_relation_from_task_id_relation_to_task_id_pk";--> statement-breakpoint
ALTER TABLE "task_task_relation" RENAME CONSTRAINT "event_event_relation_from_event_id_events_id_fk" TO "task_task_relation_from_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_task_relation" RENAME CONSTRAINT "event_event_relation_to_event_id_events_id_fk" TO "task_task_relation_to_task_id_tasks_id_fk";--> statement-breakpoint
ALTER INDEX "event_event_follow_up_unique" RENAME TO "task_task_follow_up_unique";--> statement-breakpoint
ALTER INDEX "event_event_reverse_idx" RENAME TO "task_task_reverse_idx";--> statement-breakpoint
ALTER TABLE "task_artifact_relation" RENAME CONSTRAINT "event_artifact_event_position_unique" TO "task_artifact_task_position_unique";--> statement-breakpoint
ALTER TABLE "task_artifact_relation" RENAME CONSTRAINT "event_artifact_position_nonneg" TO "task_artifact_position_nonneg";--> statement-breakpoint
ALTER TABLE "task_artifact_relation" RENAME CONSTRAINT "event_artifact_relation_artifact_id_artifacts_id_fk" TO "task_artifact_relation_artifact_id_artifacts_id_fk";--> statement-breakpoint
ALTER TABLE "task_artifact_relation" RENAME CONSTRAINT "event_artifact_relation_event_id_artifact_id_pk" TO "task_artifact_relation_task_id_artifact_id_pk";--> statement-breakpoint
ALTER TABLE "task_artifact_relation" RENAME CONSTRAINT "event_artifact_relation_event_id_events_id_fk" TO "task_artifact_relation_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "task_artifact_relation" RENAME CONSTRAINT "event_artifact_relation_valid" TO "task_artifact_relation_valid";--> statement-breakpoint
ALTER INDEX "event_artifact_reverse_idx" RENAME TO "task_artifact_reverse_idx";--> statement-breakpoint
ALTER TABLE "jobs" RENAME CONSTRAINT "jobs_event_id_events_id_fk" TO "jobs_task_id_tasks_id_fk";--> statement-breakpoint
ALTER INDEX "jobs_event_idx" RENAME TO "jobs_task_idx";--> statement-breakpoint
UPDATE "recurrences" SET "template" = (
  SELECT COALESCE(jsonb_object_agg(replace(replace("key", 'Event', 'Task'), 'event', 'task'), "value"), '{}'::jsonb)
  FROM jsonb_each("recurrences"."template")
) WHERE EXISTS (SELECT 1 FROM jsonb_object_keys("recurrences"."template") AS "key" WHERE "key" ILIKE '%event%');--> statement-breakpoint
UPDATE "tasks" SET "data" = jsonb_set("data", '{agent}', to_jsonb(CASE "data"->>'agent'
  WHEN 'event-create' THEN 'task-create'
  WHEN 'event-edit' THEN 'task-edit'
  WHEN 'recurring-event-create' THEN 'recurring-task-create'
  WHEN 'recurring-event-edit' THEN 'recurring-task-edit'
END::text)) WHERE "data"->>'agent' IN ('event-create', 'event-edit', 'recurring-event-create', 'recurring-event-edit');--> statement-breakpoint
UPDATE "jobs" SET "kind" = 'voice-task' WHERE "kind" = 'voice-event';--> statement-breakpoint
UPDATE "jobs" SET "payload" = replace(replace(replace(replace(replace("payload"::text,
  '"recurring-event-create"', '"recurring-task-create"'),
  '"recurring-event-edit"', '"recurring-task-edit"'),
  '"event-create"', '"task-create"'),
  '"event-edit"', '"task-edit"'),
  '"voice-event"', '"voice-task"')::jsonb
WHERE "payload"::text ~ '"(recurring-event-create|recurring-event-edit|event-create|event-edit|voice-event)"';--> statement-breakpoint
DELETE FROM "idempotency_keys" WHERE "scope" LIKE '/api/%';
