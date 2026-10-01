import type { Role } from "@/db/schema";

/**
 * Every notification Command can send. Admins set the schedule (times and rules) team-wide in
 * settings; members can only turn each type on or off for themselves.
 */
export type NotificationType = {
  key: string;
  label: string;
  description: string;
  /** Who can receive it (and therefore who sees the switch). */
  roles: readonly Role[];
};

const STAFF_AND_MEMBERS = ["member", "lead", "admin"] as const;

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  { key: "daily_reminder", label: "Daily clock-in reminder", description: "On build season workdays, if you haven't clocked in yet.", roles: STAFF_AND_MEMBERS },
  { key: "clockout_reminder", label: "Clock-out reminder", description: "In the evening, if you're still clocked in.", roles: STAFF_AND_MEMBERS },
  { key: "auto_clockout", label: "Automatic clock-out notice", description: "When the system clocks you out because you forgot.", roles: STAFF_AND_MEMBERS },
  { key: "event_reminder", label: "Event reminder", description: "Shortly before an event you said you're going to (or maybe).", roles: STAFF_AND_MEMBERS },
  { key: "event_checkin_prompt", label: "Event check-in prompt", description: "When an event starts and you haven't checked in.", roles: STAFF_AND_MEMBERS },
  { key: "event_checkout_prompt", label: "Event clock-out prompt", description: "When an event ends and you're still checked in.", roles: STAFF_AND_MEMBERS },
  { key: "event_change", label: "New, changed or cancelled events", description: "Whenever the team adds, edits or cancels an event.", roles: ["member", "lead", "admin", "parent"] },
  { key: "signup_change", label: "Shift changes", description: "When a shift you signed up for is cancelled or you are added to or removed from one.", roles: ["member", "lead", "admin", "parent"] },
  { key: "signup_reminder", label: "Shift reminders", description: "A day before and an hour before a shift you signed up for.", roles: ["member", "lead", "admin", "parent"] },
  { key: "signup_open", label: "Shifts you can take", description: "When a shift is reserved for you first, a shift opens to everyone, or a lead reminds people to sign up.", roles: ["member", "lead", "admin", "parent"] },
  { key: "shop_order", label: "New shop orders", description: "When someone orders from the merch shop.", roles: ["admin"] },
  { key: "access_request", label: "New join requests", description: "When someone asks to join the team.", roles: ["admin"] },
  { key: "parent_request", label: "Parent link requests", description: "When a parent asks to follow a student.", roles: ["admin"] },
  { key: "access_decision", label: "Decision on your join request", description: "When an admin approves your request.", roles: STAFF_AND_MEMBERS },
  { key: "parent_status", label: "Updates on your parent request", description: "When the team responds to your request to follow a student.", roles: ["parent"] },
  { key: "registry_warning", label: "License check warnings", description: "If Command can't reach the license registry.", roles: ["admin"] },
] as const;

export const typesForRole = (role: Role) => NOTIFICATION_TYPES.filter((t) => t.roles.includes(role));

/** Types that never carry an in-app inbox row because they'd just be noise there. */
export const REMINDER_TYPES = new Set(["daily_reminder", "clockout_reminder", "event_reminder", "event_checkin_prompt", "event_checkout_prompt", "signup_reminder"]);
