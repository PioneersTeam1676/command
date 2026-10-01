import { getEnv } from "@/lib/env";
import { shopOrderEmail } from "@/lib/email-templates";
import { sendMail } from "@/lib/mail";
import { adminEmails, type PlacedOrder } from "@/lib/shop";
import { formatMoney } from "@/lib/shop-rules";
import { adminIds, notify } from "@/lib/notify";
import { readSettings } from "@/lib/settings";
import { formatInTz } from "@/lib/time";

/**
 * After an order is saved: email the buyer ("hand a mentor the money by <date>") and every admin, plus an in-app
 * notice for admins. Never throws, because the order is already placed and a mail problem shouldn't undo it.
 */
export async function sendOrderMessages(order: PlacedOrder): Promise<void> {
  try {
    const team = await readSettings();
    const base = {
      order: {
        id: order.id,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        totalLabel: formatMoney(order.totalCents),
        lines: order.lines.map((l) => ({ itemName: l.itemName, sizeLabel: l.sizeLabel, qty: l.qty, priceLabel: formatMoney(l.unitPriceCents), printText: l.printText })),
      },
      payBy: order.payByAt ? formatInTz(new Date(order.payByAt.getTime() - 60_000), team.timezone, "EEEE, MMMM d") : null,
      appUrl: getEnv().APP_URL.replace(/\/$/, ""),
      team: { name: team.name, number: team.teamNumber, accent: team.accentColor },
    };
    const mine = shopOrderEmail({ kind: "buyer", ...base });
    await sendMail(order.buyerEmail, mine.subject, mine.text, mine.html);
    const theirs = shopOrderEmail({ kind: "admin", ...base });
    for (const to of await adminEmails()) await sendMail(to, theirs.subject, theirs.text, theirs.html);
    await notify({
      userIds: await adminIds(),
      type: "shop_order",
      title: `New shop order from ${order.buyerName}`,
      body: `${base.order.totalLabel} · ${order.lines.reduce((n, l) => n + l.qty, 0)} item(s)`,
      url: "/admin/shop",
      dedupeKey: order.id,
    });
  } catch {
    // swallow: see above
  }
}
