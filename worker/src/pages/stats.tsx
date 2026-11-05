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
const APIS: Names = { v1: ["API v1", "--series-1"], v2: ["API v2", "--series-2"], oai: ["OAI-PMH", "--series-3"], dcat: ["DCAT", "--series-4"] };
const KINDS: Names = {
  browser: ["Browsers", "--series-1"],
  ai: ["AI crawlers", "--series-2"],
  search: ["Search engine crawlers", "--series-3"],
  bot: ["Other bots", "--series-4"],
  "ai-user": ["AI agents for a user", "--series-5"],
  other: ["Scripts and prefetches", "--muted"],
};
/** Requests for pages by everything but browsers, stacked on the page views by operating system. */
const BOT_SERIES: Names = {
  ai: ["AI crawlers and agents", "--bot-1"],
  "ai-user": ["AI crawlers and agents", "--bot-1"],
  search: ["Search engine crawlers", "--bot-2"],
  bot: ["Other bots and scripts", "--bot-3"],
  other: ["Other bots and scripts", "--bot-3"],
};
const RESOURCES: Names = { "llms.txt": ["llms.txt", "--series-1"], markdown: ["Markdown pages", "--series-2"], skill: ["Agent skill", "--series-3"], openapi: ["OpenAPI files", "--series-4"] };
const FORMATS: Names = {
  msa: ["MSA", "--series-1"],
  csv: ["CSV", "--series-2"],
  json: ["JSON", "--series-3"],
  hspy: ["HyperSpy", "--series-4"],
  original: ["Original file", "--series-5"],
  // The original file of a spectrum from the old site.
  legacy: ["Original file", "--series-5"],
  variant: ["Processed version", "--series-6"],
  lowloss: ["Low-loss file", "--series-6"],
  companion: ["Companion file", "--series-6"],
  metadata: ["File metadata", "--series-6"],
  unknown: ["Not recorded", "--muted"],
};
const SYSTEMS: Names = {
  Windows: ["Windows", "--series-1"],
  macOS: ["macOS", "--series-2"],
  Linux: ["Linux", "--series-3"],
  iOS: ["iOS", "--series-4"],
  Android: ["Android", "--series-5"],
  // Not grey: grey is for bot traffic in the same chart.
  Other: ["Other", "--series-6"],
  unknown: ["Not recorded", "--line"],
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

type Chart = { x: number[]; step?: boolean; week?: boolean; stack?: boolean; series: { label: string; colour: string; values: number[]; extra?: boolean }[] };
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
    const [label, colour] = names[r.key] ?? [r.key, "--muted"];
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

/** The flag emoji: the two letters of the code as regional indicator symbols. */
const flag = (code: string) => String.fromCodePoint(...[...code].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

const country = (code: string) => {
  if (!code || code === "XX") return "Unknown";
  if (code === "T1") return "Tor";
  try {
    const name = REGIONS.of(code) ?? code;
    return /^[A-Z]{2}$/.test(code) ? `${flag(code)}\u00a0${name}` : name;
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

/** With `bars`, each number has a bar, scaled to the largest number in its column. */
function RankTable(props: { head: string; columns: [string, string][]; rows: Ranked[]; bars?: boolean }) {
  if (!props.rows.length) return <p class="muted">No data yet.</p>;
  const max = (k: string) => Math.max(1, ...props.rows.map((r) => r.n[k] ?? 0));
  const cell = (k: string, n = 0) =>
    props.bars ? (
      <span class="cell-bar"><span class="bar" style={`width: ${((100 * n) / max(k)).toFixed(1)}%`}></span><span>{fmt(n)}</span></span>
    ) : (
      fmt(n)
    );
  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>{props.head}</th>{props.columns.map(([, head]) => <th class="num">{head}</th>)}</tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr><td>{r.label}</td>{props.columns.map(([k]) => <td class="num">{cell(k, r.n[k])}</td>)}</tr>
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

const SECTION_IDS = [
  ["website", "Website"],
  ["agents", "For AI agents"],
  ["api", "API"],
  ["downloads", "Downloads"],
  ["countries", "Countries"],
  ["spectra", "Spectra"],
  ["counting", "How we count"],
] as const;
const H2 = (props: { id: (typeof SECTION_IDS)[number][0] }) => <h2 id={props.id}>{SECTION_IDS.find(([id]) => id === props.id)![1]}</h2>;

export async function statsPage(c: Context<AppEnv>) {
  const db = c.env.DB;
  const published = "status = 'published'";
  const mostUsed = (surface: string) =>
    db.prepare(
      `SELECT s.slug, s.title, SUM(u.n) AS n FROM usage_daily u JOIN spectra s ON s.id = u.value
       WHERE u.dimension = 'spectrum' AND u.surface = ? AND s.${published} GROUP BY s.id ORDER BY n DESC LIMIT 10`,
    ).bind(surface);
  const [{ results: daily }, { results: dims }, { results: viewed }, { results: downloaded }, { results: byType }, { results: byElement }, { results: byMonth }] =
    await db.batch<any>([
      db.prepare("SELECT dimension, surface, value, day, n FROM usage_daily WHERE dimension IN ('total', 'kind', 'resource', 'os', 'format') ORDER BY day"),
      db.prepare(
        `SELECT dimension, surface, value, SUM(n) AS n FROM usage_daily
         WHERE dimension IN ('client', 'country', 'endpoint', 'via', 'section', 'referrer', 'kind', 'bot', 'browser')
         GROUP BY dimension, surface, value ORDER BY n DESC`,
      ),
      mostUsed("view"),
      mostUsed("download"),
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
  const apiDays = days("total").filter((r) => r.key in APIS);
  const views = total(days("kind", "view", "browser"));
  const requests = total(days("total", "view"));
  const range = { stack: true, from: days("total", "view")[0]?.day, to: days("total", "view").at(-1)?.day };
  const byOs = chart(days("os", "view"), SYSTEMS, range);
  const byBot = chart(days("kind", "view").filter((r) => r.key !== "browser"), BOT_SERIES, range);
  const visitors = byOs && { ...byOs, series: [...byOs.series, ...(byBot?.series ?? []).map((s) => ({ ...s, extra: true }))] };
  const botNames = (...kinds: string[]) => byLabel(dim("bot", "view").filter((r) => kinds.includes(BOT_KINDS.get(r.value)!)), String);
  const columns = (rows: { value: string; surface: string; n: number }[], column: (surface: string) => string) => rows.map((r) => ({ ...r, column: column(r.surface) }));
  const usedApis = Object.keys(APIS).filter((s) => apiDays.some((r) => r.key === s));
  const clients = ranked(columns(dim("client"), String), (v) => (v === "" ? "No name given" : v));
  const countries = ranked(columns(dim("country"), (s) => (s === "view" || s === "download" ? s : "api")), country);
  const referrers = ranked(columns(dim("referrer", "view"), String), String).map((r): [string, number] => [r.label, sum(r.n)]);
  const endpoints = dim("endpoint").filter((r) => r.surface in APIS);
  const spectra = byType.reduce((s: number, r: any) => s + r.n, 0);
  const spectrumBars = (rows: any[]) => rows.map((r): [Child, number] => [<a href={`/spectra/${encodeURIComponent(r.slug)}/`}>{r.title}</a>, r.n]);
  let running = 0;
  const growth: Chart = {
    x: [...byMonth.map((r: any) => seconds(`${r.month}-01`)), Math.floor(Date.now() / 1000)],
    step: true,
    series: [{ label: "Published spectra", colour: "--plot", values: [...byMonth.map((r: any) => (running += r.n)), spectra] }],
  };
  const tiles: [string, number][] = [
    ["Page views", views],
    ["API requests", total(apiDays)],
    ["Downloads", total(days("total", "download"))],
    ["Published spectra", spectra],
  ];

  return c.html(
    <Layout user={c.get("user")} title="Statistics" path="/stats/" card="page/stats" head={<link rel="stylesheet" href="/vendor/uPlot.min.css" />}>
      <h1>Statistics</h1>
      <p class="lede">
        {start ? <>How EELSdb is used, counted since <time>{start}</time> without cookies or IP addresses. </> : "Nothing counted yet. "}
        <a href="#counting">How we count</a>.
      </p>
      <div class="stats-layout">
        <nav class="stats-toc" aria-label="On this page">
          <p>On this page</p>
          <ul>
            {SECTION_IDS.map(([id, title]) => <li><a href={`#${id}`}>{title}</a></li>)}
          </ul>
        </nav>
        <div class="stats-main">
          <dl class="stats-tiles">
            {tiles.map(([label, n]) => <div><dt>{label}</dt><dd>{fmt(n)}</dd></div>)}
          </dl>

          <H2 id="website" />
          <p class="stats-about muted">Page loads by a browser. Without cookies, page views are not unique visitors.</p>
          <div class="stats-chart-head">
            <h3 data-extra-title="Requests for pages per day, by operating system or kind of bot">Page views per day, by operating system</h3>
            {requests > views && (
              <label class="stats-toggle">
                <input type="checkbox" data-extra /> Show bot traffic ({percent(requests - views, requests)} of requests for pages)
              </label>
            )}
          </div>
          <Plot chart={visitors} label="Page views per day, by operating system, with requests for pages by bots and scripts on request" />
          <div class="stats-grid">
            <section>
              <h3>Browsers</h3>
              <Bars class="stats-wide" rows={byLabel(dim("browser", "view"), labelOf(SYSTEMS))} />
            </section>
            <section>
              <h3>Most visited sections</h3>
              <Bars class="stats-wide" rows={byLabel(dim("section", "view"), (v) => SECTIONS[v] ?? v)} />
            </section>
            <section>
              <h3>Most viewed spectra</h3>
              <Bars class="stats-wide" rows={spectrumBars(viewed)} />
            </section>
            <section>
              <h3>Referring sites</h3>
              <Bars class="stats-wide" rows={referrers} />
            </section>
            <section>
              <h3>AI crawlers and agents</h3>
              <Bars class="stats-wide" rows={botNames("ai", "ai-user")} />
            </section>
            <section>
              <h3>Search engine crawlers</h3>
              <Bars class="stats-wide" rows={botNames("search")} />
            </section>
          </div>

          <H2 id="agents" />
          <p class="stats-about muted">
            AI agents and tools can read EELSdb as plain text: <code>llms.txt</code>, a Markdown version of each page, an agent skill and the OpenAPI
            files. The <a href="/docs/use/agents/">guide for agents</a> explains them.
          </p>
          <h3>Requests per day, by file</h3>
          <Plot chart={chart(days("resource", "agent"), RESOURCES, { stack: true })} label="Requests for the files for AI agents per day, by file" />
          <div class="stats-grid">
            <section>
              <h3>Who fetches them</h3>
              <Bars class="stats-wide" rows={byLabel(dim("kind", "agent"), labelOf(KINDS))} />
            </section>
            <section>
              <h3>AI agents and crawlers</h3>
              <Bars class="stats-wide" rows={byLabel(dim("bot", "agent"), String)} />
            </section>
          </div>

          <H2 id="api" />
          <p class="stats-about muted">
            Requests from scripts and tools to the <a href="/docs/use/api/">API</a>, and from harvesters to OAI-PMH and DCAT.
          </p>
          <h3>Requests per day</h3>
          <Plot chart={chart(apiDays, APIS)} label="API requests per day, by API" />
          <div class="stats-grid">
            <section>
              <h3>Endpoints</h3>
              {endpoints.length ? (
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Endpoint</th><th>API</th><th class="num">Requests</th></tr>
                    </thead>
                    <tbody>
                      {endpoints.map((r) => (
                        <tr><td><code>{r.value}</code></td><td>{APIS[r.surface][0]}</td><td class="num">{fmt(r.n)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p class="muted">No data yet.</p>
              )}
            </section>
            <section>
              <h3>Clients</h3>
              <RankTable head="Client" columns={[...usedApis.map((s): [string, string] => [s, APIS[s][0]]), ["download", "Downloads"]]} rows={clients} />
            </section>
          </div>

          <H2 id="downloads" />
          <p class="stats-about muted">Spectrum files, fetched from the website, by scripts or from links on other sites.</p>
          <h3>Downloads per day, by format</h3>
          <Plot chart={chart(days("format", "download"), FORMATS, { stack: true })} label="Spectrum downloads per day, by format" />
          <div class="stats-grid">
            <section>
              <h3>Most downloaded spectra</h3>
              <Bars class="stats-wide" rows={spectrumBars(downloaded)} />
            </section>
            <section>
              <h3>From the website or direct</h3>
              <Bars class="stats-wide" rows={byLabel(dim("via", "download"), labelOf(VIA))} />
            </section>
          </div>

          <H2 id="countries" />
          <p class="stats-about muted">Page views, API requests and downloads by country.</p>
          <RankTable head="Country" columns={[["view", "Page views"], ["api", "API requests"], ["download", "Downloads"]]} rows={countries} bars />

          <H2 id="spectra" />
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

          <H2 id="counting" />
          <dl class="stats-notes">
            <dt>Page views</dt>
            <dd>
              A page view is a page load by a browser, including a browser that shows its saved copy of the page. Cloudflare Web Analytics will
              add visitor numbers after the domain moves to Cloudflare.
            </dd>
            <dt>Bots and crawlers</dt>
            <dd>
              Each request for a page is sorted by its User-Agent. AI crawlers, AI agents that fetch a page for a user, and search engines come
              from a fixed list of names. Other bots say "bot", "crawler" or "spider". Browsers send <code>Sec-Fetch</code> headers when they load
              a page, and the rest are scripts and prefetches. A bot can pretend to be a browser, so some bots count as page views.
            </dd>
            <dt>Downloads</dt>
            <dd>A download is a fetch of a spectrum file. When the website shows a file on the spectrum page, that fetch does not count.</dd>
            <dt>What is kept</dt>
            <dd>
              The day and the country of each request. For browsers, the family of the operating system and of the browser, such as "macOS" and
              "Firefox". For the API and downloads, the client's name: the first word of its User-Agent, such as <code>exSpy/0.4</code>. EELSdb
              never stores IP addresses, full User-Agents, full referrer addresses or cookies. Countries, clients and referring sites with fewer
              than {MIN_COUNT} requests are shown as "Other".
            </dd>
            <dt>When</dt>
            <dd>Counts are per day (UTC) and appear on this page the next morning.</dd>
          </dl>
        </div>
      </div>
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
