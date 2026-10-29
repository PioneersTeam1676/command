import { and, asc, eq, exists, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groupMembers, groups, sharedLoginGroups, sharedLogins, users, type Role } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret, secretsConfigured } from "@/lib/secrets";
import { base32Decode, secondsLeft, totp } from "@/lib/totp";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
export type Viewer = { id: string; role: Role };

export const NOT_CONFIGURED = "Shared logins are turned off. Set SHARED_LOGIN_KEY on the server to use them.";

/** Accepts a bare Base32 secret or a pasted otpauth:// link (what the setup QR code holds). */
export function parseTotpSecret(input: string): string | null {
  let raw = input.trim();
  if (/^otpauth:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).searchParams.get("secret") ?? "";
    } catch {
      return null;
    }
  }
  const bytes = base32Decode(raw);
  if (!bytes || bytes.length < 10) return null;
  return raw.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
}

const base = {
  label: z.string().trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters."),
  email: z.string().trim().min(1, "Enter the email address.").max(200),
  groupIds: z.array(z.uuid()).min(1, "Pick at least one group.").max(50),
};
export const createLoginSchema = z.object({
  ...base,
  password: z.string().min(1, "Enter the password.").max(500),
  totpSecret: z.string().min(1, "Paste the authenticator secret."),
});
/** On edit, leaving the password or secret blank keeps what is stored. */
export const updateLoginSchema = z.object({ ...base, password: z.string().max(500).optional(), totpSecret: z.string().optional() });
export type CreateLoginInput = z.infer<typeof createLoginSchema>;
export type UpdateLoginInput = z.infer<typeof updateLoginSchema>;

// --- Access ---------------------------------------------------------------------------------------------

/** Admins see every login. Everyone else needs to be in a group it was given to. Parents never see them. */
export async function canSeeLogin(viewer: Viewer, loginId: string): Promise<boolean> {
  if (viewer.role === "parent") return false;
  const [me] = await db.select({ status: users.status }).from(users).where(eq(users.id, viewer.id));
  if (me?.status !== "active") return false;
  if (viewer.role === "admin") {
    const [row] = await db.select({ id: sharedLogins.id }).from(sharedLogins).where(eq(sharedLogins.id, loginId));
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: sharedLogins.id })
    .from(sharedLogins)
    .where(
      and(
        eq(sharedLogins.id, loginId),
        exists(
          db
            .select({ one: sql`1` })
            .from(sharedLoginGroups)
            .innerJoin(groupMembers, eq(groupMembers.groupId, sharedLoginGroups.groupId))
            .where(and(eq(sharedLoginGroups.loginId, sharedLogins.id), eq(groupMembers.userId, viewer.id))),
        ),
      ),
    );
  return Boolean(row);
}

async function groupsByLogin(ids: string[]) {
  if (ids.length === 0) return new Map<string, { id: string; name: string }[]>();
  const rows = await db
    .select({ loginId: sharedLoginGroups.loginId, id: groups.id, name: groups.name })
    .from(sharedLoginGroups)
    .innerJoin(groups, eq(groups.id, sharedLoginGroups.groupId))
    .where(inArray(sharedLoginGroups.loginId, ids))
    .orderBy(asc(groups.name));
  const map = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) map.set(r.loginId, [...(map.get(r.loginId) ?? []), { id: r.id, name: r.name }]);
  return map;
}

/** Everything the admin page needs. Never includes the password or secret. */
export async function listLoginsForAdmin() {
  const rows = await db
    .select({ id: sharedLogins.id, label: sharedLogins.label, email: sharedLogins.email, updatedAt: sharedLogins.updatedAt })
    .from(sharedLogins)
    .orderBy(asc(sharedLogins.label));
  const g = await groupsByLogin(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, groups: g.get(r.id) ?? [] }));
}

/** The logins this person can use (label and email only; the password is fetched on demand). */
export async function listLoginsFor(viewer: Viewer) {
  if (viewer.role === "parent") return [];
  const all = await listLoginsForAdmin();
  if (viewer.role === "admin") return all;
  const mine = await db.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, viewer.id));
  const set = new Set(mine.map((m) => m.id));
  return all.filter((l) => l.groups.some((g) => set.has(g.id)));
}

// --- Using a login --------------------------------------------------------------------------------------

/** Reading a password is logged: who looked at which login, and when. Codes are not (they are read every 30 seconds). */
export async function revealPassword(viewer: Viewer, loginId: string): Promise<Result<{ password: string }>> {
  if (!secretsConfigured()) return { ok: false, error: NOT_CONFIGURED };
  if (!(await canSeeLogin(viewer, loginId))) return { ok: false, error: "You don't have access to that login." };
  const [row] = await db.select({ label: sharedLogins.label, passwordEnc: sharedLogins.passwordEnc }).from(sharedLogins).where(eq(sharedLogins.id, loginId));
  if (!row) return { ok: false, error: "That login no longer exists." };
  let password: string;
  try {
    password = decryptSecret(row.passwordEnc);
  } catch {
    return { ok: false, error: "This password can't be read. The server's SHARED_LOGIN_KEY may have changed. Ask an admin to re-enter it." };
  }
  await audit({ actorId: viewer.id, action: "shared_login.reveal", targetType: "shared_login", targetId: loginId, after: { label: row.label } });
  return { ok: true, password };
}

export async function currentCode(viewer: Viewer, loginId: string, at: number = Date.now()): Promise<Result<{ code: string; secondsLeft: number }>> {
  if (!secretsConfigured()) return { ok: false, error: NOT_CONFIGURED };
  if (!(await canSeeLogin(viewer, loginId))) return { ok: false, error: "You don't have access to that login." };
  const [row] = await db.select({ totpSecretEnc: sharedLogins.totpSecretEnc }).from(sharedLogins).where(eq(sharedLogins.id, loginId));
  if (!row) return { ok: false, error: "That login no longer exists." };
  try {
    const secret = base32Decode(decryptSecret(row.totpSecretEnc));
    if (!secret) throw new Error("bad secret");
    return { ok: true, code: totp(secret, at), secondsLeft: secondsLeft(at) };
  } catch {
    return { ok: false, error: "The code can't be made. Ask an admin to re-enter the authenticator secret." };
  }
}

// --- Admin changes --------------------------------------------------------------------------------------

async function realGroupIds(ids: string[]) {
  const rows = await db.select({ id: groups.id }).from(groups).where(inArray(groups.id, [...new Set(ids)]));
  return rows.map((r) => r.id);
}

export async function createLogin(actorId: string, input: CreateLoginInput): Promise<Result<{ id: string }>> {
  if (!secretsConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const secret = parseTotpSecret(input.totpSecret);
  if (!secret) return { ok: false, error: "That doesn't look like an authenticator secret.", field: "totpSecret" };
  const groupIds = await realGroupIds(input.groupIds);
  if (groupIds.length === 0) return { ok: false, error: "Pick at least one group.", field: "groupIds" };
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sharedLogins)
      .values({ label: input.label, email: input.email, passwordEnc: encryptSecret(input.password), totpSecretEnc: encryptSecret(secret) })
      .returning({ id: sharedLogins.id });
    await tx.insert(sharedLoginGroups).values(groupIds.map((groupId) => ({ loginId: row!.id, groupId })));
    await audit({ actorId, action: "shared_login.create", targetType: "shared_login", targetId: row!.id, after: { label: input.label, email: input.email, groupIds } }, tx);
    return row!.id;
  });
  return { ok: true, id };
}

export async function updateLogin(actorId: string, id: string, input: UpdateLoginInput): Promise<Result> {
  if (!secretsConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const [before] = await db.select({ label: sharedLogins.label, email: sharedLogins.email }).from(sharedLogins).where(eq(sharedLogins.id, id));
  if (!before) return { ok: false, error: "That login doesn't exist." };
  let secret: string | undefined;
  if (input.totpSecret?.trim()) {
    const parsed = parseTotpSecret(input.totpSecret);
    if (!parsed) return { ok: false, error: "That doesn't look like an authenticator secret.", field: "totpSecret" };
    secret = parsed;
  }
  const groupIds = await realGroupIds(input.groupIds);
  if (groupIds.length === 0) return { ok: false, error: "Pick at least one group.", field: "groupIds" };
  const rotated = [...(input.password ? ["password"] : []), ...(secret ? ["authenticator"] : [])];
  await db.transaction(async (tx) => {
    await tx
      .update(sharedLogins)
      .set({
        label: input.label,
        email: input.email,
        updatedAt: new Date(),
        ...(input.password ? { passwordEnc: encryptSecret(input.password) } : {}),
        ...(secret ? { totpSecretEnc: encryptSecret(secret) } : {}),
      })
      .where(eq(sharedLogins.id, id));
    await tx.delete(sharedLoginGroups).where(eq(sharedLoginGroups.loginId, id));
    await tx.insert(sharedLoginGroups).values(groupIds.map((groupId) => ({ loginId: id, groupId })));
    await audit({ actorId, action: "shared_login.update", targetType: "shared_login", targetId: id, before, after: { label: input.label, email: input.email, groupIds, rotated } }, tx);
  });
  return { ok: true };
}

export async function deleteLogin(actorId: string, id: string): Promise<Result> {
  const [before] = await db.select({ label: sharedLogins.label, email: sharedLogins.email }).from(sharedLogins).where(eq(sharedLogins.id, id));
  if (!before) return { ok: false, error: "That login doesn't exist." };
  await db.transaction(async (tx) => {
    await tx.delete(sharedLogins).where(eq(sharedLogins.id, id));
    await audit({ actorId, action: "shared_login.delete", targetType: "shared_login", targetId: id, before }, tx);
  });
  return { ok: true };
}
