ALTER TABLE "event_event_relation" DROP CONSTRAINT "event_event_relation_valid";--> statement-breakpoint
UPDATE "event_event_relation" SET "relation" = 'step' WHERE "relation" = 'subtask' AND "to_event_id" IN (SELECT "id" FROM "events" WHERE "kind" = 'step');--> statement-breakpoint
DELETE FROM "event_event_relation" WHERE "relation" = 'subtask';--> statement-breakpoint
UPDATE "event_event_relation" SET "relation" = 'precedes' WHERE "relation" = 'blocks';--> statement-breakpoint
ALTER TABLE "event_event_relation" ADD CONSTRAINT "event_event_relation_valid" CHECK ("event_event_relation"."relation" IN ('generates', 'updates', 'deletes', 'step', 'precedes', 'follow_up'));
