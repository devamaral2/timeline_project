DROP INDEX "events_timeline_cursor_idx";--> statement-breakpoint
CREATE INDEX "events_timeline_cursor_idx" ON "events" USING btree ("user_id","started_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);