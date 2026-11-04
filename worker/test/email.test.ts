import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { FOOTER, MAX_EMAILS_PER_DAY, sendEmail, sent } from "../src/email";

const email = { to: "a@lab.org", subject: "Hello", text: "Body" };
const cloudflare = (calls: unknown[]) =>
  ({ EMAIL_PROVIDER: "cloudflare", EMAIL_FROM: "noreply@eelsdb.eu", EMAIL: { send: async (m: unknown) => void calls.push(m) }, DB: env.DB }) as unknown as Env;

describe("sendEmail", () => {
  afterEach(() => env.DB.prepare("DELETE FROM rate_events WHERE kind = 'email_sent'").run());

  it("log provider keeps the message with the footer", async () => {
    const before = sent.length;
    await sendEmail({ EMAIL_PROVIDER: "log" } as Env, email);
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1)).toEqual({ ...email, text: `Body\n\n-- \nEELS Data Base, https://eelsdb.eu\n${FOOTER}` });
  });

  it("cloudflare provider passes from, to, subject and text to the binding", async () => {
    const calls: unknown[] = [];
    await sendEmail(cloudflare(calls), email);
    expect(calls).toEqual([{ from: { email: "noreply@eelsdb.eu", name: "EELSdb" }, to: "a@lab.org", subject: "Hello", text: `Body\n\n-- \nEELS Data Base, https://eelsdb.eu\n${FOOTER}` }]);
  });

  it("cloudflare provider stops at the daily cap without throwing", async () => {
    const calls: unknown[] = [];
    await env.DB.batch(Array.from({ length: MAX_EMAILS_PER_DAY - 1 }, () => env.DB.prepare("INSERT INTO rate_events (kind, key) VALUES ('email_sent', 'all')")));
    expect(await sendEmail(cloudflare(calls), email)).toBe(true);
    expect(await sendEmail(cloudflare(calls), email)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("cloudflare provider needs EMAIL_FROM; unknown providers throw", async () => {
    await expect(sendEmail({ EMAIL_PROVIDER: "cloudflare" } as Env, email)).rejects.toThrow("EMAIL_FROM");
    await expect(sendEmail({ EMAIL_PROVIDER: "x" } as Env, email)).rejects.toThrow("not implemented");
  });
});
