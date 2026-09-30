CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_slot_groups" (
	"slot_id" uuid NOT NULL,
	"group_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signup_slots" ADD COLUMN "opens_to_all_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_slot_groups" ADD CONSTRAINT "signup_slot_groups_slot_id_signup_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."signup_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_slot_groups" ADD CONSTRAINT "signup_slot_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_pair_idx" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_name_lower_idx" ON "groups" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "signup_slot_groups_pair_idx" ON "signup_slot_groups" USING btree ("slot_id","group_id");--> statement-breakpoint
CREATE INDEX "signup_slot_groups_group_idx" ON "signup_slot_groups" USING btree ("group_id");