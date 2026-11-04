import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { AppEnv } from "../auth";
import NAMES from "../element-names.json";
import { BOTS, MIN_COUNT } from "../usage";
import { Layout, TypeBadge } from "./layout";
import { visibleSpectrumId } from "./spectrum";

const ELEMENT_NAMES: Record<string, string> = NAMES;
/** Label and plot colour of each stored value; values with the same label are added up. */
type Names = Record<string, readonly [string, string]>;
const APIS: Names = { v1: ["API v1", "--plot"], v2: ["API v2", "--compare-2"], oai: ["OAI-PMH", "--compare-1"], dcat: ["DCAT", "--compare-3"] };
const KINDS: Names = {
  browser: ["Browsers", "--plot"],
  ai: ["AI crawlers", "--compare-1"],
  "ai-user": ["AI agents for a user", "--compare-3"],
  search: ["Search engines", "--compare-2"],
  bot: ["Other bots", "--edge"],
  other: ["Scripts and prefetches", "--muted"],
};
const RESOURCES: Names = { "llms.txt": ["llms.txt", "--plot"], markdown: ["Markdown pages", "--compare-2"], skill: ["Agent skill", "--compare-1"], openapi: ["OpenAPI files", "--compare-3"] };
const FORMATS: Names = {
  msa: ["MSA", "--plot"],
  csv: ["CSV", "--compare-2"],
  json: ["JSON", "--compare-3"],
  hspy: ["HyperSpy", "--compare-1"],
  original: ["Original file", "--edge"],
  // The original file of a spectrum from the old site.
  legacy: ["Original file", "--edge"],
  variant: ["Processed version", "--compare-4"],
  lowloss: ["Low-loss file", "--compare-4"],
  companion: ["Companion file", "--compare-4"],
  metadata: ["File metadata", "--compare-4"],
  unknown: ["Not recorded", "--muted"],
};
const VIA: Names = { site: ["From the website", ""], direct: ["Direct (scripts, links from elsewhere)", ""], unknown: ["Not recorded", ""] };
const SECTIONS: Record<string, string> = {
  "/": "Home",
  "/spectra/": "Browse spectra",
  "/spectra/:slug/": "Spectrum pages",
  "/spectra/:slug/history/": "Spectrum history",
  "/spectra/:slug/usage/": "Spectrum usage",
  "/docs/*": "Documentation",
  "/author/:slug/": "Author pages",
  "/news/": "News",
  "/:slug/": "News posts",
  "/stats/": "Statistics",
  "/downloads/": "Bulk download",
  "/moderators/": "Moderators",
  "/contact/": "Contact",
  "/instruments/": "Instruments",
  "/instruments/:id/": "Instrument pages",
};
const BOT_KINDS = new Map(BOTS);
const TOP = 15;
const DAY = 86_400;
const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });
const fmt = (n: number) => n.toLocaleString("en");
const seconds = (date: string) => Date.parse(date) / 1000;
const labelOf = (names: Names) => (v: string) => names[v]?.[0] ?? v;

type Chart = { x: number[]; step?: boolean; week?: boolean; stack?: boolean; series: { label: string; colour: string; values: number[] }[] };
type Daily = { key: string; day: string; n: number };

/**
 * One series per label, largest first, with a point per day or per week from `from` to `to`.
 * A day with no row had no requests. Rows must be in day order.
 */
function chart(rows: Daily[], names: Names, opts: { stack?: boolean; week?: boolean; from?: string; to?: string } = {}): Chart | null {
  if (!rows.length) return null;
  const step = opts.week ? 7 * DAY : DAY;
  const end = seconds(opts.to ?? rows.at(-1)!.day);
  // Weeks end on the last day, so only the first week can be partial; each point is the first day of its week.
  const bucket = (day: string) => end - Math.floor((end - seconds(day)) / step) * step - (step - DAY);
  const first = bucket(opts.from ?? rows[0].day);
  const x = Array.from({ length: (bucket(opts.to ?? rows.at(-1)!.day) - first) / step + 1 }, (_, i) => first + i * step);
  const series = new Map<string, Chart["series"][number]>();
  for (const r of rows) {
    const [label, colour] = names[r.key] ?? [r.key, "--compare-4"];
    if (!series.has(label)) series.set(label, { label, colour, values: x.map(() => 0) });
    series.get(label)!.values[(bucket(r.day) - first) / step] += r.n;
  }
  const total = (s: Chart["series"][number]) => s.values.reduce((a, b) => a + b, 0);
  return { x, week: opts.week, stack: opts.stack, series: [...series.values()].sort((a, b) => total(b) - total(a)) };
}

/** Counts added up by label, largest first. */
function byLabel(rows: { value: string; n: number }[], label: (v: string) => string): [string, number][] {
  const sums = new Map<string, number>();
  for (const r of rows) sums.set(label(r.value), (sums.get(label(r.value)) ?? 0) + r.n);
  return [...sums].sort((a, b) => b[1] - a[1]);
}

type Ranked = { label: string; n: Record<string, number> };
const sum = (n: Record<string, number>) => Object.values(n).reduce((a, b) => a + b, 0);

/** The most frequent values, with the rest, and any below MIN_COUNT, as "Other". Each count goes in the column its row names. */
function ranked(rows: { value: string; column: string; n: number }[], label: (v: string) => string): Ranked[] {
  const by = new Map<string, Ranked>();
  for (const r of rows) {
    if (!by.has(r.value)) by.set(r.value, { label: label(r.value), n: {} });
    const e = by.get(r.value)!;
    e.n[r.column] = (e.n[r.column] ?? 0) + r.n;
  }
  const all = [...by].sort(([, a], [, b]) => sum(b.n) - sum(a.n));
  const shown = all.filter(([v, e]) => v !== "other" && sum(e.n) >= MIN_COUNT).slice(0, TOP).map(([, e]) => e);
  const rest = all.map(([, e]) => e).filter((e) => !shown.includes(e));
  const other: Ranked = { label: "Other", n: {} };
  for (const e of rest) for (const [k, n] of Object.entries(e.n)) other.n[k] = (other.n[k] ?? 0) + n;
  return rest.length ? [...shown, other] : shown;
}

const country = (code: string) => {
  if (!code || code === "XX") return "Unknown";
  if (code === "T1") return "Tor";
  try {
    return REGIONS.of(code) ?? code;
  } catch {
    return code;
  }
};

const Plot = (props: { chart: Chart | null; label: string }) =>
  props.chart ? (
    <div class="plot stats-plot" role="img" aria-label={props.label} data-chart={JSON.stringify(props.chart)}></div>
  ) : (
    <p class="muted">No data yet.</p>
  );

function RankTable(props: { head: string; columns: [string, string][]; rows: Ranked[] }) {
  if (!props.rows.length) return <p class="muted">No data yet.</p>;
  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>{props.head}</th>{props.columns.map(([, head]) => <th class="num">{head}</th>)}</tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr><td>{r.label}</td>{props.columns.map(([k]) => <td class="num">{fmt(r.n[k] ?? 0)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars(props: { rows: [Child, number][]; class?: string }) {
  if (!props.rows.length) return <p class="muted">No data yet.</p>;
  const max = Math.max(1, ...props.rows.map(([, n]) => n));
  return (
    <ul class={`stats-bars ${props.class ?? ""}`}>
      {props.rows.map(([label, n]) => (
        <li>
          <span class="bar-label">{label}</span>
          <span class="bar-track"><span class="bar" style={`width: ${((100 * n) / max).toFixed(1)}%`}></span></span>
          <span class="bar-n">{fmt(n)}</span>
        </li>
      ))}
    </ul>
  );
}

const percent = (n: number, of: number) => `${Math.round((100 * n) / of)}%`;

export async function statsPage(c: Context<AppEnv>) {
  const db = c.env.DB;
  const published = "status = 'published'";
  const [{ results: daily }, { results: dims }, { results: viewed }, { results: byType }, { results: byElement }, { results: byMonth }] = await db.batch<any>([
    db.prepare("SELECT dimension, surface, value, day, n FROM usage_daily WHERE dimension IN ('total', 'kind', 'resource') ORDER BY day"),
    db.prepare(
      `SELECT dimension, surface, value, SUM(n) AS n FROM usage_daily
       WHERE dimension IN ('client', 'country', 'endpoint', 'format', 'via', 'section', 'referrer', 'kind', 'bot', 'resource')
       GROUP BY dimension, surface, value ORDER BY n DESC`,
    ),
    db.prepare(
      `SELECT s.slug, s.title, SUM(u.n) AS n FROM usage_daily u JOIN spectra s ON s.id = u.value
       WHERE u.dimension = 'spectrum' AND u.surface = 'view' AND s.${published} GROUP BY s.id ORDER BY n DESC LIMIT 10`,
    ),
    db.prepare(`SELECT type, COUNT(*) AS n FROM spectra WHERE ${published} GROUP BY type ORDER BY n DESC`),
    db.prepare(
      `SELECT e.element, COUNT(DISTINCT s.id) AS n FROM spectrum_elements e JOIN spectra s ON s.id = e.spectrum_id
       WHERE s.${published} GROUP BY e.element ORDER BY n DESC, e.element`,
    ),
    db.prepare(`SELECT substr(published_at, 1, 7) AS month, COUNT(*) AS n FROM spectra WHERE ${published} AND published_at IS NOT NULL GROUP BY month ORDER BY month`),
  ]);

  /** Daily rows of one dimension and surface, keyed by value (or by surface for totals). */
  const days = (dimension: string, surface?: string, value?: string): Daily[] =>
    daily
      .filter((r: any) => r.dimension === dimension && (!surface || r.surface === surface) && (value === undefined || r.value === value))
      .map((r: any) => ({ key: r.value || r.surface, day: r.day, n: r.n }));
  const dim = (dimension: string, surface?: string): { value: string; surface: string; n: number }[] =>
    dims.filter((r: any) => r.dimension === dimension && (!surface || r.surface === surface));
  const total = (rows: { n: number }[]) => rows.reduce((s, r) => s + r.n, 0);

  const start: string | undefined = days("total")[0]?.day;
  const apiTotals = Object.keys(APIS).map((s) => [s, total(days("total", s))] as const).filter(([, n]) => n);
  const views = total(days("kind", "view", "browser"));
  const downloads = total(days("total", "download"));
  const requests = total(days("total", "view"));
  const bots = total(dim("kind", "view").filter((r) => ["ai", "ai-user", "search", "bot"].includes(r.value)));
  const botNames = (...kinds: string[]) => byLabel(dim("bot", "view").filter((r) => kinds.includes(BOT_KINDS.get(r.value)!)), String);
  const columns = (rows: { value: string; surface: string; n: number }[], column: (surface: string) => string) => rows.map((r) => ({ ...r, column: column(r.surface) }));
  const clients = ranked(columns(dim("client"), String), (v) => (v === "" ? "No name given" : v));
  const countries = ranked(columns(dim("country"), (s) => (s === "view" || s === "download" ? s : "api")), country);
  const referrers = ranked(columns(dim("referrer", "view"), String), String).map((r): [string, number] => [r.label, sum(r.n)]);
  const spectra = byType.reduce((s: number, r: any) => s + r.n, 0);
  let running = 0;
  const growth: Chart = {
    x: [...byMonth.map((r: any) => seconds(`${r.month}-01`)), Math.floor(Date.now() / 1000)],
    step: true,
    series: [{ label: "Published spectra", colour: "--plot", values: [...byMonth.map((r: any) => (running += r.n)), spectra] }],
  };

  return c.html(
    <Layout user={c.get("user")} title="Statistics" path="/stats/" card="page/stats" head={<link rel="stylesheet" href="/vendor/uPlot.min.css" />}>
      <h1>Statistics</h1>
      <p class="lede">
        {start && `Since ${start}: ${fmt(views)} page views, ${fmt(total(apiTotals.map(([, n]) => ({ n }))))} API requests and ${fmt(downloads)} downloads. `}
        {fmt(spectra)} published spectra.
      </p>
      <p class="stats-about muted">
        {start ? `Counted since ${start}. ` : "Nothing counted yet. "}
        EELSdb counts page loads, requests to the API and downloads of spectrum files. It keeps the day and the country, and for the API and
        downloads the client's name: the first word of its User-Agent, such as <code>exSpy/0.4</code>. It never stores IP addresses, full
        User-Agents, full referrer addresses or cookies. Countries, clients and referring sites with fewer than {MIN_COUNT} requests are shown
        as "Other".
      </p>

      <h2>Website</h2>
      <p class="stats-about muted">
        A page view is a page load by a browser. It is counted without cookies, so page views are not unique visitors. Bots, scripts and
        prefetches are left out; they are under "Bots and crawlers". Cloudflare Web Analytics will add visitor numbers after the domain moves
        to Cloudflare.
      </p>
      <div class="stats-grid">
        <section>
          <h3>Page views per day</h3>
          <Plot chart={chart(days("kind", "view", "browser"), { browser: ["Page views", "--plot"] })} label="Page views per day" />
        </section>
        <section>
          <h3>Most visited sections</h3>
          <Bars class="stats-wide" rows={byLabel(dim("section", "view"), (v) => SECTIONS[v] ?? v)} />
        </section>
        <section>
          <h3>Most viewed spectra</h3>
          <Bars class="stats-wide" rows={viewed.map((r: any) => [<a href={`/spectra/${encodeURIComponent(r.slug)}/`}>{r.title}</a>, r.n])} />
        </section>
        <section>
          <h3>Referring sites</h3>
          <Bars class="stats-wide" rows={referrers} />
        </section>
        <section>
          <h3>Countries</h3>
          <RankTable head="Country" columns={[["view", "Page views"], ["api", "API requests"], ["download", "Downloads"]]} rows={countries} />
        </section>
      </div>

      <details class="stats-more">
        <summary><h2>Bots and crawlers</h2></summary>
        <p class="stats-about muted">
          Each request for a page is sorted by its User-Agent. AI crawlers, AI agents that fetch a page for a user, and search engines come
          from a fixed list of names; other bots say "bot", "crawler" or "spider". Browsers send <code>Sec-Fetch</code> headers when they load
          a page, and the rest are scripts and prefetches. A bot can pretend to be a browser, so some bots count as page views.
        </p>
        {requests > 0 && <p>Bots and crawlers sent {fmt(bots)} of the {fmt(requests)} requests for pages ({percent(bots, requests)}).</p>}
        <div class="stats-grid">
          <section>
            <h3>Requests for pages per day</h3>
            <Plot chart={chart(days("kind", "view"), KINDS, { stack: true })} label="Requests for pages per day, by kind of client" />
          </section>
          <section>
            <h3>AI crawlers and agents</h3>
            <Bars class="stats-wide" rows={botNames("ai", "ai-user")} />
            <h3>Search engines</h3>
            <Bars class="stats-wide" rows={botNames("search")} />
          </section>
        </div>
      </details>

      <h2>For AI agents</h2>
      <p class="stats-about muted">
        AI agents and tools can read EELSdb as plain text: <code>llms.txt</code>, a Markdown version of each page, an agent skill and the
        OpenAPI files. The <a href="/docs/use/agents/">guide for agents</a> explains them.
      </p>
      <div class="stats-grid">
        <section>
          <h3>Requests per day</h3>
          <Plot chart={chart(days("resource", "agent"), RESOURCES, { stack: true })} label="Requests for the files for AI agents per day, by file" />
        </section>
        <section>
          <h3>Who fetches them</h3>
          <Bars class="stats-wide" rows={byLabel(dim("kind", "agent"), labelOf(KINDS))} />
          <h3>AI agents and crawlers</h3>
          <Bars class="stats-wide" rows={byLabel(dim("bot", "agent"), String)} />
        </section>
      </div>

      <h2>API</h2>
      {start && apiTotals.length > 0 && <p>{apiTotals.map(([s, n]) => `${APIS[s][0]}: ${fmt(n)}`).join(" · ")}</p>}
      <div class="stats-grid">
        <section>
          <h3>API requests per day</h3>
          <Plot chart={chart(Object.keys(APIS).flatMap((s) => days("total", s)), APIS)} label="API requests per day, by API" />
        </section>
        <section>
          <h3>Clients</h3>
          <RankTable head="Client" columns={[...apiTotals.map(([s]): [string, string] => [s, APIS[s][0]]), ["download", "Downloads"]]} rows={clients} />
        </section>
        {apiTotals.length ? (
          apiTotals.map(([s]) => (
            <section>
              <h3>{APIS[s][0]} endpoints</h3>
              <Bars class="stats-wide" rows={dim("endpoint", s).map((r) => [<code>{r.value}</code>, r.n])} />
            </section>
          ))
        ) : (
          <section>
            <h3>Endpoints</h3>
            <p class="muted">No data yet.</p>
          </section>
        )}
      </div>

      <h2>Downloads</h2>
      <div class="stats-grid">
        <section>
          <h3>Downloads per day</h3>
          <Plot chart={chart(days("total", "download"), { download: ["Downloads", "--plot"] })} label="Spectrum downloads per day" />
        </section>
        <section>
          <h3>By format</h3>
          <Bars class="stats-wide" rows={byLabel(dim("format", "download"), labelOf(FORMATS))} />
          <h3>From the website or direct</h3>
          <Bars class="stats-wide" rows={byLabel(dim("via", "download"), labelOf(VIA))} />
        </section>
      </div>

      <h2>Spectra</h2>
      <div class="stats-grid">
        <section>
          <h3>By type</h3>
          <Bars rows={byType.map((r: any) => [<a href={`/spectra/?type=${r.type}`}><TypeBadge type={r.type} /></a>, r.n])} />
        </section>
        <section>
          <h3>Published over time</h3>
          <Plot chart={growth} label={`Published spectra over time, ${fmt(spectra)} in total`} />
        </section>
      </div>
      <h3>By element</h3>
      <Bars
        class="stats-elements"
        rows={byElement.map((r: any) => [
          <a href={`/spectra/?element=${r.element}`}>
            <b>{r.element}</b> <span class="muted">{ELEMENT_NAMES[r.element] ?? ""}</span>
          </a>,
          r.n,
        ])}
      />
      <script src="/vendor/uPlot.iife.min.js" defer></script>
      <script type="module" src="/stats.js"></script>
    </Layout>,
  );
}

/** A spectrum's page views and downloads over time: the page behind "Details" on the spectrum page, which loads it into a dialog. */
export async function spectrumUsagePage(c: Context<AppEnv>) {
  const id = await visibleSpectrumId(c, c.req.param("slug")!);
  if (id === null) return c.notFound();
  const db = c.env.DB;
  const [{ results: formats }, { results: views }, { results: ranges }, { results: [s] }] = await db.batch<any>([
    db.prepare(
      `SELECT substr(value, instr(value, ':') + 1) AS key, day, n FROM usage_daily
       WHERE dimension = 'spectrum_format' AND surface = 'download' AND value GLOB ? ORDER BY day`,
    ).bind(`${id}:*`),
    db.prepare("SELECT 'view' AS key, day, n FROM usage_daily WHERE dimension = 'spectrum' AND surface = 'view' AND value = ? ORDER BY day").bind(String(id)),
    db.prepare("SELECT surface, MIN(day) AS since, MAX(day) AS until FROM usage_daily WHERE dimension = 'total' AND surface IN ('view', 'download') GROUP BY surface"),
    db.prepare("SELECT slug, title FROM spectra WHERE id = ?").bind(id),
  ]);
  const range = (surface: string) => ranges.find((r: any) => r.surface === surface) ?? {};
  const [viewed, downloaded] = [range("view"), range("download")];
  const plot = (rows: Daily[], names: Names, { since, until }: any, stack = false) => {
    const week = seconds(until) - seconds(since) > 90 * DAY;
    return { week, chart: chart(rows, names, { stack, week, from: since, to: until }) };
  };
  const total = (rows: Daily[]) => rows.reduce((t, r) => t + r.n, 0);
  const byFormat = plot(formats, FORMATS, downloaded, true);
  const perDay = plot(views, { view: ["Page views", "--plot"] }, viewed);
  const since =
    viewed.since === downloaded.since
      ? `Counted since ${viewed.since}.`
      : [viewed.since && `Page views counted since ${viewed.since}.`, downloaded.since && `Downloads counted since ${downloaded.since}.`].filter(Boolean).join(" ");

  return c.html(
    <Layout user={c.get("user")} title={`Page views and downloads of ${s.title}`} path="/spectra/" head={<link rel="stylesheet" href="/vendor/uPlot.min.css" />}>
      <p class="small back-link"><a href={`/spectra/${encodeURIComponent(s.slug)}/`}>← {s.title}</a></p>
      <h1>Page views and downloads</h1>
      <div id="spectrum-usage">
      <p class="usage-totals"><strong>{fmt(total(views))}</strong> page views · <strong>{fmt(total(formats))}</strong> downloads</p>
      {byFormat.chart && (
        <>
          <h3>Downloads per {byFormat.week ? "week" : "day"}, by format</h3>
          <Plot chart={byFormat.chart} label="Downloads of this spectrum over time, by format" />
        </>
      )}
      {perDay.chart && (
        <>
          <h3>Page views per {perDay.week ? "week" : "day"}</h3>
          <Plot chart={perDay.chart} label="Page views of this spectrum over time" />
        </>
      )}
        <p class="muted small">{since} A page view is a page load by a browser, not a unique visitor.</p>
      </div>
      <script src="/vendor/uPlot.iife.min.js" defer></script>
      <script type="module" src="/stats.js"></script>
    </Layout>,
  );
}
