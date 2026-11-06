import { Hono, type Context } from "hono";
import { raw } from "hono/html";
import { signInAgainUrl, signedInRecently, type AppEnv } from "../auth";
import { AccountLayout, type Notice } from "../pages/layout";
import { getSettings, logChange, setSetting } from "../settings";
import { MONTH, digestMonths, monthDigest, type DigestMonth } from "./data";
import { sendDigest } from "./send";
import { DIGEST_ADDRESS } from "./subscription";

/** The digest switch and test sends, for admins. Mounted inside the staff area. */
export const digestAdmin = new Hono<AppEnv>();
type C = Context<AppEnv>;

digestAdmin.use("/admin/digest/*", async (c, next) => {
  if (c.get("user")!.role !== "admin") return c.text("Only admins can manage the digest.", 403);
  await next();
});

export const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
/** "1 news article and 666 new spectra" */
export const monthCounts = (m: Pick<DigestMonth, "news" | "spectra">) =>
  [m.news && plural(m.news, "news article", "news articles"), m.spectra && plural(m.spectra, "new spectrum", "new spectra")].filter(Boolean).join(" and ");

export const MAX_TEST_ADDRESSES = 10;
const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const NOTICES: Record<string, Notice> = {
  saved: ["success", "Saved."],
  "bad-address": ["error-summary", `Give up to ${MAX_TEST_ADDRESSES} email addresses, separated by commas, spaces or new lines.`],
  nothing: ["warning", "That month had no news and no new spectra, so it has no digest."],
  capped: ["warning", "Not all tests were sent: today's emails are close to the daily cap."],
};

// Keeps the "View on the web" link on the chosen month.
const VIEW_SCRIPT = `(function(){var s=document.getElementById("digest-month"),a=document.getElementById("digest-view");s.addEventListener("change",function(){a.href="/digest/"+s.value+"/"})})()`;

digestAdmin.get("/admin/digest/", async (c) => {
  const db = c.env.DB;
  const [settings, counts, months, me, { results: digests }] = await Promise.all([
    getSettings(db),
    db.prepare(`SELECT COUNT(*) AS readers, SUM(NOT EXISTS (${DIGEST_ADDRESS})) AS unconfirmed FROM users u WHERE u.digest = 1`).first<{ readers: number; unconfirmed: number | null }>(),
    digestMonths(db),
    db.prepare(`SELECT (${DIGEST_ADDRESS}) AS email FROM users u WHERE u.id = ?`).bind(c.get("user")!.id).first<string | null>("email"),
    db.prepare(
      `SELECT d.month, d.created_at, COUNT(ds.user_id) AS recipients, COUNT(ds.sent_at) AS sent
       FROM digests d LEFT JOIN digest_sends ds ON ds.month = d.month GROUP BY d.month ORDER BY d.month DESC LIMIT 24`,
    ).all<{ month: string; created_at: string; recipients: number; sent: number }>(),
  ]);
  const on = settings.digest_enabled === "1";
  const asked = c.req.query("month");
  const chosen = months.find((m) => m.month === asked)?.month ?? months[0]?.month;
  const notice: Notice | undefined =
    c.req.query("notice") === "test-sent" ? ["success", `Test sent to ${plural(Number(c.req.query("n")) || 0, "address", "addresses")}.`] : NOTICES[c.req.query("notice") ?? ""];
  const readers = counts?.readers ?? 0;
  const unconfirmed = counts?.unconfirmed ?? 0;
  return c.html(
    <AccountLayout title="Monthly digest" current="/admin/digest/" user={c.get("user")!}>
      <div class="settings">
        <h1>Monthly digest</h1>
        {notice && <p class={`notice ${notice[0]}`} role="status">{notice[1]}</p>}
        <p>
          {plural(readers, "person has", "people have")} the digest turned on
          {unconfirmed > 0 ? `; ${unconfirmed} of them ${unconfirmed === 1 ? "has" : "have"} no confirmed address yet and get${unconfirmed === 1 ? "s" : ""} nothing` : ""}.{" "}
          <a href="/digest/">See every month on the web</a>.
        </p>

        <h2>Sending</h2>
        <form method="post" action="/admin/digest/" class="settings-form">
          <div class="field">
            <label class="check">
              <input type="checkbox" name="digest_enabled" value="1" checked={on} /> Send the monthly digest
            </label>
            <p class="hint">
              Each month that had news or new spectra, the daily job sends that month's digest early on the 1st of the next month. Months while this is off are not
              sent later.
            </p>
            <p class="hint">
              Switch it off to stop a digest that is going out; nobody else gets it until you switch it back on. See{" "}
              <a href="/docs/adr/0039-monthly-digest-email/">ADR 0039</a>.
            </p>
          </div>
          <div><button class="button" type="submit">Save</button></div>
        </form>

        <h2>Test a month</h2>
        {months.length ? (
          <form method="post" action="/admin/digest/test/" class="settings-form">
            <div class="field">
              <label for="digest-month">Month</label>
              <select id="digest-month" name="month">
                {months.map((m) => (
                  <option value={m.month} selected={m.month === chosen}>{monthName(m.month)}: {monthCounts(m)}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label for="digest-to">Send a test to</label>
              <textarea id="digest-to" name="to" rows={2} aria-describedby="digest-to-hint">{me ?? ""}</textarea>
              <p class="hint" id="digest-to-hint">
                Up to {MAX_TEST_ADDRESSES} addresses, separated by commas, spaces or new lines. The subject starts with "[Test]". A month that has not gone out yet
                holds what it would hold if it went out now.
              </p>
            </div>
            <div>
              <button class="button" type="submit">Send test</button>{" "}
              <a class="button secondary" id="digest-view" href={`/digest/${chosen}/`} target="_blank">View on the web</a>
            </div>
            <script>{raw(VIEW_SCRIPT)}</script>
          </form>
        ) : (
          <p class="muted">No month has news or new spectra yet.</p>
        )}

        <h2>Sent digests</h2>
        {digests.length ? (
          <div class="table-scroll">
            <table>
              <thead><tr><th>Month</th><th>Built</th><th class="num">Sent</th><th class="num">Waiting</th></tr></thead>
              <tbody>
                {digests.map((d) => (
                  <tr>
                    <td><a href={`/digest/${d.month}/`}>{monthName(d.month)}</a></td>
                    <td>{d.created_at.slice(0, 16)} UTC</td>
                    <td class="num">{d.sent}</td>
                    <td class="num">{d.recipients - d.sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="muted">No digest has gone out yet.</p>
        )}
      </div>
    </AccountLayout>,
  );
});

digestAdmin.post("/admin/digest/", async (c) => {
  if (!(await signedInRecently(c))) return c.redirect(signInAgainUrl("/admin/digest/"));
  const me = c.get("user")!;
  const value = (await c.req.parseBody()).digest_enabled ? "1" : "0";
  const changed = value !== (await getSettings(c.env.DB)).digest_enabled;
  await setSetting(c.env.DB, "digest_enabled", value, me.id);
  if (changed) await logChange(c.env.DB, me.id, { digest_enabled: value });
  return c.redirect("/admin/digest/?notice=saved", 303);
});

/** The addresses in a test-send box, or null when any is not an address or there are too many. */
export function testAddresses(input: unknown) {
  const list = [...new Set(String(input ?? "").split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  return list.length && list.length <= MAX_TEST_ADDRESSES && list.every(validEmail) ? list : null;
}

digestAdmin.post("/admin/digest/test/", async (c: C) => {
  const body = await c.req.parseBody();
  const month = typeof body.month === "string" && MONTH.test(body.month) ? body.month : null;
  if (!month) return c.redirect("/admin/digest/", 303);
  const back = (notice: string) => `/admin/digest/?month=${month}&notice=${notice}`;
  const to = testAddresses(body.to);
  if (!to) return c.redirect(back("bad-address"), 303);
  const data = await monthDigest(c.env.DB, month);
  if (!data) return c.redirect(back("nothing"), 303);
  let n = 0;
  for (const address of to) {
    // "test" is no account's token, so the unsubscribe link in a test changes nothing.
    if (!(await sendDigest(c.env, data, address, "test", "[Test] "))) return c.redirect(back("capped"), 303);
    n++;
  }
  return c.redirect(`${back("test-sent")}&n=${n}`, 303);
});
