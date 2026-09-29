import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const roles = ["member", "lead", "admin", "parent"] as const;
export type Role = (typeof roles)[number];
export const userStatuses = ["pending", "active", "denied", "deactivated"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const teamSettings = pgTable("team_settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default("My Team"),
  teamNumber: text("team_number"),
  region: text("region"),
  timezone: text("timezone").notNull().default("UTC"),
  accentColor: text("accent_color").notNull().default("#0070f3"),
  logoPath: text("logo_path"),
  allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'::text[]`),
  defaultCheckinVerification: text("default_checkin_verification").notNull().default("none"),
  backfillRequiresApproval: boolean("backfill_requires_approval").notNull().default(true),
  autoClockoutTime: time("auto_clockout_time").notNull().default("21:00"),
  dailyReminderTime: time("daily_reminder_time").notNull().default("15:30"),
  clockoutReminderTime: time("clockout_reminder_time").notNull().default("20:30"),
  eventAutocloseGraceMinutes: integer("event_autoclose_grace_minutes").notNull().default(30),
  eventReminderMinutesBefore: integer("event_reminder_minutes_before").notNull().default(60),
  googleIcsUrl: text("google_ics_url"),
  googleCalendarLastSyncAt: ts("google_calendar_last_sync_at"),
  googleCalendarLastResult: text("google_calendar_last_result"),
  installId: text("install_id"),
  vapidPublic: text("vapid_public"),
  vapidPrivate: text("vapid_private"),
  sessionSecret: text("session_secret"),
  setupTokenHash: text("setup_token_hash"),
  setupCompletedAt: ts("setup_completed_at"),
  registryRegistered: boolean("registry_registered").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<Role>().notNull().default("member"),
    status: text("status").$type<UserStatus>().notNull().default("pending"),
    passwordHash: text("password_hash"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    googleSub: text("google_sub"),
    emailVerifiedAt: ts("email_verified_at"),
    leaderboardHidden: boolean("leaderboard_hidden").notNull().default(false),
    themePreference: text("theme_preference").notNull().default("system"),
    /** What the browser last told us about notification permission: granted | denied | default. */
    pushPermission: text("push_permission"),
    pushPermissionAt: ts("push_permission_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    uniqueIndex("users_google_sub_idx").on(t.googleSub),
    index("users_status_idx").on(t.status),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha-256 of the cookie token
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // email_verify | password_reset
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull().defaultNow(),
});

export const accessRequests = pgTable(
  "access_requests",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    note: text("note"),
    status: text("status").notNull().default("pending"), // pending | approved | denied
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    denyReason: text("deny_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("access_requests_status_idx").on(t.status)],
);

export const parentInvites = pgTable(
  "parent_invites",
  {
    id: id(),
    studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    usedCount: integer("used_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("parent_invites_hash_idx").on(t.tokenHash), index("parent_invites_student_idx").on(t.studentId)],
);

export const parentLinks = pgTable(
  "parent_links",
  {
    id: id(),
    parentId: uuid("parent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    note: text("note"),
    status: text("status").notNull().default("pending"), // pending | needs_info | approved | denied
    adminMessage: text("admin_message"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("parent_links_pair_idx").on(t.parentId, t.studentId),
    index("parent_links_status_idx").on(t.status),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: id(),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    isCurrent: boolean("is_current").notNull().default(false),
    buildStart: date("build_start"),
    buildEnd: date("build_end"),
    workdays: integer("workdays").array().notNull().default(sql`'{1,2,3,4,5}'::int[]`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("seasons_one_current_idx").on(t.isCurrent).where(sql`${t.isCurrent}`)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    seasonId: uuid("season_id").notNull().references(() => seasons.id),
    title: text("title").notNull(),
    description: text("description"),
    locationText: text("location_text"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    cancelledAt: ts("cancelled_at"),
    verification: text("verification").notNull().default("inherit"), // inherit | none | code
    source: text("source").notNull().default("app"), // app | imported
    gcalEventId: text("gcal_event_id"),
    icsUid: text("ics_uid"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_starts_idx").on(t.startsAt),
    index("events_season_idx").on(t.seasonId),
    uniqueIndex("events_gcal_idx").on(t.gcalEventId).where(sql`${t.gcalEventId} is not null`),
    uniqueIndex("events_ics_uid_idx").on(t.icsUid).where(sql`${t.icsUid} is not null`),
  ],
);

export const rsvps = pgTable(
  "rsvps",
  {
    id: id(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    response: text("response").notNull(), // going | maybe | cant
    reason: text("reason"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rsvps_event_user_idx").on(t.eventId, t.userId)],
);

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id").notNull().references(() => seasons.id),
    kind: text("kind").notNull(), // event | open
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    localDate: date("local_date").notNull(),
    clockInAt: ts("clock_in_at").notNull(),
    clockOutAt: ts("clock_out_at"),
    status: text("status").notNull().default("open"), // open | closed | auto_closed | edited
    origin: text("origin").notNull().default("live"), // live | offline_synced | backfill | admin
    reviewState: text("review_state").notNull().default("none"), // none | needs_review | approved | rejected | pending_approval
    selfReported: boolean("self_reported").notNull().default(false),
    clientTimeIn: ts("client_time_in"),
    clientTimeOut: ts("client_time_out"),
    serverTimeIn: ts("server_time_in"),
    serverTimeOut: ts("server_time_out"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attendance_user_idx").on(t.userId, t.seasonId),
    index("attendance_open_idx").on(t.status),
    uniqueIndex("attendance_open_per_day_idx").on(t.userId, t.localDate).where(sql`${t.kind} = 'open'`),
    uniqueIndex("attendance_event_per_user_idx").on(t.userId, t.eventId).where(sql`${t.kind} = 'event'`),
  ],
);

/** Remembers the outcome of a queued/offline tap so a retried request is answered, never applied twice. */
export const clientActions = pgTable("client_actions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  result: jsonb("result"),
  createdAt: createdAt(),
});

export const checkinCodes = pgTable("checkin_codes", {
  eventId: uuid("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  createdAt: createdAt(),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSuccessAt: ts("last_success_at"),
    lastError: text("last_error"),
    disabledAt: ts("disabled_at"),
  },
  (t) => [uniqueIndex("push_endpoint_idx").on(t.endpoint), index("push_user_idx").on(t.userId)],
);

export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("notification_prefs_idx").on(t.userId, t.type)],
);

export const memberDays = pgTable(
  "member_days",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    attending: boolean("attending").notNull().default(true),
  },
  (t) => [uniqueIndex("member_days_idx").on(t.userId, t.weekday)],
);

export const notificationLog = pgTable(
  "notification_log",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: ts("sent_at").notNull().defaultNow(),
    result: text("result"),
  },
  (t) => [uniqueIndex("notification_log_dedupe_idx").on(t.userId, t.type, t.dedupeKey)],
);

/** In-app notification inbox (mirrors pushes so admins/parents can see them without push). */
export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("in_app_user_idx").on(t.userId, t.readAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key"),
    runAt: ts("run_at").notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    lockedAt: ts("locked_at"),
    doneAt: ts("done_at"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [
    index("jobs_due_idx").on(t.runAt).where(sql`${t.doneAt} is null`),
    uniqueIndex("jobs_dedupe_idx").on(t.kind, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const registryState = pgTable("registry_state", {
  id: integer("id").primaryKey().default(1),
  lastSuccessAt: ts("last_success_at"),
  lastAttemptAt: ts("last_attempt_at"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  tamperStrikes: integer("tamper_strikes").notNull().default(0),
  firstMismatchAt: ts("first_mismatch_at"),
  lastMismatchAt: ts("last_mismatch_at"),
  signatureFailures: integer("signature_failures").notNull().default(0),
  firstSignatureFailureAt: ts("first_signature_failure_at"),
  lastSignatureFailureAt: ts("last_signature_failure_at"),
  registeredAt: ts("registered_at"),
  status: text("status").notNull().default("ok"),
  instanceToken: text("instance_token"),
  lastMessage: text("last_message"),
  revokeDeadline: ts("revoke_deadline"),
  manifestMissing: boolean("manifest_missing").notNull().default(false),
  lastServerTime: ts("last_server_time"),
  nextHeartbeatAt: ts("next_heartbeat_at"),
  warnedAt: ts("warned_at"),
});
