import { SITE, SITE_HOST } from "./site";

export type Email = { to: string; subject: string; text: string; replyTo?: string; footer?: string };

/**
 * Sends a plain-text email with a standard footer. EMAIL_PROVIDER "log" (default) writes it to the Worker log
 * and keeps it in `sent` for tests; "cloudflare" sends through the EMAIL binding from EMAIL_FROM.
 */
export const sent: Email[] = [];

export const FOOTER = `You received this email because this address was used on ${SITE_HOST}. If that was not you, you can ignore it.`;

// Keeps a month at about the 3,000 emails Workers Paid includes; each 1,000 after that costs $0.35.
export const MAX_EMAILS_PER_DAY = 100;

/** False, and nothing sent, when the daily cap is reached; callers carry on either way. */
export async function sendEmail(env: Env, { footer = FOOTER, ...email }: Email) {
  const message = { ...email, text: `${email.text}\n\n-- \nEELS Data Base, ${SITE}\n${footer}` };
  const provider = env.EMAIL_PROVIDER || "log";
  if (provider === "cloudflare") {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not set");
    // One statement, so parallel requests cannot all pass the count.
    const { meta } = await env.DB.prepare(
      "INSERT INTO rate_events (kind, key) SELECT 'email_sent', 'all' WHERE (SELECT COUNT(*) FROM rate_events WHERE kind = 'email_sent' AND key = 'all' AND at > datetime('now', '-1 day')) < ?",
    ).bind(MAX_EMAILS_PER_DAY).run();
    if (!meta.changes) {
      console.error(`[email] daily cap of ${MAX_EMAILS_PER_DAY} reached, not sent: ${JSON.stringify(message.subject)}`);
      return false;
    }
    await env.EMAIL.send({ from: { email: env.EMAIL_FROM, name: "EELSdb" }, to: message.to, subject: message.subject, text: message.text, ...(message.replyTo && { replyTo: message.replyTo }) });
    return true;
  }
  if (provider !== "log") throw new Error(`Email provider '${provider}' is not implemented`);
  sent.push(message);
  console.log(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
  return true;
}
