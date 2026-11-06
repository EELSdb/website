import { Hono } from "hono";
import { raw } from "hono/html";
import type { AppEnv, User } from "../auth";
import { Layout } from "../pages/layout";
import { SITE } from "../site";
import { MONTH, digestMonths, monthDigest, type DigestMonth } from "./data";
import { renderDigest } from "./render";
import { monthCounts, monthName } from "./routes";

/** Every past month's digest on the web, including months from before the digest existed (ADR 0039). */
export const digestPages = new Hono<AppEnv>();

const listAnd = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] ?? "");
const people = (names: string[]) => listAnd(names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} others`] : names);

/** Asks for the digest in the way that fits who is looking. */
function GetIt(props: { user: User | null; next: string }) {
  const { user } = props;
  if (!user) {
    return (
      <div class="digest-cta">
        <a class="button" href={`/login/?next=${encodeURIComponent(props.next)}`}>Sign in to get it by email</a>
        <p>Anyone with an EELSdb account can have it.</p>
      </div>
    );
  }
  if (!user.digest_address) {
    return (
      <div class="digest-cta">
        <a class="button secondary" href="/account/settings/emails/">Email settings</a>
        <p>Confirm an email address to get the digest.</p>
      </div>
    );
  }
  if (user.digest) {
    return (
      <div class="digest-cta">
        <a class="button secondary" href="/account/settings/emails/#digest">Email settings</a>
        <p>You get the digest at <strong>{user.digest_address}</strong>.</p>
      </div>
    );
  }
  return (
    <div class="digest-cta">
      <form method="post" action="/account/digest/">
        <input type="hidden" name="on" value="1" />
        <input type="hidden" name="next" value={props.next} />
        <button class="button" type="submit">Email me the digest</button>
      </form>
      <p>One email a month to {user.digest_address}, only when something is new.</p>
    </div>
  );
}

digestPages.get("/digest/", async (c) => {
  const month = c.req.query("month");
  if (month && MONTH.test(month)) return c.redirect(`/digest/${month}/`);
  const db = c.env.DB;
  const [months, [{ results: firsts }, { results: authors }, { results: news }]] = await Promise.all([
    digestMonths(db),
    db.batch<any>([
      db.prepare(
        `SELECT month, slug FROM (SELECT substr(published_at, 1, 7) AS month, slug, ROW_NUMBER() OVER (PARTITION BY substr(published_at, 1, 7) ORDER BY published_at, id) AS i
         FROM spectra WHERE status = 'published' AND published_at IS NOT NULL) WHERE i = 1`,
      ),
      db.prepare(
        `SELECT substr(published_at, 1, 7) AS month, author_display AS name, COUNT(*) AS n FROM spectra WHERE status = 'published' AND published_at IS NOT NULL
         GROUP BY 1, 2 ORDER BY 1, 3 DESC, 2`,
      ),
      db.prepare("SELECT substr(published_at, 1, 7) AS month, title FROM news WHERE status = 'published' ORDER BY published_at DESC, id DESC"),
    ]),
  ]);
  const plotOf = new Map(firsts.map((r: { month: string; slug: string }) => [r.month, r.slug]));
  const namesOf = Map.groupBy(authors as { month: string; name: string }[], (r) => r.month);
  const newsOf = Map.groupBy(news as { month: string; title: string }[], (r) => r.month);
  const years = Map.groupBy(months, (m) => m.month.slice(0, 4));
  const user = c.get("user") ?? null;
  return c.html(
    <Layout user={user} title="Monthly digest" path="/digest/" description="Each month's new spectra and news from the EELS Data Base.">
      <div class="digest-index">
        <h1>Monthly digest</h1>
        <p class="lede">Each month's news and new spectra from the EELS Data Base, as one email. Months with nothing new send nothing.</p>
        <GetIt user={user} next="/digest/" />
        {months.length === 0 && <p class="muted">Nothing yet.</p>}
        {[...years].map(([year, list]) => (
          <section class="digest-year" aria-labelledby={`y${year}`}>
            <h2 id={`y${year}`}>{year}</h2>
            <ul class="digest-months">
              {list.map((m: DigestMonth) => {
                const slug = plotOf.get(m.month);
                const titles = newsOf.get(m.month)?.map((n) => n.title) ?? [];
                const names = namesOf.get(m.month)?.map((n) => n.name) ?? [];
                return (
                  <li class="digest-month">
                    {slug ? <img src={`/og/digest/tile/${slug}.png`} alt="" width="262" height="86" loading="lazy" /> : <span class="digest-month-news" aria-hidden="true">News</span>}
                    <div>
                      <h3><a href={`/digest/${m.month}/`}>{monthName(m.month).replace(` ${year}`, "")}</a></h3>
                      <p class="digest-counts">{monthCounts(m)}</p>
                      {titles.map((t) => <p class="digest-highlight">{t}</p>)}
                      {names.length > 0 && <p class="digest-from">From {people(names)}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Layout>,
  );
});

// Follows the site's theme into the email, which otherwise follows the system's, and sizes the frame to the email.
const FRAME_SCRIPT = `(function(){var f=document.querySelector(".digest-frame"),b=f.dataset.src,r=document.documentElement;function set(){var t=r.dataset.theme,u=b+(t?"?scheme="+t:"");if(f.getAttribute("src")!==u)f.setAttribute("src",u)}function fit(){try{f.style.height=f.contentDocument.body.scrollHeight+"px"}catch(e){}}f.addEventListener("load",function(){fit();try{new ResizeObserver(fit).observe(f.contentDocument.body)}catch(e){}});new MutationObserver(set).observe(r,{attributes:true,attributeFilter:["data-theme"]});set();var s=document.getElementById("digest-pick");s.addEventListener("change",function(){location.href="/digest/"+s.value+"/"})})()`;

digestPages.get("/digest/:month{[0-9]{4}-[0-9]{2}}/", async (c) => {
  const month = c.req.param("month");
  const months = await digestMonths(c.env.DB);
  const i = months.findIndex((m) => m.month === month);
  if (i < 0) return c.notFound();
  const newer = months[i - 1];
  const older = months[i + 1];
  const user = c.get("user") ?? null;
  const src = `/digest/${month}/email/`;
  return c.html(
    <Layout user={user} title={`${monthName(month)} digest`} path={`/digest/${month}/`} description={`${monthCounts(months[i])} on the EELS Data Base in ${monthName(month)}.`}>
      <div class="digest-issue">
        <p class="digest-up"><a href="/digest/">Monthly digest</a></p>
        <h1>{monthName(month)}</h1>
        <p class="lede">{monthCounts(months[i])[0].toUpperCase() + monthCounts(months[i]).slice(1)}.</p>
        <nav class="digest-nav" aria-label="Other months">
          {older ? <a href={`/digest/${older.month}/`} rel="prev">‹ {monthName(older.month)}</a> : <span />}
          <form method="get" action="/digest/">
            <label class="digest-pick-label" for="digest-pick">Month</label>
            <select id="digest-pick" name="month">
              {months.map((m) => <option value={m.month} selected={m.month === month}>{monthName(m.month)}</option>)}
            </select>
            <noscript><button class="button secondary" type="submit">Go</button></noscript>
          </form>
          {newer ? <a href={`/digest/${newer.month}/`} rel="next">{monthName(newer.month)} ›</a> : <span />}
        </nav>
        <iframe class="digest-frame" src={src} data-src={src} title={`The EELSdb digest for ${monthName(month)}`} />
        <script>{raw(FRAME_SCRIPT)}</script>
        <GetIt user={user} next={`/digest/${month}/`} />
      </div>
    </Layout>,
  );
});

/** The email itself, for the frame on the month's page. */
digestPages.get("/digest/:month{[0-9]{4}-[0-9]{2}}/email/", async (c) => {
  const month = c.req.param("month");
  if (!(await digestMonths(c.env.DB)).some((m) => m.month === month)) return c.notFound();
  const data = await monthDigest(c.env.DB, month);
  if (!data) return c.notFound();
  const scheme = c.req.query("scheme");
  let html = renderDigest(data, null)
    .html.replace("<head>", '<head><base target="_top">')
    // Local servers keep the live SITE_URL, so point images and links at this server.
    .replaceAll(SITE, new URL(c.req.url).origin);
  if (scheme === "light" || scheme === "dark") html = html.replace("@media (prefers-color-scheme:dark)", scheme === "dark" ? "@media all" : "@media not all");
  return c.html(html, 200, { "Content-Security-Policy": "frame-ancestors 'self'", "X-Robots-Tag": "noindex" });
});
