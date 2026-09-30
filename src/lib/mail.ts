import nodemailer from "nodemailer";
import { getEnv, smtpConfigured } from "@/lib/env";

let transport: nodemailer.Transporter | undefined;

function getTransport() {
  const e = getEnv();
  transport ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  return transport;
}

/** Inline image referenced from the HTML as `src="cid:<cid>"`. */
export type MailAttachment = { filename: string; content: Buffer; cid: string; contentType: string };

export type MailResult = { sent: boolean; error?: string };

/** Email (plain text, plus an optional HTML alternative). Returns `{ sent: false }` when SMTP is not configured; never throws. */
export async function sendMail(to: string, subject: string, text: string, html?: string, attachments?: MailAttachment[]): Promise<MailResult> {
  if (!smtpConfigured()) return { sent: false, error: "SMTP is not configured" };
  try {
    await getTransport().sendMail({ from: getEnv().SMTP_FROM, to, subject, text, html, attachments });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

/** Verify the SMTP connection (used by the setup wizard and settings). */
export async function testSmtp(to: string): Promise<MailResult> {
  return sendMail(to, "Command test email", "If you can read this, email from Command is working.");
}
