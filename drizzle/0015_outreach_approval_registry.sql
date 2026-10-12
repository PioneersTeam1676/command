ALTER TABLE "events" ADD COLUMN "is_outreach" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "off_hours_requires_approval" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "outreach_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "registry_enabled" boolean DEFAULT true NOT NULL;