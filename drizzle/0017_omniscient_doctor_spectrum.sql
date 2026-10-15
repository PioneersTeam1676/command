CREATE TABLE "attendance_edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"prev_clock_in_at" timestamp with time zone NOT NULL,
	"prev_clock_out_at" timestamp with time zone,
	"prev_status" text NOT NULL,
	"prev_review_state" text NOT NULL,
	"new_clock_in_at" timestamp with time zone,
	"new_clock_out_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_edit_requests" ADD CONSTRAINT "attendance_edit_requests_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_edit_requests" ADD CONSTRAINT "attendance_edit_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_edit_requests" ADD CONSTRAINT "attendance_edit_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_edit_requests_user_idx" ON "attendance_edit_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_edit_requests_pending_idx" ON "attendance_edit_requests" USING btree ("session_id") WHERE "attendance_edit_requests"."state" = 'pending';