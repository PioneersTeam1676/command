"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clockInEvent } from "@/lib/attendance";
import { requireActionUser } from "@/lib/auth/current-user";
import type { FormState } from "@/lib/form";
import { uuidSchema } from "@/lib/validation";

export async function checkInAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireActionUser("member");
  const p = z.object({ eventId: uuidSchema, code: z.string().max(12).optional() }).safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: "Something's off with that link. Open the event from the calendar instead." };
  const r = await clockInEvent(user.id, p.data.eventId, { now: new Date(), code: p.data.code });
  if (!r.ok) return { error: r.error, values: { code: p.data.code ?? "" } };
  redirect("/?checkedin=1");
}
