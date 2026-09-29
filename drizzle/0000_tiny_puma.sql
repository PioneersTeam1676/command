CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"deny_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"event_id" uuid,
	"local_date" date NOT NULL,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"origin" text DEFAULT 'live' NOT NULL,
	"review_state" text DEFAULT 'none' NOT NULL,
	"self_reported" boolean DEFAULT false NOT NULL,
	"client_time_in" timestamp with time zone,
	"client_time_out" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin_codes" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location_text" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"verification" text DEFAULT 'inherit' NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"gcal_event_id" text,
	"ics_uid" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "in_app_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "member_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"attending" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_message" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"tamper_strikes" integer DEFAULT 0 NOT NULL,
	"first_mismatch_at" timestamp with time zone,
	"last_mismatch_at" timestamp with time zone,
	"signature_failures" integer DEFAULT 0 NOT NULL,
	"first_signature_failure_at" timestamp with time zone,
	"status" text DEFAULT 'ok' NOT NULL,
	"instance_token" text,
	"last_message" text,
	"revoke_deadline" timestamp with time zone,
	"manifest_missing" boolean DEFAULT false NOT NULL,
	"last_server_time" timestamp with time zone,
	"next_heartbeat_at" timestamp with time zone,
	"warned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" text NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"build_start" date,
	"build_end" date,
	"workdays" integer[] DEFAULT '{1,2,3,4,5}'::int[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'My Team' NOT NULL,
	"team_number" text,
	"region" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"accent_color" text DEFAULT '#0070f3' NOT NULL,
	"logo_path" text,
	"allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"default_checkin_verification" text DEFAULT 'none' NOT NULL,
	"backfill_requires_approval" boolean DEFAULT true NOT NULL,
	"auto_clockout_time" time DEFAULT '21:00' NOT NULL,
	"daily_reminder_time" time DEFAULT '15:30' NOT NULL,
	"clockout_reminder_time" time DEFAULT '20:30' NOT NULL,
	"event_autoclose_grace_minutes" integer DEFAULT 30 NOT NULL,
	"event_reminder_minutes_before" integer DEFAULT 60 NOT NULL,
	"google_ics_url" text,
	"google_calendar_last_sync_at" timestamp with time zone,
	"google_calendar_last_result" text,
	"install_id" text,
	"vapid_public" text,
	"vapid_private" text,
	"session_secret" text,
	"setup_completed_at" timestamp with time zone,
	"registry_registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"password_hash" text,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"google_sub" text,
	"email_verified_at" timestamp with time zone,
	"leaderboard_hidden" boolean DEFAULT false NOT NULL,
	"theme_preference" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_codes" ADD CONSTRAINT "checkin_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_days" ADD CONSTRAINT "member_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_invites" ADD CONSTRAINT "parent_invites_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "attendance_user_idx" ON "attendance_sessions" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE INDEX "attendance_open_idx" ON "attendance_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_open_per_day_idx" ON "attendance_sessions" USING btree ("user_id","local_date") WHERE "attendance_sessions"."kind" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_event_per_user_idx" ON "attendance_sessions" USING btree ("user_id","event_id") WHERE "attendance_sessions"."kind" = 'event';--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_idx" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_season_idx" ON "events" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_gcal_idx" ON "events" USING btree ("gcal_event_id") WHERE "events"."gcal_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "events_ics_uid_idx" ON "events" USING btree ("ics_uid") WHERE "events"."ics_uid" is not null;--> statement-breakpoint
CREATE INDEX "in_app_user_idx" ON "in_app_notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("run_at") WHERE "jobs"."done_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_idx" ON "jobs" USING btree ("kind","dedupe_key") WHERE "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "member_days_idx" ON "member_days" USING btree ("user_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_dedupe_idx" ON "notification_log" USING btree ("user_id","type","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_idx" ON "notification_prefs" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "parent_invites_hash_idx" ON "parent_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "parent_invites_student_idx" ON "parent_invites" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parent_links_pair_idx" ON "parent_links" USING btree ("parent_id","student_id");--> statement-breakpoint
CREATE INDEX "parent_links_status_idx" ON "parent_links" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rsvps_event_user_idx" ON "rsvps" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_current_idx" ON "seasons" USING btree ("is_current") WHERE "seasons"."is_current";--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_idx" ON "users" USING btree ("google_sub");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");