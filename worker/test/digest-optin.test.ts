import { env, exports } from "cloudflare:workers";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sent } from "../src/email";
import { setDigest, userForDigestToken } from "../src/digest/subscription";
import { sessionFor } from "./helpers/session";

const SITE = "https://eelsdb.eu";
const go = (path: string, init: RequestInit = {}) => exports.default.fetch(`${SITE}${path}`, { redirect: "manual", ...init });
const post = (path: string, body: Record<string, string>, cookie = "", origin: string | null = SITE) =>
  go(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(body).toString(),
  });
const cookieOf = (res: Response, name: string) =>
  res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`) && c.length > name.length + 1);
const row = (id: number) => env.DB.prepare("SELECT digest, digest_token FROM users WHERE id = ?").bind(id).first<{ digest: number; digest_token: string | null }>();

let next = 9910100;
/** The ORCID banner shows to anyone without a linked iD, and the digest banner yields to it, so test users have one unless asked not to. */
const newUser = async (options: { email?: boolean; orcid?: boolean } = {}) => {
  const id = next++;
  const cookie = await sessionFor({ id, display_name: `Digest Person ${id}` }, { email: options.email ?? true });
  if (options.orcid !== false) await env.DB.prepare("INSERT INTO identities (user_id, provider, subject) VALUES (?, 'orcid', ?)").bind(id, `0000-0009-${id}`).run();
  return { id, cookie };
};

afterAll(async () => {
  await env.DB.prepare("DELETE FROM users WHERE id >= 9910100 AND id < 9910200").run();
});
afterEach(() => vi.unstubAllGlobals());

describe("subscription", () => {
  it("makes a token when turned on and keeps it when turned off", async () => {
    const { id } = await newUser();
    expect(await row(id)).toEqual({ digest: 0, digest_token: null });
    await setDigest(env.DB, id, true);
    const on = (await row(id))!;
    expect(on.digest).toBe(1);
    expect(on.digest_token).toBeTruthy();
    await setDigest(env.DB, id, false);
    expect(await row(id)).toEqual({ digest: 0, digest_token: on.digest_token });
    await setDigest(env.DB, id, true);
    expect((await row(id))!.digest_token).toBe(on.digest_token);
    expect(await userForDigestToken(env.DB, on.digest_token!)).toEqual({ id });
    expect(await userForDigestToken(env.DB, "nope")).toBeNull();
  });

  it("is switched by the signed-in toggle, which returns to next", async () => {
    const { id, cookie } = await newUser();
    const res = await post("/account/digest/", { on: "1", next: "/spectra/" }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/spectra/");
    expect((await row(id))!.digest).toBe(1);
    await post("/account/digest/", { on: "0", next: "https://evil.example/" }, cookie).then((r) => expect(r.headers.get("location")).toBe("/account/"));
    expect((await row(id))!.digest).toBe(0);
    expect((await go("/account/digest/", { method: "POST", headers: { Origin: SITE } })).headers.get("location")).toContain("/login/");
  });

  it("is saved by the settings section", async () => {
    const { id, cookie } = await newUser();
    const page = await (await go("/account/settings/emails/", { headers: { Cookie: cookie } })).text();
    expect(page).toContain('id="digest"');
    expect(page).toContain("Email me a monthly digest");
    const form = new URLSearchParams();
    form.append("next", "/account/settings/emails/?notice=digest#digest");
    form.append("on", "0");
    form.append("on", "1");
    const res = await go("/account/digest/", { method: "POST", headers: { Origin: SITE, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    expect(res.headers.get("location")).toBe("/account/settings/emails/?notice=digest#digest");
    expect((await row(id))!.digest).toBe(1);
    expect(await (await go("/account/settings/emails/", { headers: { Cookie: cookie } })).text()).toMatch(/name="on" value="1" checked/);
    await post("/account/digest/", { next: "/", on: "0" }, cookie);
    expect((await row(id))!.digest).toBe(0);
  });

  it("says the section needs a confirmed address when there is none", async () => {
    const { cookie } = await newUser({ email: false });
    const page = await (await go("/account/settings/emails/", { headers: { Cookie: cookie } })).text();
    expect(page).toContain("needs a confirmed email address");
    expect(page).not.toContain('action="/account/digest/"');
  });
});

describe("sign-up", () => {
  async function welcomed(subject: string) {
    vi.stubGlobal("fetch", async (input: string | Request) => {
      const u = String(input);
      if (u.includes("token")) return Response.json({ access_token: "t" });
      if (u.endsWith("/user/emails")) return Response.json([]);
      return Response.json({ id: subject, login: "digest-test", name: "Digest Test" });
    });
    const start = await go("/auth/github/start?next=/spectra/");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const res = await go(`/auth/github/callback?code=abc&state=${state}`, { headers: { Cookie: cookieOf(start, "eelsdb_oauth")! } });
    expect(res.headers.get("location")).toBe("/login/welcome/");
    return cookieOf(res, "eelsdb_pending")!;
  }
  const userOf = (subject: string) => env.DB.prepare("SELECT user_id FROM identities WHERE provider = 'github' AND subject = ?").bind(subject).first<number>("user_id");

  it("offers an unticked box on the welcome page and applies it to the new account", async () => {
    for (const [subject, ticked] of [["9910201", true], ["9910202", false]] as const) {
      const pending = await welcomed(subject);
      const page = await (await go("/login/welcome/", { headers: { Cookie: pending } })).text();
      expect(page).toContain("Also email me a monthly digest of new spectra and news");
      expect(page).not.toMatch(/name="digest"[^>]*checked/);
      const res = await post("/login/welcome/", ticked ? { digest: "1" } : {}, pending);
      expect(res.status).toBe(302);
      const id = (await userOf(subject))!;
      expect((await row(id))!.digest).toBe(ticked ? 1 : 0);
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    }
  });

  it("carries the box through an email link to the account the link signs in to", async () => {
    const pending = await welcomed("9910203");
    await post("/login/email/", { email: "digest-link-new@example.invalid", digest: "1", next: "/spectra/" }, pending);
    const token = sent[sent.length - 1].text.match(/\/login\/email\/([^/\s]+)\//)![1];
    const stored = await env.DB.prepare("SELECT digest FROM login_links ORDER BY rowid DESC LIMIT 1").first<number>("digest");
    expect(stored).toBe(1);
    const res = await post(`/login/email/${token}/`, {}, pending);
    expect(res.status).toBe(302);
    const id = (await env.DB.prepare("SELECT user_id FROM user_emails WHERE email = 'digest-link-new@example.invalid'").first<number>("user_id"))!;
    expect((await row(id))!.digest).toBe(1);
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();

    const { id: existing } = await newUser();
    const email = `u${existing}@example.invalid`;
    await post("/login/email/", { email });
    const plain = sent[sent.length - 1].text.match(/\/login\/email\/([^/\s]+)\//)![1];
    await post(`/login/email/${plain}/`, {});
    expect((await row(existing))!.digest).toBe(0);
    await post("/login/email/", { email, digest: "1" });
    const ticked = sent[sent.length - 1].text.match(/\/login\/email\/([^/\s]+)\//)![1];
    await post(`/login/email/${ticked}/`, {});
    expect((await row(existing))!.digest).toBe(1);
  });

  it("applies the email step's box on submit", async () => {
    const { id, cookie } = await newUser({ email: false });
    const page = await (await go("/account/welcome/email/", { headers: { Cookie: cookie } })).text();
    expect(page).toContain("Also email me a monthly digest");
    await post("/account/welcome/email/", { email: `step${id}@example.invalid` }, cookie);
    expect((await row(id))!.digest).toBe(0);
    const res = await post("/account/welcome/email/", { email: `step2-${id}@example.invalid`, digest: "1" }, cookie);
    expect(res.status).toBe(200);
    expect((await row(id))!.digest).toBe(1);
  });
});

describe("banner", () => {
  const page = async (cookie: string, path = "/downloads/") => (await go(path, { headers: { Cookie: cookie } })).text();

  it("shows for a signed-in person with the digest off and a confirmed address", async () => {
    const { id, cookie } = await newUser();
    const html = await page(cookie);
    expect(html).toContain("Get one email a month with the new spectra and news from EELSdb.");
    expect(html).toContain(`data-address="u${id}@example.invalid"`);
    expect(html).toContain("Hide this message for 3 months");
  });

  it("stays away when it should", async () => {
    const on = await newUser();
    await setDigest(env.DB, on.id, true);
    expect(await page(on.cookie)).not.toContain("digest-banner");

    const none = await newUser({ email: false });
    const withoutAddress = await page(none.cookie);
    expect(withoutAddress).not.toContain("digest-banner");
    expect(withoutAddress).toContain("email-banner");

    const { cookie } = await newUser();
    for (const path of ["/account/welcome/email/", "/account/settings/emails/", "/login/"]) expect(await page(cookie, path), path).not.toContain("digest-banner");
    expect(await (await go("/downloads/")).text()).not.toContain("digest-banner");
  });

  it("stays away while the ORCID banner shows", async () => {
    const { cookie } = await newUser({ email: true, orcid: false });
    const html = await page(cookie);
    expect(html).toContain("orcid-banner");
    expect(html).not.toContain("digest-banner");
  });
});

describe("unsubscribe", () => {
  async function subscribed() {
    const { id } = await newUser();
    await setDigest(env.DB, id, true);
    return { id, token: (await row(id))!.digest_token! };
  }

  it("changes nothing on GET and shows a button", async () => {
    const { id, token } = await subscribed();
    const res = await go(`/digest/unsubscribe/${token}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Stop the monthly digest?");
    expect((await row(id))!.digest).toBe(1);
  });

  it("unsubscribes on POST and links to settings", async () => {
    const { id, token } = await subscribed();
    const res = await post(`/digest/unsubscribe/${token}/`, {});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("/account/settings/emails/#digest");
    expect((await row(id))!.digest).toBe(0);
  });

  it("accepts a one-click POST with no Origin header", async () => {
    const { id, token } = await subscribed();
    const res = await post(`/digest/unsubscribe/${token}/`, { "List-Unsubscribe": "One-Click" }, "", null);
    expect(res.status).toBe(200);
    expect((await row(id))!.digest).toBe(0);
  });

  it("treats an unknown token like any other and touches nobody", async () => {
    const { id } = await subscribed();
    expect((await go("/digest/unsubscribe/not-a-token/")).status).toBe(200);
    const res = await post("/digest/unsubscribe/not-a-token/", {}, "", null);
    expect(res.status).toBe(200);
    expect((await row(id))!.digest).toBe(1);
  });
});
