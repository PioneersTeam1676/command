CREATE TABLE "signup_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"source" text DEFAULT 'self' NOT NULL,
	"assigned_by" uuid,
	"promoted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text DEFAULT 'Sign-ups' NOT NULL,
	"description" text,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"audience" text DEFAULT 'anyone' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_slots_capacity_chk" CHECK ("signup_slots"."capacity" between 1 and 500),
	CONSTRAINT "signup_slots_time_chk" CHECK ("signup_slots"."ends_at" > "signup_slots"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "signup_entries" ADD CONSTRAINT "signup_entries_slot_id_signup_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."signup_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_entries" ADD CONSTRAINT "signup_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_entries" ADD CONSTRAINT "signup_entries_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_sheets" ADD CONSTRAINT "signup_sheets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_sheets" ADD CONSTRAINT "signup_sheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_slots" ADD CONSTRAINT "signup_slots_sheet_id_signup_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."signup_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signup_entries_slot_user_idx" ON "signup_entries" USING btree ("slot_id","user_id");--> statement-breakpoint
CREATE INDEX "signup_entries_user_idx" ON "signup_entries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signup_sheets_event_idx" ON "signup_sheets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "signup_slots_sheet_idx" ON "signup_slots" USING btree ("sheet_id","starts_at");