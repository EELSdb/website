import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/auth";
import { sent } from "../src/email";
import { deleteExpiredPasswordChanges } from "../src/pages/settings";
import { hashPassword } from "../src/password";

const SITE = "https://eelsdb.eu";

const post = (path: string, body: Record<string, string>, cookie?: string) =>
  exports.default.fetch(`${SITE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: SITE, "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(body).toString(),
  });
const login = (user: string, password: string, extra: Record<string, string> = {}) => post("/login/password/", { login: user, password, ...extra });
const sessionOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("eelsdb_session=") && c.length > 15);

let n = 0;
async function mkUser(fields: { password?: string; legacyEmail?: string; email?: string } = {}) {
  const id = (await env.DB.prepare("INSERT INTO users (display_name, legacy_email, password_hash) VALUES ('Pw', ?, ?) RETURNING id")
    .bind(fields.legacyEmail ?? null, fields.password ? await hashPassword(fields.password) : null)
    .first<number>("id"))!;
  if (fields.email) await env.DB.prepare("INSERT INTO user_emails (user_id, email, verified) VALUES (?, ?, 1)").bind(id, fields.email).run();
  return id;
}
const unique = (p: string) => `${p}-${++n}-${crypto.randomUUID().slice(0, 6)}`;
const column = (id: number, col: string) => env.DB.prepare(`SELECT ${col} AS v FROM users WHERE id = ?`).bind(id).first<string | null>("v");

/** A session as created `minutesAgo` minutes ago. */
async function sessionAt(userId: number, minutesAgo: number) {
  const token = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, datetime('now', ?), datetime('now', '+1 day'))")
    .bind(await sha256(token), userId, `-${minutesAgo} minutes`).run();
  return `eelsdb_session=${token}`;
}
const sessionCount = (userId: number) => env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").bind(userId).first<number>("n");

describe("email and password sign-in", () => {
  it("signs in with any verified address, case-insensitively, and returns to next", async () => {
    const email = `${unique("a")}@example.invalid`;
    await mkUser({ password: "a long password", email });
    const ok = await login(email.toUpperCase(), "a long password", { next: "/spectra/" });
    expect(ok.headers.get("location")).toBe("/spectra/");
    expect(sessionOf(ok)).toBeTruthy();
  });

  it("signs in with the username in the profile address, and an address wins over another account's username", async () => {
    const slug = unique("user");
    const id = await mkUser({ password: "a long password" });
    await env.DB.prepare("UPDATE users SET slug = ? WHERE id = ?").bind(slug, id).run();
    expect(sessionOf(await login(slug.toUpperCase(), "a long password"))).toBeTruthy();

    const email = `${unique("e")}@example.invalid`;
    await mkUser({ password: "the address owner", email });
    const other = await mkUser({ password: "the username owner" });
    await env.DB.prepare("UPDATE users SET slug = ? WHERE id = ?").bind(email, other).run();
    expect(sessionOf(await login(email, "the address owner"))).toBeTruthy();
  });

  it("does not say whether the account exists", async () => {
    const email = `${unique("b")}@example.invalid`;
    await mkUser({ password: "a long password", email });
    const wrong = await login(email, "not the password");
    const unknown = await login(`${unique("none")}@example.invalid`, "a long password");
    expect(wrong.headers.get("location")).toBe("/login/?error=password");
    expect(unknown.headers.get("location")).toBe("/login/?error=password");
    expect(sessionOf(wrong)).toBeUndefined();
  });

  it("does not accept an old-site address that was never confirmed", async () => {
    const legacyEmail = `${unique("old")}@example.invalid`;
    await mkUser({ password: "a long password", legacyEmail });
    expect((await login(legacyEmail, "a long password")).headers.get("location")).toBe("/login/?error=password");
  });

  it("does not accept an unverified address", async () => {
    const id = await mkUser({ password: "a long password" });
    const email = `${unique("c")}@example.invalid`;
    await env.DB.prepare("INSERT INTO user_emails (user_id, email, verified) VALUES (?, ?, 0)").bind(id, email).run();
    expect((await login(email, "a long password")).headers.get("location")).toBe("/login/?error=password");
  });

  it("locks a login after 10 wrong passwords, even for the right one", async () => {
    const email = `${unique("d")}@example.invalid`;
    await mkUser({ password: "a long password", email });
    for (let i = 0; i < 10; i++) expect((await login(email, "wrong")).headers.get("location")).toBe("/login/?error=password");
    const locked = await login(email, "a long password");
    expect(locked.headers.get("location")).toBe("/login/?error=locked");
    expect(sessionOf(locked)).toBeUndefined();
  });

  it("lets an older session sign in again, replacing it, and sends a recent one straight on", async () => {
    const email = `${unique("again")}@example.invalid`;
    const id = await mkUser({ password: "a long password", email });
    const page = (cookie: string) => exports.default.fetch(`${SITE}/login/?notice=again&next=%2Fadmin%2F`, { redirect: "manual", headers: { Cookie: cookie } });
    const old = await sessionAt(id, 180);
    const shown = await page(old);
    expect(shown.status).toBe(200);
    expect(await shown.text()).toContain("needs a sign-in in the last 2 hours");
    expect((await page(await sessionAt(id, 1))).headers.get("location")).toBe("/admin/");
    const again = await post("/login/password/", { login: email, password: "a long password", next: "/admin/" }, old);
    expect(again.headers.get("location")).toBe("/admin/");
    expect(sessionOf(again)).toBeTruthy();
    expect(await env.DB.prepare("SELECT 1 FROM sessions WHERE id = ?").bind(await sha256(old.split("=")[1])).first()).toBeNull();
  });

  it("shows the password form on the login page", async () => {
    const html = await (await exports.default.fetch(`${SITE}/login/`)).text();
    expect(html).toContain('action="/login/password/"');
  });
});

describe("password settings", () => {
  const page = (path: string, cookie?: string) =>
    exports.default.fetch(`${SITE}${path}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  const lastToken = () => [...sent].reverse().map((e) => e.text.match(/\/account\/password\/([\w-]+)\//)?.[1]).find(Boolean)!;
  const pending = (id: number) => env.DB.prepare("SELECT COUNT(*) AS n FROM password_changes WHERE user_id = ?").bind(id).first<number>("n");
  const setPasswordSignIn = (on: boolean) =>
    env.DB.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('signin_password', ?)").bind(on ? "1" : "0").run();

  it("saves a password only when the emailed link is confirmed, and a scanner's GET does nothing", async () => {
    const email = `${unique("p")}@example.invalid`;
    const id = await mkUser({ email });
    const cookie = await sessionAt(id, 300);
    expect(await (await page("/account/settings/sign-in/", cookie)).text()).not.toContain("Sign in again");
    const saved = await post("/account/settings/password/", { new_password: "a long password" }, cookie);
    expect(saved.headers.get("location")).toBe("/account/settings/sign-in/?notice=password-sent#h-password");
    expect(sent.at(-1)).toMatchObject({ to: email, subject: "Confirm your new EELS Data Base password" });
    expect(sent.at(-1)!.text).not.toContain("a long password");
    expect(await column(id, "password_hash")).toBeNull();
    const token = lastToken();
    const shown = await page(`/account/password/${token}/`);
    expect(shown.status).toBe(200);
    expect(await shown.text()).toContain("Use this password");
    expect(await column(id, "password_hash")).toBeNull();
    const elsewhere = await post(`/account/password/${token}/`, {});
    expect(elsewhere.status).toBe(200);
    expect(await elsewhere.text()).toContain("Your new password works now");
    expect(sessionOf(await login(email, "a long password"))).toBeTruthy();
    expect(await (await post(`/account/password/${token}/`, {})).text()).toContain("This link no longer works");
    expect(await (await page(`/account/password/${token}/`)).text()).toContain("This link no longer works");
  });

  it("keeps only the asking session, even when the link is opened elsewhere", async () => {
    const id = await mkUser({ email: `${unique("k")}@example.invalid`, password: "old password!" });
    const mine = await sessionAt(id, 1);
    await sessionAt(id, 1);
    await post("/account/settings/password/", { new_password: "brand new one" }, mine);
    expect(await sessionCount(id)).toBe(2);
    await post(`/account/password/${lastToken()}/`, {});
    expect(await sessionCount(id)).toBe(1);
    expect((await page("/account/settings/sign-in/", mine)).status).toBe(200);
    await post("/account/settings/password/", { new_password: "another new one" }, mine);
    expect((await post(`/account/password/${lastToken()}/`, {}, mine)).headers.get("location")).toBe("/account/settings/sign-in/?notice=password-saved#h-password");
  });

  it("lets only the newest link work, and refuses expired links and switched-off passwords", async () => {
    const id = await mkUser({ email: `${unique("n")}@example.invalid` });
    const cookie = await sessionAt(id, 1);
    await post("/account/settings/password/", { new_password: "first password" }, cookie);
    const first = lastToken();
    await post("/account/settings/password/", { new_password: "second password" }, cookie);
    expect(await (await post(`/account/password/${first}/`, {})).text()).toContain("This link no longer works");
    await env.DB.prepare("UPDATE password_changes SET expires_at = ? WHERE user_id = ?").bind(new Date(Date.now() - 60_000).toISOString(), id).run();
    expect(await (await post(`/account/password/${lastToken()}/`, {})).text()).toContain("This link no longer works");
    expect(await column(id, "password_hash")).toBeNull();

    await post("/account/settings/password/", { new_password: "third password" }, cookie);
    const third = lastToken();
    await setPasswordSignIn(false);
    try {
      expect((await post("/account/settings/password/", { new_password: "fourth password" }, cookie)).headers.get("location")).toContain("notice=password-off");
      expect(await (await post(`/account/password/${third}/`, {})).text()).toContain("This link no longer works");
    } finally {
      await setPasswordSignIn(true);
    }
    expect(await column(id, "password_hash")).toBeNull();
  });

  it("needs a confirmed address, a valid length, and the daily email limit", async () => {
    const none = await mkUser();
    const noAddress = await sessionAt(none, 1);
    const html = await (await page("/account/settings/sign-in/", noAddress)).text();
    expect(html).toContain("Confirm your email address first: you sign in with it, and the link that turns on your password goes to it.");
    expect(html).not.toContain('action="/account/settings/password/"');
    const before = sent.length;
    expect((await post("/account/settings/password/", { new_password: "a long password" }, noAddress)).headers.get("location")).toBe("/account/settings/sign-in/");
    expect(sent.length).toBe(before);
    expect(await pending(none)).toBe(0);

    const id = await mkUser({ email: `${unique("l")}@example.invalid` });
    const cookie = await sessionAt(id, 1);
    for (const bad of ["short", "x".repeat(201)]) {
      expect((await post("/account/settings/password/", { new_password: bad }, cookie)).headers.get("location")).toBe("/account/settings/sign-in/?notice=password-short#h-password");
    }
    expect(sent.length).toBe(before);
    expect(await pending(id)).toBe(0);
    for (let i = 0; i < 5; i++) {
      expect((await post("/account/settings/password/", { new_password: `password number ${i}` }, cookie)).headers.get("location")).toContain("notice=password-sent");
    }
    expect((await post("/account/settings/password/", { new_password: "one too many" }, cookie)).headers.get("location")).toContain("notice=password-limit");
    expect(await pending(id)).toBe(1);
  });

  it("keeps the asking browser signed in when it signed in again before the link was opened", async () => {
    const email = `${unique("again")}@example.invalid`;
    const id = await mkUser({ email, password: "old password!" });
    const old = await sessionAt(id, 300);
    await post("/account/settings/password/", { new_password: "brand new one" }, old);
    const fresh = sessionOf(await post("/login/password/", { login: email, password: "old password!" }, old))!;
    await post(`/account/password/${lastToken()}/`, {});
    expect(await sessionCount(id)).toBe(1);
    expect((await page("/account/settings/sign-in/", fresh)).status).toBe(200);
  });

  it("keeps one waiting password per account, and the daily clean-up deletes expired ones", async () => {
    const id = await mkUser({ email: `${unique("one")}@example.invalid` });
    const insert = (token: string, expires: string) =>
      env.DB.prepare("INSERT INTO password_changes (user_id, token_hash, password_hash, expires_at) VALUES (?, ?, 'x', ?)").bind(id, token, expires).run();
    const later = new Date(Date.now() + 3600_000).toISOString();
    await insert(`a-${id}`, later);
    await expect(insert(`b-${id}`, later)).rejects.toThrow();

    const other = await mkUser({ email: `${unique("old")}@example.invalid` });
    await env.DB.prepare("INSERT INTO password_changes (user_id, token_hash, password_hash, expires_at) VALUES (?, ?, 'x', ?)")
      .bind(other, `c-${other}`, new Date(Date.now() - 60_000).toISOString()).run();
    await deleteExpiredPasswordChanges(env);
    expect(await pending(other)).toBe(0);
    expect(await pending(id)).toBe(1);
  });

  it("removes a password with one click and signs out the other sessions", async () => {
    const id = await mkUser({ email: `${unique("r")}@example.invalid`, password: "old password!" });
    const mine = await sessionAt(id, 300);
    await sessionAt(id, 1);
    await post("/account/settings/password/", { new_password: "a waiting one" }, mine);
    const waiting = lastToken();
    expect((await post("/account/settings/password/remove/", {}, mine)).headers.get("location")).toContain("password-removed");
    expect(await column(id, "password_hash")).toBeNull();
    expect(await sessionCount(id)).toBe(1);
    expect(await (await post(`/account/password/${waiting}/`, {})).text()).toContain("This link no longer works");
    expect(await column(id, "password_hash")).toBeNull();
  });
});
