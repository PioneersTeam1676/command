CREATE TABLE "client_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "server_time_in" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "server_time_out" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_actions" ADD CONSTRAINT "client_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;