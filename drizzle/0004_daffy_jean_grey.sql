ALTER TABLE "registry_state" ADD COLUMN "last_signature_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registry_state" ADD COLUMN "registered_at" timestamp with time zone;