ALTER TABLE "events" ADD COLUMN "notify_offsets_minutes" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "notify_offsets_minutes" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_notify_offsets_valid" CHECK ("events"."notify_offsets_minutes" <@ ARRAY[5,15,30,60,1440]::integer[]);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_notify_offsets_valid" CHECK ("tasks"."notify_offsets_minutes" <@ ARRAY[5,15,30,60,1440]::integer[]);