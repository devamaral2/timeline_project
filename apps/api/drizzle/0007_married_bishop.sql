ALTER TABLE "events" DROP CONSTRAINT "events_notify_offsets_valid";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_notify_offsets_valid";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_notify_offsets_valid" CHECK (1 <= ALL("events"."notify_offsets_minutes") AND 43200 >= ALL("events"."notify_offsets_minutes"));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_notify_offsets_valid" CHECK (1 <= ALL("tasks"."notify_offsets_minutes") AND 43200 >= ALL("tasks"."notify_offsets_minutes"));