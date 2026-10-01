ALTER TABLE "signup_entries" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "signup_slots" ADD COLUMN "kind" text DEFAULT 'shift' NOT NULL;--> statement-breakpoint
-- RSVPs become the event's own "Attending" sign-up spot. Every RSVP-enabled event gets a sheet and one spot.
INSERT INTO "signup_sheets" ("event_id", "title")
SELECT e."id", 'Sign-ups' FROM "events" e
WHERE e."rsvp_enabled" AND NOT EXISTS (SELECT 1 FROM "signup_sheets" s WHERE s."event_id" = e."id");--> statement-breakpoint
INSERT INTO "signup_slots" ("sheet_id", "title", "starts_at", "ends_at", "capacity", "audience", "kind", "waitlist_enabled", "position")
SELECT s."id", 'Attending', e."starts_at", e."ends_at", 500, 'members', 'attend', false, -1
FROM "signup_sheets" s JOIN "events" e ON e."id" = s."event_id"
WHERE e."rsvp_enabled";--> statement-breakpoint
-- Going and Maybe both become "signed up" (the reason, if any, becomes the note). Can't go is dropped.
INSERT INTO "signup_entries" ("slot_id", "user_id", "status", "source", "note")
SELECT sl."id", r."user_id", 'confirmed', 'self', r."reason"
FROM "rsvps" r
JOIN "signup_sheets" sh ON sh."event_id" = r."event_id"
JOIN "signup_slots" sl ON sl."sheet_id" = sh."id" AND sl."kind" = 'attend'
WHERE r."response" IN ('going', 'maybe');--> statement-breakpoint
CREATE UNIQUE INDEX "signup_slots_attend_idx" ON "signup_slots" USING btree ("sheet_id") WHERE "signup_slots"."kind" = 'attend';--> statement-breakpoint
DROP TABLE "rsvps" CASCADE;
