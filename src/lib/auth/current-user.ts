import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { isSetupComplete } from "@/lib/settings";
import { readSession, type SessionUser } from "./session";

export const getCurrentUser = cache(readSession);

const RANK: Record<Role, number> = { parent: 0, member: 1, lead: 2, admin: 3 };

/** True when `role` is at least `min`. Parents are outside the staff ladder and never pass member+. */
export function roleAtLeast(role: Role, min: "member" | "lead" | "admin"): boolean {
  if (role === "parent") return false;
  return RANK[role] >= RANK[min];
}

export const isStaff = (u: Pick<SessionUser, "role">) => roleAtLeast(u.role, "lead");

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "unauthenticated" | "forbidden" = "forbidden",
  ) {
    super(message);
  }
}

/**
 * Page guard. Redirects signed-out users to /login, unfinished setup to /setup, pending users to
 * /waiting and users with a temporary password to /change-password.
 */
export async function requireUser(opts: { min?: "member" | "lead" | "admin"; allowParent?: boolean } = {}): Promise<SessionUser> {
  if (!(await isSetupComplete())) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.status === "pending") redirect("/waiting");
  if (user.status !== "active") redirect("/login");
  if (user.role === "parent") {
    if (opts.allowParent) return user;
    redirect("/parent");
  }
  if (opts.min && !roleAtLeast(user.role, opts.min)) redirect("/");
  return user;
}

/** Guard for a parent-only page. */
export async function requireParent(): Promise<SessionUser> {
  const user = await requireUser({ allowParent: true });
  if (user.role !== "parent") redirect("/");
  return user;
}

/** Guard for server actions and route handlers: throws instead of redirecting. */
export async function requireActionUser(min: "member" | "lead" | "admin" = "member"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") throw new AuthError("Please sign in again.", "unauthenticated");
  if (user.mustChangePassword) throw new AuthError("Change your temporary password first.");
  if (!roleAtLeast(user.role, min)) throw new AuthError("You don't have permission to do that.");
  return user;
}
