import type { LegalDoc } from "./types";

/**
 * KEEP IN SYNC WITH THE CODE. Any change to what data Command collects, stores, shares or sends
 * (new table/column with personal data, new third-party service, new notification channel, new
 * retention rule, registry payload changes) must update this file and bump `updated`.
 * See "Legal documents" in DECISIONS.md. Have a lawyer review before relying on it.
 */
export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  updated: "2026-10-11",
  intro:
    "Command is team-management software that each robotics team runs on its own server. This policy explains what information Command handles, who can see it, and the choices you have. Many Command users are under 18, so we collect as little as we can.",
  sections: [
    {
      heading: "Who is responsible for your data",
      paragraphs: [
        "Your team (the organization that runs this copy of Command) decides who joins and is responsible for the data stored on its server. Contact your team's admins for questions about your account or data.",
        "Alex Radu (the software owner) does not receive your personal data, except for the limited team-level information described under \"Registry and license check\" below.",
      ],
    },
    {
      heading: "What Command collects",
      bullets: [
        "Account details: your name, email address, and either a password (stored only as a one-way hash) or a link to your Google account (we keep Google's account ID and your verified email, nothing else).",
        "Role and status: whether you are a member, lead, admin or parent, and whether your account is approved.",
        "Attendance: when you clock in and out (using the server's clock, plus your device's clock time for taps made offline), the events or days they relate to, notes you or an admin add, and whether entries were edited, backfilled, self-reported or automatically closed. For events that use rotating codes, wrong-code attempts are counted briefly to prevent guessing.",
        "Sign-ups: whether you said you are coming to an event, the shifts and things to bring you sign up for or queue for on a waitlist, when, whether a lead placed you there, and any short note you add (for example \"I'll be late\"). Only leads and admins can see your notes. Leads and admins can place people on or remove them from shifts, and you are notified when they do.",
        "Shop orders: if the team opens its merch shop and you order, what you ordered (item, size, quantity), any text you asked to have printed on it (for example a name), your name and email at the time, the total, and whether it has been paid and handed over. No card or payment details are collected; you pay a mentor in person. Item photos are uploaded by admins.",
        "Calendar link: if you turn on your private calendar link, a one-way hash of its secret and when it was last used (the link itself is shown once and never stored). Anyone who has the link can see the names, times and places of your shifts until you make a new link or turn it off.",
        "Groups: if an admin puts you in a named group (for example a scouting group), that membership, so shifts can be reserved for or offered first to that group.",
        "Optional preferences: notification settings, the workdays you personally attend, whether you appear on the leaderboard, and your theme choice.",
        "Parent accounts: a parent's name, relationship to the student, optional phone number and note, and the link to the student they are approved to view.",
        "Access requests: your name, email and optional note when you ask to join.",
        "Notifications: if you turn on push notifications, your browser's push subscription (an address and keys issued by your device's push service), whether your browser has allowed or blocked notifications, and the time of the last successful delivery. Admins can see whether each member has notifications working (not the content of your devices).",
        "Security records: a session record (browser description and a one-way hash of your IP address), sign-in rate-limit counters, and an audit log of actions taken by admins and leads.",
      ],
    },
    {
      heading: "What Command does not collect",
      bullets: [
        "No location tracking, contacts, camera or microphone access.",
        "No advertising, no analytics trackers and no data sales.",
        "Members never see each other's email addresses. The leaderboard shows display names only.",
      ],
    },
    {
      heading: "How your information is used",
      bullets: [
        "To run the team: sign-in, approvals, attendance and hours, calendar, reminders.",
        "To send notifications you enabled, including reminders a day and an hour before a shift you signed up for, and, when the team has set up email, account and approval messages.",
        "To keep the service secure, prevent abuse and keep an accountable record of admin actions.",
      ],
    },
    {
      heading: "Who can see what",
      bullets: [
        "Members see their own hours, sign-ups and history, the calendar, and the leaderboard (display names and totals). On a sign-up sheet they also see the names of the teammates and parents signed up for each shift.",
        "Leads and admins see the roster, attendance (including, if the Team tracks outreach, how many outreach events each member attended), who is coming to each event, sign-ups with their notes, and who is currently clocked in. Only admins see shop orders (who ordered what, with the text to print), and they are emailed when an order is placed. You see only your own orders.",
        "Admins also manage accounts, approvals, groups and who is in them, settings, exports (including who signed up for which shift) and the audit log. Members see which groups a shift is reserved for, but not who is in a group.",
        "Parents see only the calendar and the hours, attendance and event changes of a student they are approved to view. They cannot see other members. Parents can sign up for shifts that are open to parents; they see how many places are filled but not who filled them.",
      ],
    },
    {
      heading: "Cookies and local storage",
      paragraphs: [
        "Command uses one strictly necessary cookie to keep you signed in (httpOnly, expires after 30 days of inactivity), short-lived cookies during Google sign-in and setup, and your theme choice stored in your browser. The installed app also keeps a cache of recently viewed pages on your device (cleared when you sign out) and, if you go offline, a queue of clock-in and clock-out taps until they sync. There are no advertising or tracking cookies.",
      ],
    },
    {
      heading: "Service providers",
      bullets: [
        "Google, if you choose Google sign-in (sign-in only; Google's own privacy policy applies to your Google account) and if your team connects Google Calendar (event titles, times, locations and descriptions are read from, or sent to, the team's calendar; the team's secret calendar link or service-account key is stored on the team's own server, never with member data).",
        "Command's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Data from Google is used only to sign you in and to sync your team's calendar, and is never sold, used for advertising, or shared with anyone else.",
        "Your device's push service (for example Google, Apple or Mozilla) delivers push notifications. Notification text may pass through it.",
        "Your calendar app or provider (for example Google, Apple or Microsoft), if you subscribe to your private calendar link: it fetches your shift names, times and places from Command on a schedule and keeps its own copy under its own privacy policy.",
        "Your team's email provider, if the team configures email.",
        "Your team's hosting provider, which stores the database.",
      ],
    },
    {
      heading: "Registry and license check",
      paragraphs: [
        "Unless the Team's admins turn it off in Settings, Command contacts a registry run by the software owner when it is set up and about once a day. It sends only: a random install ID, the software version, the team name, team number and region, the number of active members, and a build integrity value. It sends no names, emails, attendance or member lists. The registry keeps a one-way hash of the connecting IP address for at most 30 days, used only to detect misuse of the license. While the check-in is off, nothing is sent to the registry.",
      ],
    },
    {
      heading: "How long we keep data",
      bullets: [
        "Account and attendance data is kept while your team uses Command so seasons and history stay complete.",
        "When an account is deactivated, sign-in and notifications stop but past attendance is kept for reporting.",
        "Sessions expire after 30 days of inactivity. Password reset and invite links expire (1 hour and 7 days). Rate-limit counters are deleted within a day.",
        "An admin can permanently erase a person's personal data on request. Attendance rows remain, no longer linked to a name, email, login or device, sign-up entries stay under the anonymised name with their notes removed, and shop orders stay (for the team's records) with your name and email removed.",
      ],
    },
    {
      heading: "Your choices and rights",
      paragraphs: [
        "You can turn each notification type off, remove push devices by turning notifications off in your browser, hide yourself from the leaderboard, and export your own hours. You can ask your team's admins to correct or erase your data. Depending on where you live (for example under GDPR or California law) you may have additional rights to access, correct, delete or restrict use of your data; your team's admins handle these requests.",
      ],
    },
    {
      heading: "Children and students",
      paragraphs: [
        "Command is meant for use by teams that include minors. Teams are responsible for having any parent or guardian and school permissions their organization requires before adding students, and for using the parent-link feature only with a guardian's involvement. Parents can ask the team to see, correct or erase their child's data. Command collects only what is needed to run attendance and scheduling for the team.",
      ],
    },
    {
      heading: "Security",
      paragraphs: [
        "Passwords are hashed with Argon2, sign-in attempts are rate limited, tokens are stored only as hashes and expire, and access is checked on the server for every request. No system is perfectly secure; tell your team's admins and the owner if you suspect a problem.",
      ],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "We will update this page and its date when Command's data practices change. Questions about your data: contact your team's admins. Questions about the software or registry: alex@alexradu.co.",
      ],
    },
  ],
};
