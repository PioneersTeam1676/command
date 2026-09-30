import { getEnv } from "@/lib/env";
import { adminWelcomeEmail } from "@/lib/email-templates";
import { readLogo, sniffImage } from "@/lib/files";
import type { MailAttachment } from "@/lib/mail";
import type { TeamSettings } from "@/lib/settings";

/** The "you're an admin" email, branded with the team's name, accent colour, logo and custom note. */
export async function buildAdminWelcome(team: TeamSettings, to: { name: string }, promotedBy?: string) {
  const logo = team.logoPath ? await readLogo(team.logoPath) : null;
  const type = logo ? sniffImage(logo) : null;
  const mail = adminWelcomeEmail({
    name: to.name,
    promotedBy,
    appUrl: getEnv().APP_URL.replace(/\/$/, ""),
    team: { name: team.name, number: team.teamNumber, accent: team.accentColor },
    note: team.emailNote,
    logoCid: logo && type ? "team-logo" : undefined,
  });
  const attachments: MailAttachment[] | undefined =
    logo && type ? [{ filename: `logo.${type.ext}`, content: logo, cid: "team-logo", contentType: type.mime }] : undefined;
  return { ...mail, attachments };
}
