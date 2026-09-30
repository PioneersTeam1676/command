ALTER TABLE "team_settings" ADD COLUMN "show_off_hours_notice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "clockout_note_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "clockout_note_required" boolean DEFAULT false NOT NULL;