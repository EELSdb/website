import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { AppEnv } from "../auth";
import NAMES from "../element-names.json";
import { MIN_COUNT } from "../usage";
import { Layout, TypeBadge } from "./layout";

const ELEMENT_NAMES: Record<string, string> = NAMES;
const SURFACES = [
  ["v1", "API v1", "--plot"],
  ["v2", "API v2", "--compare-2"],
  ["oai", "OAI-PMH", "--compare-1"],
  ["dcat", "DCAT", "--compare-3"],
] as const;
const TOP = 15;
const DAY = 86_400;
const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });
const fmt = (n: number) => n.toLocaleString("en");
const seconds = (date: string) => Date.parse(date) / 1000;

type Chart = { x: number[]; step?: boolean; series: { label: string; colour: string; values: number[] }[] };

/** One point per day from the first day with data to the last; a day with no row had no requests. */
function daily(rows: { surface: string; day: string; n: number }[], series: readonly (readonly string[])[]): Chart | null {
  if (!rows.length) return null;
  const first = seconds(rows[0].day);
  const x = Array.from({ length: (seconds(rows.at(-1)!.day) - first) / DAY + 1 }, (_, i) => first + i * DAY);
  return {
    x,
    series: series.map(([surface, label, colour]) => {
      const values = x.map(() => 0);
      for (const r of rows) if (r.surface === surface) values[(seconds(r.day) - first) / DAY] = r.n;
      return { label, colour, values };
    }),
  };
}

type Ranked = { label: string; api: number; downloads: number };

/** The most frequent values, with the rest, and any below MIN_COUNT, as "Other". */
function ranked(rows: { value: string; download: number; n: number }[], label: (v: string) => string): Ranked[] {
  const by = new Map<string, Ranked>();
  for (const r of rows) {
    if (!by.has(r.value)) by.set(r.value, { label: label(r.value), api: 0, downloads: 0 });
    by.get(r.value)![r.download ? "downloads" : "api"] += r.n;
  }
  const all = [...by].sort(([, a], [, b]) => b.api + b.downloads - (a.api + a.downloads));
  const shown = all.filter(([v, e]) => v !== "other" && e.api + e.downloads >= MIN_COUNT).slice(0, TOP).map(([, e]) => e);
  const rest = all.map(([, e]) => e).filter((e) => !shown.includes(e));
  const other = { label: "Other", api: rest.reduce((s, e) => s + e.api, 0), downloads: rest.reduce((s, e) => s + e.downloads, 0) };
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

function RankTable(props: { head: string; rows: Ranked[] }) {
  if (!props.rows.length) return <p class="muted">No data yet.</p>;
  return (
    <table>
      <thead>
        <tr><th>{props.head}</th><th class="num">API requests</th><th class="num">Downloads</th></tr>
      </thead>
      <tbody>
        {props.rows.map((r) => (
          <tr><td>{r.label}</td><td class="num">{fmt(r.api)}</td><td class="num">{fmt(r.downloads)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Bars(props: { rows: [Child, number][]; class?: string }) {
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

export async function statsPage(c: Context<AppEnv>) {
  const db = c.env.DB;
  const published = "status = 'published'";
  const [{ results: totals }, { results: dims }, { results: byType }, { results: byElement }, { results: byMonth }] = await db.batch<any>([
    db.prepare("SELECT surface, day, n FROM usage_daily WHERE dimension = 'total' ORDER BY day"),
    db.prepare(
      `SELECT dimension, value, surface = 'download' AS download, SUM(n) AS n FROM usage_daily
       WHERE dimension IN ('client', 'country') GROUP BY dimension, value, download`,
    ),
    db.prepare(`SELECT type, COUNT(*) AS n FROM spectra WHERE ${published} GROUP BY type ORDER BY n DESC`),
    db.prepare(
      `SELECT e.element, COUNT(DISTINCT s.id) AS n FROM spectrum_elements e JOIN spectra s ON s.id = e.spectrum_id
       WHERE s.${published} GROUP BY e.element ORDER BY n DESC, e.element`,
    ),
    db.prepare(`SELECT substr(published_at, 1, 7) AS month, COUNT(*) AS n FROM spectra WHERE ${published} AND published_at IS NOT NULL GROUP BY month ORDER BY month`),
  ]);

  const start: string | undefined = totals[0]?.day;
  const sum = (download: boolean) => totals.reduce((s: number, r: any) => s + ((r.surface === "download") === download ? r.n : 0), 0);
  const api = daily(totals.filter((r: any) => r.surface !== "download"), SURFACES);
  const downloads = daily(totals.filter((r: any) => r.surface === "download"), [["download", "Downloads", "--plot"]]);
  const clients = ranked(dims.filter((r: any) => r.dimension === "client"), (v) => (v === "" ? "No name given" : v));
  const countries = ranked(dims.filter((r: any) => r.dimension === "country"), country);
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
        {fmt(spectra)} published spectra.
        {start && ` Since ${start}: ${fmt(sum(false))} API requests and ${fmt(sum(true))} downloads.`}
      </p>

      <h2>Usage</h2>
      <p class="stats-about muted">
        {start ? `Counted since ${start}: ` : "Nothing counted yet. EELSdb counts "}
        every request to the API (v1, v2, OAI-PMH and DCAT) and every download of a spectrum file. For each, it keeps the day, the
        country and the client's name, which is the first word of its User-Agent, such as <code>exSpy/0.4</code>. It never stores IP
        addresses, full User-Agents or cookies. Clients and countries with fewer than {MIN_COUNT} requests are shown as "Other".
      </p>
      <div class="stats-grid">
        <section>
          <h3>API requests per day</h3>
          <Plot chart={api} label="API requests per day, by API" />
        </section>
        <section>
          <h3>Downloads per day</h3>
          <Plot chart={downloads} label="Spectrum downloads per day" />
        </section>
        <section>
          <h3>Clients</h3>
          <RankTable head="Client" rows={clients} />
        </section>
        <section>
          <h3>Countries</h3>
          <RankTable head="Country" rows={countries} />
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
