import type { LegalDoc } from "./types";

/** KEEP IN SYNC with LICENSE, README and behaviour. Bump `updated` on every change. */
export const TERMS: LegalDoc = {
  title: "Terms of Service",
  updated: "2026-10-01",
  intro:
    "These terms apply to everyone who uses this copy of Command, a team-management app run by your robotics team. By creating an account or signing in you agree to them.",
  sections: [
    {
      heading: "Who provides Command",
      paragraphs: [
        "This copy of Command is operated by your team (\"the Team\"). The software is owned by Alex Radu (\"the Owner\") and licensed to the Team under a separate proprietary source-available license. The Owner does not run your Team's server and does not access your Team's data.",
      ],
    },
    {
      heading: "Your account",
      bullets: [
        "Give accurate information and keep your password private. You are responsible for activity on your account.",
        "Access is approved by the Team. The Team may approve, deny, deactivate or remove accounts.",
        "If you are under 18, use Command only with the permission your Team or school requires. Parent access is by invitation from the student and approval by a Team admin.",
      ],
    },
    {
      heading: "Acceptable use",
      bullets: [
        "Record your own attendance honestly. Do not clock in or out for someone else, or try to bypass check-in codes or time rules.",
        "Do not attempt to access other people's data, disrupt the service, probe for vulnerabilities without permission, or use Command to harass anyone.",
        "Do not copy, resell or host Command for others, or interfere with its registration and heartbeat, except as the license allows.",
      ],
    },
    {
      heading: "Attendance records",
      paragraphs: [
        "Hours are calculated by the rules in the app, which admins and leads may review, edit, approve or reject. Automatically closed and self-reported entries may be adjusted. Records are for the Team's own use and are provided as is.",
      ],
    },
    {
      heading: "Team shop",
      paragraphs: [
        "If your team turns on its merch shop, an order is a request to the team, not a purchase through Command. Command takes no payment: you pay a mentor in person by the date shown. Items, prices, stock and the text you ask to have printed are the team's responsibility, text you type must be appropriate, and the team may cancel or refuse any order. Printed items made with your text are usually not returnable.",
      ],
    },
    {
      heading: "Notifications",
      paragraphs: [
        "Push notifications are optional and depend on your device and browser. Reminders are a convenience and may be delayed or fail; do not rely on them for anything safety-critical.",
      ],
    },
    {
      heading: "Availability and read-only mode",
      paragraphs: [
        "The Team runs Command on its own infrastructure, so availability is not guaranteed. As a condition of the software license, if a copy cannot reach the license registry for 7 days or its license-check code has been altered, it switches to a read-only mode. In that mode you can still view your data and export it, but cannot clock in or out, sign up for events or shifts, or edit.",
      ],
    },
    {
      heading: "Your data",
      paragraphs: [
        "How data is handled is described in the Privacy Policy. You can export your own hours at any time and ask the Team's admins to correct or erase your personal data.",
      ],
    },
    {
      heading: "Disclaimer and liability",
      paragraphs: [
        "Command is provided \"as is\" without warranties of any kind. To the fullest extent permitted by law, neither the Owner nor the Team is liable for indirect or consequential losses arising from use of Command. Nothing in these terms limits liability that cannot legally be limited.",
      ],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "These terms may be updated; the date above shows the latest version, and continued use means you accept the update. Questions about your account: your Team's admins. Questions about the software or license: alex@alexradu.co.",
      ],
    },
  ],
};
