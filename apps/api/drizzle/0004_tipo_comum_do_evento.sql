ALTER TABLE "events" DROP CONSTRAINT "events_kind_matches_actor";--> statement-breakpoint
UPDATE "events" SET "kind" = 'common' WHERE "kind" = 'default';--> statement-breakpoint
UPDATE "recurrences" SET "template" = jsonb_set("template", '{kind}', '"common"') WHERE "template"->>'kind' = 'default';--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_kind_matches_actor" CHECK (("events"."actor" = 'human' AND "events"."kind" IN ('common', 'meal', 'sleep', 'training')) OR ("events"."actor" = 'agent' AND "events"."kind" IN ('request', 'search_request', 'build_request', 'inquiry_request', 'review_request', 'cron', 'step')));
