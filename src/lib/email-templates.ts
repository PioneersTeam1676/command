/** HTML email templates. Table layout + inline styles only: that is what mail clients reliably render. */
import { deriveAccent } from "@/lib/color";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The app's own tokens (globals.css): light on a #fafafa surface with #eaeaea borders, 8px radius, Geist-style type.
const SANS = "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const L = { bg: "#ffffff", surface: "#fafafa", border: "#eaeaea", fg: "#171717", muted: "#666666" };
const D = { bg: "#000000", surface: "#0a0a0a", border: "#262626", fg: "#ededed", muted: "#a1a1a1" };

export type EmailTeam = { name: string; number?: string | null; accent: string };

export function adminWelcomeEmail(input: { name: string; promotedBy?: string; appUrl: string; team: EmailTeam; note?: string | null; logoCid?: string }) {
  const name = esc(input.name);
  const by = input.promotedBy ? esc(input.promotedBy) : null;
  const url = `${input.appUrl}/admin`;
  const teamName = input.team.name;
  const scale = deriveAccent(input.team.accent);
  const accent = scale.base;
  const onAccent = scale.foreground;
  const note = input.note?.trim() || null;
  const subject = `You're now an admin on ${teamName}`;

  const text = [
    `Hi ${input.name},`,
    "",
    `${input.promotedBy ? `${input.promotedBy} made` : "You were made"} you an admin of ${teamName} on Command.`,
    "",
    "As an admin you can:",
    "- Approve or deny people who ask to join",
    "- Manage people, roles and passwords",
    "- Run seasons, exports and notifications",
    "- See the audit log of every change",
    "",
    `Open the admin area: ${url}`,
    "",
    ...(note ? [note, ""] : []),
    "Every admin action is logged.",
  ].join("\n");

  // Same mark as the sign-in screen: the team logo, or the first letter on the accent colour.
  const mark = input.logoCid
    ? `<img src="cid:${esc(input.logoCid)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border-radius:6px;object-fit:cover;border:0;">`
    : `<div style="width:32px;height:32px;line-height:32px;border-radius:6px;background:${accent};color:${onAccent};text-align:center;font-family:${SANS};font-size:14px;font-weight:600;">${esc(teamName.slice(0, 1).toUpperCase())}</div>`;

  const item = (title: string, body: string) => `<tr><td class="bd" style="padding:12px 0;border-top:1px solid ${L.border};font-family:${SANS};font-size:14px;line-height:20px;color:${L.fg};"><span class="fg" style="font-weight:600;">${title}</span><br><span class="mu" style="color:${L.muted};font-size:13px;">${body}</span></td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>
<style>
@media (prefers-color-scheme: dark){
  .page{background:${D.surface} !important}
  .card{background:${D.bg} !important;border-color:${D.border} !important}
  .bd{border-color:${D.border} !important}
  .fg{color:${D.fg} !important}
  .mu{color:${D.muted} !important}
  .surface{background:${D.surface} !important;border-color:${D.border} !important}
}
</style></head>
<body class="page" style="margin:0;padding:0;background:${L.surface};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${by ?? "A teammate"} made you an admin of ${esc(teamName)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${L.surface};">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
    <tr><td style="padding:0 0 20px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding:0 10px 0 0;">${mark}</td>
        <td class="fg" style="font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:-.2px;color:${L.fg};">${esc(teamName)}</td>
      </tr></table>
    </td></tr>
    <tr><td class="card" style="background:${L.bg};border:1px solid ${L.border};border-radius:8px;padding:28px;">
      <div class="mu" style="font-family:${MONO};font-size:12px;color:${L.muted};padding-bottom:10px;">Permissions updated</div>
      <div class="fg" style="font-family:${SANS};font-size:24px;line-height:30px;font-weight:600;letter-spacing:-.5px;color:${L.fg};">You're now an admin.</div>
      <div class="fg" style="font-family:${SANS};font-size:15px;line-height:23px;color:${L.fg};padding-top:12px;">
        Hi ${name}, ${by ? `<strong>${by}</strong> made` : "you were made"} you an admin of ${esc(teamName)}. Here's what you can do now:
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
        ${item("Approve requests", "Let new people in, or turn them away.")}
        ${item("Manage people", "Roles, password resets and deactivations.")}
        ${item("Run the season", "Exports, reports and reminders.")}
        ${item("Audit log", "Every admin change is recorded.")}
      </table>
      ${note ? `<div class="surface" style="margin-top:18px;background:${L.surface};border:1px solid ${L.border};border-radius:6px;padding:12px 14px;font-family:${SANS};font-size:14px;line-height:21px;color:${L.fg};white-space:pre-line;"><span class="fg">${esc(note)}</span></div>` : ""}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr>
        <td style="background:${accent};border-radius:8px;"><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;font-family:${SANS};font-size:15px;font-weight:500;color:${onAccent};text-decoration:none;border-radius:8px;">Open admin</a></td>
      </tr></table>
    </td></tr>
    <tr><td class="mu" style="padding:16px 4px 0 4px;font-family:${SANS};font-size:12px;line-height:18px;color:${L.muted};">
      Didn't expect this? Ask a team admin to check your role.<br>
      <a class="mu" href="${esc(input.appUrl)}" style="color:${L.muted};">${esc(input.appUrl.replace(/^https?:\/\//, ""))}</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}
