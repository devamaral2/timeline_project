ALTER TABLE "events" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_human" CHECK ("events"."location" = '' OR "events"."actor" = 'human');--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_length" CHECK (char_length("events"."location") <= 300);
