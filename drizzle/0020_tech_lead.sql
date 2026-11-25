ALTER TABLE "team_settings" ADD COLUMN "tech_lead_user_id" uuid;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "tech_lead_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_settings" ADD CONSTRAINT "team_settings_tech_lead_user_id_users_id_fk" FOREIGN KEY ("tech_lead_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "team_settings_lock_tech_lead"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."tech_lead_user_id" IS NOT NULL THEN
      RAISE EXCEPTION 'The tech lead is permanent: team settings can''t be deleted once one is set.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."tech_lead_user_id" IS NOT NULL AND (
    NEW."tech_lead_user_id" IS DISTINCT FROM OLD."tech_lead_user_id"
    OR NEW."tech_lead_claimed_at" IS DISTINCT FROM OLD."tech_lead_claimed_at"
  ) THEN
    RAISE EXCEPTION 'The tech lead is permanent and can''t be changed or transferred.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "team_settings_lock_tech_lead" BEFORE UPDATE OR DELETE ON "team_settings" FOR EACH ROW EXECUTE FUNCTION "team_settings_lock_tech_lead"();
