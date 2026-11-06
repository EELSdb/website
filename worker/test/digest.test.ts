import { env, exports } from "cloudflare:workers";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sent } from "../src/email";
import { setSetting } from "../src/settings";
import { clip, digestData, monthEnd, previousMonth, shortReference } from "../src/digest/data";
import { DIGEST_BATCH, buildDigest, runDigest, sendWaiting } from "../src/digest/send";
import { sessionFor } from "./helpers/session";

const SITE = "https://eelsdb.eu";
const READER = { id: 9917101, display_name: "Digest Reader" };
const OFF = { id: 9917102, display_name: "Digest Off" };
const UNCONFIRMED = { id: 9917103, display_name: "Digest Unconfirmed" };
const ADMIN = { id: 9917104, display_name: "Digest Admin", role: "admin" };
const USER = { id: 9917105, display_name: "Digest User" };
const IDS = [READER, OFF, UNCONFIRMED, ADMIN, USER].map((u) => u.id);
// October 2023 has one published spectrum in the seed, with the first Y L1 and L2,3 edges.
const MONTH = "2023-10";

const db = env.DB;
const reset = async () => {
  await db.batch([
    db.prepare("DELETE FROM digests"),
    db.prepare("DELETE FROM site_settings WHERE key = 'digest_enabled'"),
    db.prepare(`DELETE FROM users WHERE id IN (${IDS.join(",")})`),
  ]);
};

async function reader(u: { id: number; display_name: string }, digest: number, verified = 1) {
  await db.batch([
    db.prepare("INSERT INTO users (id, display_name, digest, digest_token) VALUES (?, ?, ?, ?)").bind(u.id, u.display_name, digest, `token-${u.id}`),
    db.prepare("INSERT INTO user_emails (user_id, email, verified, is_primary) VALUES (?, ?, ?, 1)").bind(u.id, `u${u.id}@example.invalid`, verified),
  ]);
}

describe("digest data", () => {
  it("works out month boundaries in UTC", () => {
    expect(monthEnd("2023-12")).toBe("2024-01-01");
    expect(monthEnd("2024-02")).toBe("2024-03-01");
    expect(previousMonth(new Date("2026-01-01T03:17:00Z"))).toBe("2025-12");
    expect(previousMonth(new Date("2026-11-30T23:59:00Z"))).toBe("2026-10");
  });

  it("clips descriptions at a sentence end", () => {
    expect(clip("  Short   text. ")).toBe("Short text.");
    const long = `${"Word ".repeat(40).trim()}. ${"More ".repeat(60).trim()}.`;
    expect(clip(long)).toBe(`${"Word ".repeat(40).trim()}.`);
    expect(clip("x".repeat(400))).toHaveLength(280);
    expect(clip(null)).toBeNull();
  });

  it("shortens references", () => {
    const base = { doi: "10.1/x", authors: null, journal: null, year: null, ref_title: null, freetext: null };
    expect(shortReference({ ...base, authors: "Simon Hettler; Other Person", journal: "ACS Nano", year: "2020" })).toEqual({ text: "Simon Hettler et al. (2020), ACS Nano", doi: "10.1/x" });
    expect(shortReference({ ...base, authors: "Solo", year: "1999" })?.text).toBe("Solo (1999)");
    expect(shortReference({ ...base, freetext: "A note" })?.text).toBe("A note");
    expect(shortReference({ ...base, doi: null })).toBeNull();
  });

  it("collects a month's spectra, new edges and totals", async () => {
    const d = await digestData(db, MONTH);
    expect(d.spectra).toBe(1);
    expect(d.groups).toHaveLength(1);
    const s = d.groups[0].spectra[0];
    expect(s.newEdges.map((e) => `${e.element} ${e.edge}`)).toEqual(expect.arrayContaining(["Y L1", "Y L2,3"]));
    expect(d.totals.spectra).toBeGreaterThan(200);
    expect(d.elements.Y).toBe(1);
  });

  it("shows six different titles for one contributor with many spectra", async () => {
    const { month } = (await db.prepare(
      `SELECT substr(published_at, 1, 7) AS month FROM spectra WHERE status = 'published' GROUP BY 1, author_display HAVING COUNT(*) > 6
       AND (SELECT COUNT(DISTINCT author_display) FROM spectra s2 WHERE s2.status = 'published' AND substr(s2.published_at, 1, 7) = substr(spectra.published_at, 1, 7)) = 1 LIMIT 1`,
    ).first<{ month: string }>())!;
    const d = await digestData(db, month);
    const titles = d.groups[0].spectra.map((s) => s.title.toLowerCase());
    expect(titles.length).toBeLessThanOrEqual(6);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("building and sending", () => {
  beforeEach(reset);
  afterAll(reset);
  afterEach(() => db.prepare("DELETE FROM rate_events WHERE kind = 'email_sent'").run());

  it("builds once, only for months with something new, for confirmed readers", async () => {
    await reader(READER, 1);
    await reader(OFF, 0);
    await reader(UNCONFIRMED, 1, 0);
    expect(await buildDigest(db, "1990-01")).toBe(false);
    expect(await buildDigest(db, MONTH)).toBe(true);
    expect(await buildDigest(db, MONTH)).toBe(false);
    const { results } = await db.prepare("SELECT user_id FROM digest_sends WHERE month = ?").bind(MONTH).all<{ user_id: number }>();
    expect(results.map((r) => r.user_id)).toEqual([READER.id]);
  });

  it("sends each reader one email with unsubscribe headers, and skips people who turned it off since", async () => {
    await reader(READER, 1);
    await reader(OFF, 1);
    await buildDigest(db, MONTH);
    await db.prepare("UPDATE users SET digest = 0 WHERE id = ?").bind(OFF.id).run();
    const before = sent.length;
    expect(await sendWaiting(env)).toBe(1);
    const mails = sent.slice(before);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(`u${READER.id}@example.invalid`);
    expect(mails[0].subject).toMatch(/^EELSdb digest: /);
    expect(mails[0].html).toContain(`${SITE}/digest/unsubscribe/token-${READER.id}/`);
    expect(mails[0].headers).toMatchObject({ "List-Unsubscribe": `<${SITE}/digest/unsubscribe/token-${READER.id}/>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(mails[0].text).not.toContain("You received this email because");
    expect(await sendWaiting(env)).toBe(0);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM digest_sends WHERE user_id = ?").bind(OFF.id).first("n")).toBe(0);
  });

  it("stops at the reserve and carries on in a later run", async () => {
    await reader(READER, 1);
    await buildDigest(db, MONTH);
    const calls: unknown[] = [];
    const cf = { EMAIL_PROVIDER: "cloudflare", EMAIL_FROM: "noreply@eelsdb.eu", EMAIL: { send: async (m: unknown) => void calls.push(m) }, DB: db } as unknown as Env;
    await db.prepare(
      "WITH RECURSIVE i(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM i WHERE n < 800) INSERT INTO rate_events (kind, key, at) SELECT 'email_sent', 'all', datetime('now', '-1 hour') FROM i",
    ).run();
    expect(await sendWaiting(cf)).toBe(0);
    expect(calls).toHaveLength(0);
    await db.prepare("DELETE FROM rate_events WHERE kind = 'email_sent'").run();
    expect(await sendWaiting(cf)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(DIGEST_BATCH).toBeGreaterThan(0);
  });

  it("does nothing while the switch is off", async () => {
    await reader(READER, 1);
    await setSetting(db, "digest_enabled", "0", READER.id);
    await runDigest(env, new Date("2023-11-01T03:17:00Z"));
    expect(await db.prepare("SELECT COUNT(*) AS n FROM digests").first("n")).toBe(0);
    await setSetting(db, "digest_enabled", "1", READER.id);
    const before = sent.length;
    await runDigest(env, new Date("2023-11-01T03:17:00Z"));
    expect(await db.prepare("SELECT COUNT(*) AS n FROM digests").first("n")).toBe(1);
    expect(sent.length).toBe(before + 1);
  });
});

describe("digest pages", () => {
  beforeEach(reset);
  afterAll(reset);
  const get = (path: string, cookie?: string) => exports.default.fetch(`${SITE}${path}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  const post = (path: string, cookie: string, body: Record<string, string>) =>
    exports.default.fetch(`${SITE}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: cookie, Origin: SITE, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });

  it("lists every past month with something new", async () => {
    const res = await get("/digest/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`href="/digest/${MONTH}/"`);
    expect(html).toContain("Sign in to get it by email");
    expect(html).not.toContain(`href="/digest/${new Date().toISOString().slice(0, 7)}/"`);
    expect((await get(`/digest/?month=${MONTH}`)).headers.get("Location")).toBe(`/digest/${MONTH}/`);
  });

  it("shows any past month on the web, framing the email without anyone's address", async () => {
    const page = await get(`/digest/${MONTH}/`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`src="/digest/${MONTH}/email/"`);
    expect(html).toContain('rel="prev"');
    for (const missing of ["/digest/1990-01/", "/digest/1990-01/email/", `/digest/${new Date().toISOString().slice(0, 7)}/`]) expect((await get(missing)).status).toBe(404);
    await reader(READER, 1);
    await buildDigest(db, MONTH);
    const email = await get(`/digest/${MONTH}/email/?scheme=dark`);
    expect(email.status).toBe(200);
    expect(email.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    const body = await email.text();
    expect(body).toContain('<base target="_top">');
    expect(body).toContain("@media all");
    expect(body).not.toContain("example.invalid");
    expect(body).not.toContain("/digest/unsubscribe/");
  });

  it("offers the digest to signed-in people who do not have it", async () => {
    await reader(READER, 0);
    const cookie = await sessionFor(READER);
    expect(await (await get("/digest/", cookie)).text()).toContain("Email me the digest");
    await db.prepare("UPDATE users SET digest = 1 WHERE id = ?").bind(READER.id).run();
    expect(await (await get("/digest/", cookie)).text()).toContain(`You get the digest at <strong>u${READER.id}@example.invalid</strong>`);
  });

  it("lets admins switch it off and send a month to test addresses", async () => {
    expect((await get("/admin/digest/", await sessionFor(USER))).status).toBe(403);
    const cookie = await sessionFor(ADMIN, { email: true });
    const page = await (await get("/admin/digest/", cookie)).text();
    expect(page).toContain(`<option value="${MONTH}"`);
    expect((await post("/admin/digest/", cookie, {})).headers.get("Location")).toBe("/admin/digest/?notice=saved");
    expect(await db.prepare("SELECT value FROM site_settings WHERE key = 'digest_enabled'").first("value")).toBe("0");
    const before = sent.length;
    const res = await post("/admin/digest/test/", cookie, { month: MONTH, to: "one@example.invalid,\nTwo@example.invalid one@example.invalid" });
    expect(res.headers.get("Location")).toBe(`/admin/digest/?month=${MONTH}&notice=test-sent&n=2`);
    expect(sent.slice(before).map((m) => m.to)).toEqual(["one@example.invalid", "two@example.invalid"]);
    expect(sent.at(-1)?.subject).toMatch(/^\[Test\] EELSdb digest: /);
    expect((await post("/admin/digest/test/", cookie, { month: MONTH, to: "not an address" })).headers.get("Location")).toContain("notice=bad-address");
    const many = Array.from({ length: 11 }, (_, i) => `a${i}@example.invalid`).join(",");
    expect((await post("/admin/digest/test/", cookie, { month: MONTH, to: many })).headers.get("Location")).toContain("notice=bad-address");
    expect((await post("/admin/digest/test/", cookie, { month: "1990-01", to: "one@example.invalid" })).headers.get("Location")).toContain("notice=nothing");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM digests").first("n")).toBe(0);
  });
});
