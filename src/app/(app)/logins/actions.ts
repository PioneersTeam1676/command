"use server";

import { requireActionUser } from "@/lib/auth/current-user";
import { currentCode, revealPassword } from "@/lib/shared-logins";
import { uuidSchema } from "@/lib/validation";

type Failure = { ok: false; error: string };

async function who() {
  try {
    return await requireActionUser();
  } catch {
    return null;
  }
}

/** The password is only sent when someone asks for it, and every ask is logged. */
export async function revealPasswordAction(loginId: string): Promise<{ ok: true; password: string } | Failure> {
  const user = await who();
  const id = uuidSchema.safeParse(loginId);
  if (!user || !id.success) return { ok: false, error: "Please sign in again." };
  return revealPassword(user, id.data);
}

export async function currentCodeAction(loginId: string): Promise<{ ok: true; code: string; secondsLeft: number } | Failure> {
  const user = await who();
  const id = uuidSchema.safeParse(loginId);
  if (!user || !id.success) return { ok: false, error: "Please sign in again." };
  return currentCode(user, id.data);
}
