CREATE TABLE "shared_login_groups" (
	"login_id" uuid NOT NULL,
	"group_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_logins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"email" text NOT NULL,
	"password_enc" text NOT NULL,
	"totp_secret_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_login_groups" ADD CONSTRAINT "shared_login_groups_login_id_shared_logins_id_fk" FOREIGN KEY ("login_id") REFERENCES "public"."shared_logins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_login_groups" ADD CONSTRAINT "shared_login_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_login_groups_pair_idx" ON "shared_login_groups" USING btree ("login_id","group_id");--> statement-breakpoint
CREATE INDEX "shared_login_groups_group_idx" ON "shared_login_groups" USING btree ("group_id");