import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
  emailAdminPromoted: boolean("email_admin_promoted").notNull().default(true),
  emailAccessApproved: boolean("email_access_approved").notNull().default(true),
  emailAccessDenied: boolean("email_access_denied").notNull().default(true),
  /** Optional short message added to the branded emails (e.g. "See you at the shop Tuesday!"). */
  emailNote: text("email_note"),
  allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'::text[]`),
  defaultCheckinVerification: text("default_checkin_verification").notNull().default("none"),
  backfillRequiresApproval: boolean("backfill_requires_approval").notNull().default(true),
  /** Hold clock-ins made outside build season or after the daily cutoff for a lead's approval. Off: they count right away. */
  offHoursRequiresApproval: boolean("off_hours_requires_approval").notNull().default(true),
  /** Lets leads tag events as outreach and shows staff how many outreach events each member attended. */
  outreachTrackingEnabled: boolean("outreach_tracking_enabled").notNull().default(false),
  /** Daily check-in with the owner's registry. Purely informational: it never limits what the app can do. */
  registryEnabled: boolean("registry_enabled").notNull().default(true),
  /** Show members the "outside build hours" warning when they clock in off-season or after the cutoff. */
  showOffHoursNotice: boolean("show_off_hours_notice").notNull().default(false),
  /** Ask "what did you do?" when clocking out of an open session; the answer is saved as the session note. */
  clockoutNoteEnabled: boolean("clockout_note_enabled").notNull().default(true),
  clockoutNoteRequired: boolean("clockout_note_required").notNull().default(false),
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
  /** Merch shop: off by default. When on, it shows in the navigation until `shopClosesAt` passes. */
  shopEnabled: boolean("shop_enabled").notNull().default(false),
  shopClosesAt: ts("shop_closes_at"),
  /** Shown above the items (pickup details, who to pay, etc.). */
  shopNote: text("shop_note"),
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
    /** Google profile photo (https URL on lh3.googleusercontent.com), refreshed on each Google sign-in. */
    avatarUrl: text("avatar_url"),
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
    /** Off for mandatory events (or ones that just don't need a head count): hides RSVP everywhere. */
    rsvpEnabled: boolean("rsvp_enabled").notNull().default(true),
    /** Counts toward each member's outreach total (when outreach tracking is on). */
    isOutreach: boolean("is_outreach").notNull().default(false),
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
    // Clock in and out as often as you like, but never two running open sessions at once.
    uniqueIndex("attendance_one_running_open_idx").on(t.userId).where(sql`${t.kind} = 'open' and ${t.status} = 'open'`),
    uniqueIndex("attendance_event_per_user_idx").on(t.userId, t.eventId).where(sql`${t.kind} = 'event'`),
  ],
);

/**
 * A member's request to change or remove one of their own entries. The change applies at once (so their hours stay right)
 * and is flagged until a lead decides: approve keeps it, revert restores the "prev" values.
 */
export const attendanceEditRequests = pgTable(
  "attendance_edit_requests",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().references(() => attendanceSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"edit" | "delete">().notNull(),
    /** superseded: a lead changed the entry directly after the request, so there is nothing left to decide. */
    state: text("state").$type<"pending" | "approved" | "reverted" | "superseded">().notNull().default("pending"),
    reason: text("reason").notNull(),
    prevClockInAt: ts("prev_clock_in_at").notNull(),
    prevClockOutAt: ts("prev_clock_out_at"),
    prevStatus: text("prev_status").notNull(),
    prevReviewState: text("prev_review_state").notNull(),
    newClockInAt: ts("new_clock_in_at"),
    newClockOutAt: ts("new_clock_out_at"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attendance_edit_requests_user_idx").on(t.userId),
    // One open question per entry at a time.
    uniqueIndex("attendance_edit_requests_pending_idx").on(t.sessionId).where(sql`${t.state} = 'pending'`),
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

// ---------- Sign-ups (slots attached to an event) ----------

/** One sign-up sheet per event. Slots hold the shifts people claim. */
export const signupSheets = pgTable(
  "signup_sheets",
  {
    id: id(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Sign-ups"),
    description: text("description"),
    /** Set when leads close the sheet: nobody can claim or leave on their own after that. */
    closedAt: ts("closed_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("signup_sheets_event_idx").on(t.eventId)],
);

export const signupAudiences = ["anyone", "members", "parents"] as const;

/**
 * What a slot is: a `shift` is a stretch of time to staff; an `item` is something to bring (capacity = how many
 * are needed, one per person); `attend` is the event's own "I'm going" spot, which replaced RSVPs.
 */
export const signupSlotKinds = ["shift", "item", "attend"] as const;
export type SignupSlotKind = (typeof signupSlotKinds)[number];
export type SignupAudience = (typeof signupAudiences)[number];

export const signupSlots = pgTable(
  "signup_slots",
  {
    id: id(),
    sheetId: uuid("sheet_id").notNull().references(() => signupSheets.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    capacity: integer("capacity").notNull(),
    audience: text("audience").$type<SignupAudience>().notNull().default("anyone"),
    kind: text("kind").$type<SignupSlotKind>().notNull().default("shift"),
    /**
     * With groups set: those groups get the slot first. Before this time only they can claim; after it
     * everyone the audience allows can. Null means the slot stays group-only for good.
     */
    opensToAllAt: ts("opens_to_all_at"),
    /** When full, new people can queue. Turning it off keeps whoever is already queued (they still get promoted). */
    waitlistEnabled: boolean("waitlist_enabled").notNull().default(true),
    position: integer("position").notNull().default(0),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("signup_slots_sheet_idx").on(t.sheetId, t.startsAt),
    // One "I'm going" spot per sheet, even if two requests try to make it at once.
    uniqueIndex("signup_slots_attend_idx").on(t.sheetId).where(sql`${t.kind} = 'attend'`),
    check("signup_slots_capacity_chk", sql`${t.capacity} between 1 and 500`),
    check("signup_slots_time_chk", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const signupEntries = pgTable(
  "signup_entries",
  {
    id: id(),
    slotId: uuid("slot_id").notNull().references(() => signupSlots.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("confirmed"), // confirmed | waitlisted
    source: text("source").notNull().default("self"), // self | admin
    /** Optional comment from the person ("allergic to nuts", "can bring two"). Leads and admins see it. */
    note: text("note"),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    promotedAt: ts("promoted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    // Nobody holds the same slot twice, even under a double tap.
    uniqueIndex("signup_entries_slot_user_idx").on(t.slotId, t.userId),
    index("signup_entries_user_idx").on(t.userId),
  ],
);

/** Named sets of people (e.g. "Super scouts") that admins keep, used to give slots to certain people first. */
export const groups = pgTable(
  "groups",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("groups_name_lower_idx").on(sql`lower(${t.name})`)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addedAt: ts("added_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_members_pair_idx").on(t.groupId, t.userId), index("group_members_user_idx").on(t.userId)],
);

/** Which groups a slot is reserved for. No rows means the slot isn't group-restricted. */
export const signupSlotGroups = pgTable(
  "signup_slot_groups",
  {
    slotId: uuid("slot_id").notNull().references(() => signupSlots.id, { onDelete: "cascade" }),
    // No cascade on purpose: deleting a group that still gates a shift would silently open that shift to everyone.
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "restrict" }),
  },
  (t) => [uniqueIndex("signup_slot_groups_pair_idx").on(t.slotId, t.groupId), index("signup_slot_groups_group_idx").on(t.groupId)],
);

/**
 * A private calendar-feed address for one person's shifts. Only the hash of the secret is kept, so the
 * address can be shown once (when made or reset) and never read back. One per user; resetting replaces it.
 */
export const calendarFeeds = pgTable(
  "calendar_feeds",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    lastFetchedAt: ts("last_fetched_at"),
  },
  (t) => [uniqueIndex("calendar_feeds_token_idx").on(t.tokenHash)],
);

export const shopPersonalizeModes = ["none", "optional", "required"] as const;
export type ShopPersonalizeMode = (typeof shopPersonalizeModes)[number];

export const shopItems = pgTable("shop_items", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  /** File name under DATA_DIR/shop (see lib/files.ts). */
  photoPath: text("photo_path"),
  /** Whether the buyer can type what gets printed (for example their name). */
  personalize: text("personalize").$type<ShopPersonalizeMode>().notNull().default("none"),
  personalizeLabel: text("personalize_label").notNull().default("Name to print"),
  personalizeMax: integer("personalize_max").notNull().default(30),
  /** Hidden items stay in old orders but can't be bought. */
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [check("shop_items_price_chk", sql`${t.priceCents} between 0 and 100000000`), check("shop_items_max_chk", sql`${t.personalizeMax} between 1 and 100`)]);

export const shopItemSizes = pgTable(
  "shop_item_sizes",
  {
    id: id(),
    itemId: uuid("item_id").notNull().references(() => shopItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    stock: integer("stock").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("shop_item_sizes_label_idx").on(t.itemId, t.label), check("shop_item_sizes_stock_chk", sql`${t.stock} >= 0`)],
);

export const shopOrderStatuses = ["pending", "paid", "delivered", "cancelled"] as const;
export type ShopOrderStatus = (typeof shopOrderStatuses)[number];

export const shopOrders = pgTable(
  "shop_orders",
  {
    id: id(),
    /** Kept null (with the name below) if the account is later erased. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    status: text("status").$type<ShopOrderStatus>().notNull().default("pending"),
    totalCents: integer("total_cents").notNull(),
    /** The date the buyer was told to pay by (the shop's end date when they ordered). */
    payByAt: ts("pay_by_at"),
    createdAt: createdAt(),
    paidAt: ts("paid_at"),
    deliveredAt: ts("delivered_at"),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [index("shop_orders_user_idx").on(t.userId), index("shop_orders_status_idx").on(t.status, t.createdAt)],
);

export const shopOrderLines = pgTable(
  "shop_order_lines",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => shopOrders.id, { onDelete: "cascade" }),
    /** Snapshots below keep the order readable after an item is edited or removed. */
    itemId: uuid("item_id").references(() => shopItems.id, { onDelete: "set null" }),
    sizeId: uuid("size_id").references(() => shopItemSizes.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    sizeLabel: text("size_label").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    qty: integer("qty").notNull(),
    printText: text("print_text"),
  },
  (t) => [index("shop_order_lines_order_idx").on(t.orderId), check("shop_order_lines_qty_chk", sql`${t.qty} between 1 and 20`)],
);
