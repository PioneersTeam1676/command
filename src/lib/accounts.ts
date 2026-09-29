import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accessRequests, authTokens, sessions, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decideSignup } from "@/lib/auth/approval";
import { hashPassword } from "@/lib/auth/password";
import { hashToken, randomToken, temporaryPassword } from "@/lib/auth/tokens";
import { getEnv, smtpConfigured } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { adminIds, notify } from "@/lib/notify";
import { getSettings, readSettings } from "@/lib/settings";

const HOUR = 60 * 60 * 1000;

export type UserRow = typeof users.$inferSelect;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalizeEmail(email)}`);
  return u;
}

const appUrl = () => getEnv().APP_URL.replace(/\/$/, "");

async function createAuthToken(userId: string, kind: "email_verify" | "password_reset", ttlMs: number): Promise<string> {
  const token = randomToken();
  await db.insert(authTokens).values({ userId, kind, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Create an access request and tell the admins. */
export async function createAccessRequest(user: UserRow, note?: string | null) {
  const [existing] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.userId, user.id), eq(accessRequests.status, "pending")));
  if (existing) return existing.id;
  const [row] = await db.insert(accessRequests).values({ userId: user.id, note: note?.trim() || null }).returning({ id: accessRequests.id });
  await notify({
    userIds: await adminIds(),
    type: "access_request",
    title: "New access request",
    body: `${user.name} (${user.email}) is asking to join.`,
    url: "/admin/review",
    dedupeKey: `access:${row!.id}`,
  });
  return row!.id;
}

export type SignupOutcome = "needs_approval" | "await_verification" | "auto_approved";

export async function registerPasswordUser(input: {
  name: string;
  email: string;
  password: string;
  note?: string;
}): Promise<{ ok: true; userId: string; outcome: SignupOutcome } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  if (await findUserByEmail(email)) {
    return { ok: false, error: "An account with that email already exists. Try signing in instead." };
  }
  const settings = await getSettings();
  const decision = decideSignup({
    method: "password",
    email,
    emailVerified: false,
    smtpConfigured: smtpConfigured(),
    allowedDomains: settings.allowedDomains,
  });
  const [user] = await db
    .insert(users)
    .values({ email, name: input.name.trim(), passwordHash: await hashPassword(input.password), status: "pending", role: "member" })
    .returning();
  if (smtpConfigured()) await sendVerificationEmail(user!);
  if (decision.kind !== "await_verification") await createAccessRequest(user!, input.note);
  return {
    ok: true,
    userId: user!.id,
    outcome: decision.kind === "await_verification" ? "await_verification" : "needs_approval",
  };
}

export async function sendVerificationEmail(user: UserRow) {
  const token = await createAuthToken(user.id, "email_verify", 24 * HOUR);
  return sendMail(
    user.email,
    "Confirm your email for Command",
    `Hi ${user.name},\n\nConfirm your email address to finish signing up:\n${appUrl()}/verify/${token}\n\nThis link works for 24 hours. If you didn't sign up, you can ignore this email.`,
  );
}

/** Consume an email verification link. Applies allowed-domain auto-approval once the address is proven. */
export async function verifyEmailToken(token: string): Promise<{ ok: boolean; status?: "active" | "pending" }> {
  const claimed = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.kind, "email_verify"),
        isNull(authTokens.usedAt),
        sql`${authTokens.expiresAt} > now()`,
      ),
    )
    .returning({ userId: authTokens.userId });
  const userId = claimed[0]?.userId;
  if (!userId) return { ok: false };

  const [user] = await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId)).returning();
  if (!user) return { ok: false };
  if (user.status !== "pending" || user.role === "parent") return { ok: true, status: user.status === "active" ? "active" : "pending" };

  const [pendingRequest] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.userId, user.id), eq(accessRequests.status, "pending")));
  if (pendingRequest) return { ok: true, status: "pending" };

  const settings = await readSettings();
  const decision = decideSignup({
    method: "password",
    email: user.email,
    emailVerified: true,
    smtpConfigured: smtpConfigured(),
    allowedDomains: settings.allowedDomains,
  });
  if (decision.kind === "auto_approve") {
    await db.update(users).set({ status: "active" }).where(eq(users.id, user.id));
    await audit({ actorId: null, action: "user.auto_approved", targetType: "user", targetId: user.id, after: { via: "email_verification" } });
    return { ok: true, status: "active" };
  }
  await createAccessRequest(user);
  return { ok: true, status: "pending" };
}

export type GoogleClaims = { sub: string; email: string; emailVerified: boolean; name: string };
export type GoogleIntent = "login" | "parent";

export async function resolveGoogleLogin(
  claims: GoogleClaims,
  intent: GoogleIntent,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  // Trust only email_verified. The hosted-domain (hd) claim is never used.
  if (!claims.emailVerified) return { ok: false, error: "Google says this email address isn't verified, so we can't use it." };
  const email = normalizeEmail(claims.email);

  const [bySub] = await db.select().from(users).where(eq(users.googleSub, claims.sub));
  let user = bySub ?? (await findUserByEmail(email));

  if (user) {
    if (user.googleSub && user.googleSub !== claims.sub) return { ok: false, error: "This email is linked to a different Google account." };
    if (intent === "parent" && user.role !== "parent") {
      return { ok: false, error: "That email belongs to a team member account. Use a different Google account for parent access." };
    }
    if (!user.googleSub || !user.emailVerifiedAt) {
      [user] = await db
        .update(users)
        .set({ googleSub: claims.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
        .where(eq(users.id, user.id))
        .returning();
    }
    return statusGate(user!);
  }

  if (intent === "parent") {
    const [created] = await db
      .insert(users)
      .values({ email, name: claims.name || email, role: "parent", status: "active", googleSub: claims.sub, emailVerifiedAt: new Date() })
      .returning();
    return { ok: true, userId: created!.id };
  }

  const settings = await getSettings();
  const decision = decideSignup({
    method: "google",
    email,
    emailVerified: true,
    smtpConfigured: smtpConfigured(),
    allowedDomains: settings.allowedDomains,
  });
  const [created] = await db
    .insert(users)
    .values({
      email,
      name: claims.name || email,
      role: "member",
      status: decision.kind === "auto_approve" ? "active" : "pending",
      googleSub: claims.sub,
      emailVerifiedAt: new Date(),
    })
    .returning();
  if (decision.kind === "auto_approve") {
    await audit({ actorId: null, action: "user.auto_approved", targetType: "user", targetId: created!.id, after: { via: "google" } });
  } else {
    await createAccessRequest(created!);
  }
  return { ok: true, userId: created!.id };
}

/** Explain why an account can't sign in, or let it through. Pending users are let through to the waiting screen. */
export async function statusGate(user: UserRow): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  if (user.status === "deactivated") return { ok: false, error: "This account has been deactivated. Ask a team admin if you think that's a mistake." };
  if (user.status === "denied") {
    const [req] = await db
      .select({ reason: accessRequests.denyReason })
      .from(accessRequests)
      .where(and(eq(accessRequests.userId, user.id), eq(accessRequests.status, "denied")))
      .orderBy(sql`${accessRequests.decidedAt} desc nulls last`)
      .limit(1);
    return {
      ok: false,
      error: `Your request to join was not approved${req?.reason ? `: ${req.reason}` : "."} Contact a team admin if you have questions.`,
    };
  }
  return { ok: true, userId: user.id };
}

export async function approveAccessRequest(actorId: string, requestId: string, role: Exclude<Role, "parent"> = "member") {
  const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId));
  if (!req || req.status !== "pending") return { ok: false as const, error: "That request was already handled." };
  const [before] = await db.select().from(users).where(eq(users.id, req.userId));
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "active", role }).where(eq(users.id, req.userId));
    await tx.update(accessRequests).set({ status: "approved", decidedBy: actorId, decidedAt: new Date() }).where(eq(accessRequests.id, requestId));
    await audit(
      { actorId, action: "access_request.approve", targetType: "user", targetId: req.userId, before: { status: before?.status, role: before?.role }, after: { status: "active", role } },
      tx,
    );
  });
  if (before) {
    await notify({
      userIds: [req.userId],
      type: "access_decision",
      title: "You're in",
      body: `Your request to join was approved.`,
      url: "/",
      dedupeKey: `access-decision:${requestId}`,
      emailFallback: { subject: "Your Command access was approved", text: `Hi ${before.name},\n\nYour request to join was approved. Sign in here: ${appUrl()}/login` },
    });
  }
  return { ok: true as const };
}

export async function denyAccessRequest(actorId: string, requestId: string, reason?: string) {
  const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId));
  if (!req || req.status !== "pending") return { ok: false as const, error: "That request was already handled." };
  const [before] = await db.select().from(users).where(eq(users.id, req.userId));
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "denied" }).where(eq(users.id, req.userId));
    await tx
      .update(accessRequests)
      .set({ status: "denied", decidedBy: actorId, decidedAt: new Date(), denyReason: reason?.trim() || null })
      .where(eq(accessRequests.id, requestId));
    await tx.delete(sessions).where(eq(sessions.userId, req.userId));
    await audit({ actorId, action: "access_request.deny", targetType: "user", targetId: req.userId, before: { status: before?.status }, after: { status: "denied", reason: reason ?? null } }, tx);
  });
  if (before && smtpConfigured()) {
    await sendMail(
      before.email,
      "Your Command access request",
      `Hi ${before.name},\n\nYour request to join was not approved.${reason ? `\nReason: ${reason}` : ""}\nContact a team admin if you have questions.`,
    );
  }
  return { ok: true as const };
}

/** Self-service reset by email link. Always looks the same to the caller. */
export async function requestPasswordReset(email: string) {
  if (!smtpConfigured()) return;
  const user = await findUserByEmail(email);
  if (!user || user.status === "deactivated" || user.status === "denied") return;
  await sendResetLink(user);
}

export async function sendResetLink(user: UserRow) {
  const token = await createAuthToken(user.id, "password_reset", HOUR);
  return sendMail(
    user.email,
    "Reset your Command password",
    `Hi ${user.name},\n\nChoose a new password here:\n${appUrl()}/reset/${token}\n\nThis link works once and expires in 1 hour. If you didn't ask for this, ignore this email.`,
  );
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<{ ok: boolean }> {
  const claimed = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.kind, "password_reset"),
        isNull(authTokens.usedAt),
        sql`${authTokens.expiresAt} > now()`,
      ),
    )
    .returning({ userId: authTokens.userId });
  const userId = claimed[0]?.userId;
  if (!userId) return { ok: false };
  await db.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit({ actorId: null, action: "user.password_reset_by_link", targetType: "user", targetId: userId });
  return { ok: true };
}

export async function passwordResetTokenValid(token: string): Promise<boolean> {
  const [row] = await db
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(
      and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.kind, "password_reset"), isNull(authTokens.usedAt), sql`${authTokens.expiresAt} > now()`),
    );
  return Boolean(row);
}

/** Admin reset. With SMTP: emails a link. Without: returns a one-time temporary password to show on screen. */
export async function adminResetPassword(
  actorId: string,
  userId: string,
): Promise<{ ok: true; mode: "emailed" } | { ok: true; mode: "temporary"; password: string } | { ok: false; error: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { ok: false, error: "User not found." };
  if (smtpConfigured()) {
    const r = await sendResetLink(user);
    if (r.sent) {
      await audit({ actorId, action: "user.password_reset_emailed", targetType: "user", targetId: userId });
      return { ok: true, mode: "emailed" };
    }
    // Fall through to a temporary password when email can't be delivered.
  }
  const password = temporaryPassword();
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit({ actorId, action: "user.password_reset_temporary", targetType: "user", targetId: userId });
  return { ok: true, mode: "temporary", password };
}
