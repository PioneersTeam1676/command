"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth/current-user";
import { feedUrl, resetFeed, revokeFeed } from "@/lib/calendar-feed";
import type { FormState } from "@/lib/form";

const refresh = () => {
  revalidatePath("/me/shifts");
  revalidatePath("/parent/shifts");
};

/** Makes the person's calendar address, or replaces it. The secret is only ever returned here, once. */
export async function resetFeedAction(): Promise<FormState> {
  const user = await requireActionUser("member", { allowParent: true });
  const token = await resetFeed(user.id);
  refresh();
  return { success: "Your calendar link is ready. Copy it now, it won't be shown again.", data: { url: feedUrl(token) } };
}

/** Turning a link off is a safety action, so it still works when the instance is read-only. */
export async function revokeFeedAction(): Promise<FormState> {
  const user = await requireActionUser("member", { allowParent: true, allowReadOnly: true });
  await revokeFeed(user.id);
  refresh();
  return { success: "Your calendar link is turned off." };
}
