import type { Context } from "hono";
import { routePath } from "hono/route";
import type { AppEnv } from "./auth";

/** Clients, countries and referring sites with fewer requests than this in a period are shown as "other": a rare one can point to one person. */
export const MIN_COUNT = 20;
const DAY = 86_400_000;

export type Kind = "browser" | "ai" | "ai-user" | "search" | "bot" | "other";

/** Named crawlers and AI agents, found by name in the full User-Agent, first match wins. Only the name and the kind are stored. */
export const BOTS: [string, Kind][] = [
  ["ChatGPT-User", "ai-user"],
  ["Claude-User", "ai-user"],
  ["Perplexity-User", "ai-user"],
  ["MistralAI-User", "ai-user"],
  ["Meta-ExternalFetcher", "ai-user"],
  ["GPTBot", "ai"],
  ["OAI-SearchBot", "ai"],
  ["ClaudeBot", "ai"],
  ["Claude-SearchBot", "ai"],
  ["anthropic-ai", "ai"],
  ["PerplexityBot", "ai"],
  ["CCBot", "ai"],
  ["Google-Extended", "ai"],
  ["Bytespider", "ai"],
  ["Amazonbot", "ai"],
  ["Applebot-Extended", "ai"],
  ["meta-externalagent", "ai"],
  ["cohere-ai", "ai"],
  ["Googlebot", "search"],
  ["bingbot", "search"],
  ["DuckDuckBot", "search"],
  ["YandexBot", "search"],
  ["Baiduspider", "search"],
  ["Applebot", "search"],
];

const SYSTEMS: [RegExp, string][] = [[/Windows/, "Windows"], [/iPhone|iPad|iPod/, "iOS"], [/Android/, "Android"], [/Macintosh|Mac OS X/, "macOS"], [/Linux/, "Linux"]];
// Order matters: Edge, Opera and Samsung Internet also say "Chrome", and Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
];

/** The operating system and browser of a browser's User-Agent, by family only: no versions or devices. */
export function platform(ua: string): [string, string] {
  const first = (list: [RegExp, string][]) => list.find(([re]) => re.test(ua))?.[1] ?? "Other";
  return [first(SYSTEMS), first(BROWSERS)];
}

/** One Analytics Engine data point for this request. Never changes the response. */
export function recordUsage(c: Context<AppEnv>, surface: string, status: number, extra: string[] = []) {
  try {
    // Only a leading product token such as "exSpy/0.4": full User-Agents can hold an email address.
    const client = c.req.header("User-Agent")?.match(/^[\w.-]+(\/[\w.+-]+)?(?=[\s;(]|$)/)?.[0].slice(0, 64) ?? "";
    const country = (c.req.raw.cf as IncomingRequestCfProperties | undefined)?.country ?? "";
    c.env.API_USAGE?.writeDataPoint({ indexes: [surface], blobs: [surface, routePath(c), c.req.method, client, country, ...extra], doubles: [status] });
  } catch {}
}

/**
 * A download of a spectrum's file, or of a file with no spectrum (`spectrumId` undefined). `format` is the
 * converted format or the file's role, empty when unknown. The site's own fetches add `?preview` and do not count.
 */
export function recordDownload(c: Context<AppEnv>, spectrumId: number | undefined, format: string) {
  if (c.req.query("preview") !== undefined) return;
  // Safari sends no Sec-Fetch headers when it downloads a link, only the Referer.
  const site = c.req.header("Sec-Fetch-Site") === "same-origin" || c.req.header("Referer")?.startsWith(`${new URL(c.req.url).origin}/`);
  recordUsage(c, "download", 200, [spectrumId === undefined ? "" : String(spectrumId), format, site ? "site" : "direct"]);
}

/** Who sent a request: a bot from BOTS (with its name), another bot, a browser loading a page, or anything else. */
export function requestKind(c: Context<AppEnv>): [Kind, string] {
  const ua = (c.req.header("User-Agent") ?? "").toLowerCase();
  const named = BOTS.find(([name]) => ua.includes(name.toLowerCase()));
  if (named) return [named[1], named[0]];
  // ponytail: a word match, so a bot that hides its name counts as a browser or "other".
  if (/bot|crawl|spider|scrap|slurp|headless/.test(ua)) return ["bot", ""];
  const browser = c.req.header("Sec-Fetch-Mode") === "navigate" && c.req.header("Sec-Fetch-Dest") === "document" && !c.req.header("Sec-Purpose");
  return [browser ? "browser" : "other", ""];
}

/** The AI-facing files of ADR 0028. Uploaded files are downloads, whatever their name. */
function agentResource(path: string) {
  if (/^\/(files|wp-content|submissions)\//.test(path)) return;
  if (/^\/(docs\/)?llms(-full|-small)?\.txt$/.test(path)) return "llms.txt";
  if (path.startsWith("/docs/skills/")) return "skill";
  if (path.endsWith(".md")) return "markdown";
  if (/^\/api\/openapi-v\d\.json$/.test(path)) return "openapi";
}

const PRIVATE = /^\/(account|admin|login|auth|submit-data)\/|^\/instruments\/new\/|\/edit\/$/;

/** The other site's host, never the full address: that can hold search terms or private paths. Empty for this site or none. */
function referrerHost(c: Context<AppEnv>) {
  try {
    const ref = new URL(c.req.header("Referer")!);
    return ref.origin === new URL(c.req.url).origin ? "" : ref.host.slice(0, 100);
  } catch {
    return "";
  }
}

/**
 * A public HTML page (surface `view`) or an AI-facing file (surface `agent`) on the main host, by every kind of
 * client. Runs after the handler, which sets `spectrumId` on a spectrum page.
 */
export function recordPage(c: Context<AppEnv>) {
  const status = c.res.status;
  // 304: a browser showing its cached copy, which is still a page load. Docs pages revalidate on every visit.
  if (c.req.method !== "GET" || (status !== 304 && (status < 200 || status > 299))) return;
  // The site's own scripts and link prefetches.
  if (c.req.header("Sec-Fetch-Site") === "same-origin" && c.req.header("Sec-Fetch-Mode") !== "navigate") return;
  const resource = agentResource(c.req.path);
  const [kind, bot] = requestKind(c);
  if (resource) return recordUsage(c, "agent", status, ["", "", "", "", kind, bot, resource]);
  if (PRIVATE.test(c.req.path) || !c.res.headers.get("Content-Type")?.startsWith("text/html")) return;
  const [os, browser] = kind === "browser" ? platform(c.req.header("User-Agent") ?? "") : ["", ""];
  recordUsage(c, "view", status, [String(c.get("spectrumId") ?? ""), "", "", referrerHost(c), kind, bot, "", os, browser]);
}

type Row = {
  day: string;
  surface: string;
  route: string;
  client: string;
  country: string;
  spectrum: string;
  format: string;
  via: string;
  referrer: string;
  kind: string;
  bot: string;
  resource: string;
  os: string;
  browser: string;
  n: number | string;
};

/** Replaces the last 7 complete days (UTC) in usage_daily with the counts from Analytics Engine, so a missed run leaves no gap. */
export async function rollupUsage(env: Env, now: number) {
  if (!env.ANALYTICS_ACCOUNT_ID || !env.ANALYTICS_API_TOKEN) return;
  const day = (offset: number) => new Date(now - (now % DAY) - offset * DAY).toISOString().slice(0, 10);
  const [start, end] = [day(7), day(0)];
  const sql = `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, blob1 AS surface, blob2 AS route, blob4 AS client, blob5 AS country,
    blob6 AS spectrum, blob7 AS format, blob8 AS via, blob9 AS referrer, blob10 AS kind, blob11 AS bot, blob12 AS resource,
    blob13 AS os, blob14 AS browser,
    SUM(_sample_interval) AS n FROM ${env.API_USAGE_DATASET}
    WHERE timestamp >= toDateTime('${start} 00:00:00') AND timestamp < toDateTime('${end} 00:00:00')
    GROUP BY day, surface, route, client, country, spectrum, format, via, referrer, kind, bot, resource, os, browser FORMAT JSON`;
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ANALYTICS_ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.ANALYTICS_API_TOKEN}` },
    body: sql,
  });
  if (!res.ok) throw new Error(`Analytics Engine SQL API: ${res.status} ${await res.text()}`);
  const { data } = await res.json<{ data: Row[] }>();

  // Page views by bots and scripts get no client, country, referrer or section rows.
  const pages = (r: Row) => r.surface === "view" || r.surface === "agent";
  const browserViews = data.filter((r) => r.surface === "view" && r.kind === "browser");
  const requests = data.filter((r) => !pages(r));
  const named = (key: "client" | "country" | "referrer", rows: Row[]) => {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r[key], (totals.get(r[key]) ?? 0) + Number(r.n));
    return (v: string) => (totals.get(v)! >= MIN_COUNT ? v : "other");
  };
  const [client, country, referrer] = [named("client", requests), named("country", [...requests, ...browserViews]), named("referrer", browserViews)];
  const rows = new Map<string, number>();
  const add = (n: number, ...key: string[]) => rows.set(key.join("\t"), (rows.get(key.join("\t")) ?? 0) + n);
  for (const r of data) {
    const n = Number(r.n);
    add(n, "total", r.surface, "", r.day);
    if (pages(r)) {
      add(n, "kind", r.surface, r.kind, r.day);
      if (r.bot) add(n, "bot", r.surface, r.bot, r.day);
      if (r.surface === "agent") add(n, "resource", r.surface, r.resource, r.day);
      if (r.surface === "agent" || r.kind !== "browser") continue;
      add(n, "section", r.surface, r.route, r.day);
      add(n, "country", r.surface, country(r.country), r.day);
      add(n, "os", r.surface, r.os || "unknown", r.day);
      add(n, "browser", r.surface, r.browser || "unknown", r.day);
      if (r.referrer) add(n, "referrer", r.surface, referrer(r.referrer), r.day);
      if (r.spectrum) add(n, "spectrum", r.surface, r.spectrum, r.day);
      continue;
    }
    add(n, "client", r.surface, client(r.client), r.day);
    add(n, "country", r.surface, country(r.country), r.day);
    if (r.surface !== "download") {
      add(n, "endpoint", r.surface, r.route, r.day);
      continue;
    }
    const format = r.format || "unknown";
    add(n, "format", r.surface, format, r.day);
    add(n, "via", r.surface, r.via || "unknown", r.day);
    if (r.spectrum) {
      add(n, "spectrum", r.surface, r.spectrum, r.day);
      add(n, "spectrum_format", r.surface, `${r.spectrum}:${format}`, r.day);
    }
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM usage_daily WHERE day >= ? AND day < ?").bind(start, end),
    env.DB.prepare(
      "INSERT INTO usage_daily (dimension, surface, value, day, n) SELECT value ->> 0, value ->> 1, value ->> 2, value ->> 3, value ->> 4 FROM json_each(?)",
    ).bind(JSON.stringify([...rows].map(([k, n]) => [...k.split("\t"), n]))),
  ]);
}
