import type { Context } from "hono";
import { routePath } from "hono/route";
import type { AppEnv } from "./auth";

/** Clients and countries with fewer requests than this in a period are shown as "other": a rare one can point to one person. */
export const MIN_COUNT = 20;
const DAY = 86_400_000;

/** One Analytics Engine data point for this request. Never changes the response. */
export function recordUsage(c: Context<AppEnv>, surface: string, status: number, extra: string[] = []) {
  try {
    // Only a leading product token such as "exSpy/0.4": full User-Agents can hold an email address.
    const client = c.req.header("User-Agent")?.match(/^[\w.-]+(\/[\w.+-]+)?(?=[\s;(]|$)/)?.[0].slice(0, 64) ?? "";
    const country = (c.req.raw.cf as IncomingRequestCfProperties | undefined)?.country ?? "";
    c.env.API_USAGE?.writeDataPoint({ indexes: [surface], blobs: [surface, routePath(c), c.req.method, client, country, ...extra], doubles: [status] });
  } catch {}
}

/** A download of a spectrum's file, or of a file with no spectrum (`spectrumId` undefined). */
export function recordDownload(c: Context<AppEnv>, spectrumId: number | undefined) {
  // The site's own pages fetch files to plot them; those are not downloads.
  if (c.req.header("Sec-Fetch-Site") === "same-origin" && c.req.header("Sec-Fetch-Mode") !== "navigate") return;
  recordUsage(c, "download", 200, [spectrumId === undefined ? "" : String(spectrumId)]);
}

type Row = { day: string; surface: string; client: string; country: string; spectrum: string; n: number | string };

/** Replaces the last 7 complete days (UTC) in usage_daily with the counts from Analytics Engine, so a missed run leaves no gap. */
export async function rollupUsage(env: Env, now: number) {
  if (!env.ANALYTICS_ACCOUNT_ID || !env.ANALYTICS_API_TOKEN) return;
  const day = (offset: number) => new Date(now - (now % DAY) - offset * DAY).toISOString().slice(0, 10);
  const [start, end] = [day(7), day(0)];
  const sql = `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS day, blob1 AS surface, blob4 AS client, blob5 AS country, blob6 AS spectrum,
    SUM(_sample_interval) AS n FROM ${env.API_USAGE_DATASET}
    WHERE timestamp >= toDateTime('${start} 00:00:00') AND timestamp < toDateTime('${end} 00:00:00')
    GROUP BY day, surface, client, country, spectrum FORMAT JSON`;
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ANALYTICS_ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.ANALYTICS_API_TOKEN}` },
    body: sql,
  });
  if (!res.ok) throw new Error(`Analytics Engine SQL API: ${res.status} ${await res.text()}`);
  const { data } = await res.json<{ data: Row[] }>();

  const named = (key: "client" | "country") => {
    const totals = new Map<string, number>();
    for (const r of data) totals.set(r[key], (totals.get(r[key]) ?? 0) + Number(r.n));
    return (v: string) => (totals.get(v)! >= MIN_COUNT ? v : "other");
  };
  const [client, country] = [named("client"), named("country")];
  const rows = new Map<string, number>();
  const add = (n: number, ...key: string[]) => rows.set(key.join("\t"), (rows.get(key.join("\t")) ?? 0) + n);
  for (const r of data) {
    const n = Number(r.n);
    add(n, "total", r.surface, "", r.day);
    add(n, "client", r.surface, client(r.client), r.day);
    add(n, "country", r.surface, country(r.country), r.day);
    if (r.surface === "download" && r.spectrum) add(n, "spectrum", r.surface, r.spectrum, r.day);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM usage_daily WHERE day >= ? AND day < ?").bind(start, end),
    env.DB.prepare(
      "INSERT INTO usage_daily (dimension, surface, value, day, n) SELECT value ->> 0, value ->> 1, value ->> 2, value ->> 3, value ->> 4 FROM json_each(?)",
    ).bind(JSON.stringify([...rows].map(([k, n]) => [...k.split("\t"), n]))),
  ]);
}
