import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { rollupUsage } from "../src/usage";

it("renders the statistics page with spectra counts and no usage data yet", async () => {
  const res = await exports.default.fetch("https://eelsdb.eu/stats/");
  const html = await res.text();
  expect(res.status).toBe(200);
  expect(html).toMatch(/[\d,]+ published spectra\./);
  expect(html).toContain("Nothing counted yet.");
  expect(html.match(/No data yet\./g)).toHaveLength(17);
  expect(html.match(/data-chart=/g)).toHaveLength(1);
  expect(html).toContain('<details class="stats-more"><summary><h2>Bots and crawlers</h2></summary>');
  expect(html).toContain('<a href="/stats/" aria-current="page">Statistics</a>');
});

it("copies the last 7 days from Analytics Engine into D1, with rare clients, countries and referrers as other", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const now = Date.UTC(2026, 10, 4, 3, 17);
  await rollupUsage(env, now);
  expect(fetch).not.toHaveBeenCalled();

  await env.DB.prepare("INSERT INTO usage_daily VALUES ('total', 'v1', '', '2026-10-27', 5), ('client', 'v1', 'old/1.0', '2026-10-28', 99)").run();
  const blank = { route: "", client: "", country: "", spectrum: "", format: "", via: "", referrer: "", kind: "", bot: "", resource: "" };
  const data = [
    { day: "2026-11-02", surface: "v1", route: "/spectra", client: "exSpy/0.4", country: "DE", n: "10" },
    { day: "2026-11-03", surface: "v1", route: "/spectra/:slug", client: "exSpy/0.4", country: "DE", n: "15" },
    { day: "2026-11-03", surface: "download", route: "/wp-content/uploads/*", client: "exSpy/0.4", country: "DE", spectrum: "22236", format: "legacy", via: "direct", n: "2" },
    // Recorded before format and via were.
    { day: "2026-11-03", surface: "download", client: "someones-script/1.0", country: "IS", spectrum: "22236", n: "3" },
    { day: "2026-11-03", surface: "view", route: "/spectra/:slug/", client: "Mozilla/5.0", country: "DE", spectrum: "22236", referrer: "www.google.com", kind: "browser", n: "30" },
    { day: "2026-11-03", surface: "view", route: "/spectra/:slug/", client: "Mozilla/5.0", country: "IS", spectrum: "22236", referrer: "rare.example", kind: "browser", n: "1" },
    { day: "2026-11-03", surface: "view", route: "/", client: "Mozilla/5.0", country: "US", kind: "ai", bot: "GPTBot", n: "40" },
    { day: "2026-11-03", surface: "agent", route: "/llms.txt", client: "Mozilla/5.0", country: "US", kind: "ai-user", bot: "Claude-User", resource: "llms.txt", n: "4" },
  ].map((r) => ({ ...blank, ...r }));
  fetch.mockResolvedValue(Response.json({ meta: [], data, rows: data.length }));
  await rollupUsage({ ...env, ANALYTICS_ACCOUNT_ID: "account", ANALYTICS_API_TOKEN: "token" }, now);
  const [url, init] = fetch.mock.calls[0];
  fetch.mockRestore();
  expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/account/analytics_engine/sql");
  expect(init!.headers).toEqual({ Authorization: "Bearer token" });
  expect(init!.body).toMatch(/FROM eelsdb_api\s+WHERE timestamp >= toDateTime\('2026-10-28 00:00:00'\) AND timestamp < toDateTime\('2026-11-04 00:00:00'\)/);

  const { results } = await env.DB.prepare("SELECT dimension, surface, value, day, n FROM usage_daily ORDER BY dimension, surface, value, day").all();
  const row = (dimension: string, surface: string, value: string, day: string, n: number) => ({ dimension, surface, value, day, n });
  const d = "2026-11-03";
  expect(results).toEqual([
    row("bot", "agent", "Claude-User", d, 4),
    row("bot", "view", "GPTBot", d, 40),
    row("client", "download", "exSpy/0.4", d, 2),
    row("client", "download", "other", d, 3),
    row("client", "v1", "exSpy/0.4", "2026-11-02", 10),
    row("client", "v1", "exSpy/0.4", d, 15),
    row("country", "download", "DE", d, 2),
    row("country", "download", "other", d, 3),
    row("country", "v1", "DE", "2026-11-02", 10),
    row("country", "v1", "DE", d, 15),
    row("country", "view", "DE", d, 30),
    row("country", "view", "other", d, 1),
    row("endpoint", "v1", "/spectra", "2026-11-02", 10),
    row("endpoint", "v1", "/spectra/:slug", d, 15),
    row("format", "download", "legacy", d, 2),
    row("format", "download", "unknown", d, 3),
    row("kind", "agent", "ai-user", d, 4),
    row("kind", "view", "ai", d, 40),
    row("kind", "view", "browser", d, 31),
    row("referrer", "view", "other", d, 1),
    row("referrer", "view", "www.google.com", d, 30),
    row("resource", "agent", "llms.txt", d, 4),
    row("section", "view", "/spectra/:slug/", d, 31),
    row("spectrum", "download", "22236", d, 5),
    row("spectrum", "view", "22236", d, 31),
    row("spectrum_format", "download", "22236:legacy", d, 2),
    row("spectrum_format", "download", "22236:unknown", d, 3),
    row("total", "agent", "", d, 4),
    row("total", "download", "", d, 5),
    row("total", "v1", "", "2026-10-27", 5),
    row("total", "v1", "", "2026-11-02", 10),
    row("total", "v1", "", d, 15),
    row("total", "view", "", d, 71),
    row("via", "download", "direct", d, 2),
    row("via", "download", "unknown", d, 3),
  ]);

  const spectrum = await (await exports.default.fetch("https://eelsdb.eu/spectra/mlc-nanotube-ylas-tas2/")).text();
  expect(spectrum).toContain(
    '<dt>Page views</dt><dd>31</dd><dt>Downloads</dt><dd>5 · <a href="/spectra/mlc-nanotube-ylas-tas2/usage/" data-open="usage-dialog">Details</a></dd>',
  );
  expect(spectrum).toContain('<dialog id="usage-dialog"');

  const usage = await (await exports.default.fetch("https://eelsdb.eu/spectra/mlc-nanotube-ylas-tas2/usage/")).text();
  expect(usage).toContain("<strong>31</strong> page views · <strong>5</strong> downloads");
  expect(usage).toContain("Counted since 2026-11-03.");
  const [byFormat, perDay] = [...usage.matchAll(/data-chart="([^"]+)"/g)].map((m) => JSON.parse(m[1].replaceAll("&quot;", '"')));
  expect(byFormat).toMatchObject({ stack: true, week: false, series: [{ label: "Not recorded", values: [3] }, { label: "Original file", values: [2] }] });
  expect(perDay).toMatchObject({ series: [{ label: "Page views", values: [31] }] });

  const stats = await (await exports.default.fetch("https://eelsdb.eu/stats/")).text();
  expect(stats).toContain("Since 2026-10-27: 31 page views, 30 API requests and 5 downloads.");
  expect(stats).toContain("Bots and crawlers sent 40 of the 71 requests for pages (56%).");
  expect(stats).toContain("API v1: 30");
  for (const text of ["Spectrum pages", "www.google.com", "GPTBot", "Claude-User", "Original file", "Direct (scripts, links from elsewhere)", "<code>/spectra/:slug</code>"]) {
    expect(stats).toContain(text);
  }
  expect(stats).toContain('<a href="/spectra/mlc-nanotube-ylas-tas2/">');
  expect(stats).not.toContain("rare.example");
  await env.DB.prepare("DELETE FROM usage_daily").run();
});
