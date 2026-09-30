ALTER TABLE "team_settings" ADD COLUMN "email_admin_promoted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "email_access_approved" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "email_access_denied" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "email_note" text;