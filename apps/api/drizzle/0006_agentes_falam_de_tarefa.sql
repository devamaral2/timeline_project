UPDATE "task_entries" SET "data" = replace(replace("data"::text, '"kind": "event"', '"kind": "task"'), '"eventKind"', '"taskKind"')::jsonb
WHERE "kind" IN ('input', 'result') AND "data"::text ~ '"kind": "event"|"eventKind"';--> statement-breakpoint
UPDATE "task_entries" SET "data" = ("data" - 'eventId') || jsonb_build_object('taskId', "data"->'eventId')
WHERE "kind" = 'result' AND "data"->>'type' = 'voice' AND "data" ? 'eventId';--> statement-breakpoint
UPDATE "tasks" SET "data" = replace(replace(replace(replace("data"::text,
  '"recurring_event_create"', '"recurring_task_create"'),
  '"recurring_event_edit"', '"recurring_task_edit"'),
  '"event_create"', '"task_create"'),
  '"event_edit"', '"task_edit"')::jsonb
WHERE "actor" = 'agent' AND "data" ? 'dispatch';--> statement-breakpoint
UPDATE "task_entries" SET "data" = replace(replace(replace(replace(replace("data"::text,
  '"mcp_braid_create_event"', '"mcp_braid_create_task"'),
  '"mcp_braid_update_event"', '"mcp_braid_update_task"'),
  '"mcp_braid_get_event"', '"mcp_braid_get_task"'),
  '"mcp_braid_list_timeline_events"', '"mcp_braid_list_agenda_tasks"'),
  '"mcp_braid_list_tracked_events"', '"mcp_braid_list_tracked_tasks"')::jsonb
WHERE "data"::text ~ '"mcp_braid_[a-z_]*event';
