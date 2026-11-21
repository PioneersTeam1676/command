ALTER TABLE "events" ADD COLUMN "source_title" text;--> statement-breakpoint
UPDATE "events" SET "source_title" = "title" WHERE "source" = 'imported';