import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { rollupUsage } from "../src/usage";

it("renders the statistics page with spectra counts and no usage data yet", async () => {
  const res = await exports.default.fetch("https://eelsdb.eu/stats/");
  const html = await res.text();
  expect(res.status).toBe(200);
  expect(html).toMatch(/[\d,]+ published spectra\./);
  expect(html).toContain("Nothing counted yet.");
  expect(html.match(/No data yet\./g)).toHaveLength(4);
  expect(html.match(/data-chart=/g)).toHaveLength(1);
  expect(html).toContain('<a href="/stats/" aria-current="page">Statistics</a>');
});

it("copies the last 7 days from Analytics Engine into D1, with rare clients and countries as other", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const now = Date.UTC(2026, 10, 4, 3, 17);
  await rollupUsage(env, now);
  expect(fetch).not.toHaveBeenCalled();

  await env.DB.prepare("INSERT INTO usage_daily VALUES ('total', 'v1', '', '2026-10-27', 5), ('client', 'v1', 'old/1.0', '2026-10-28', 99)").run();
  const data = [
    { day: "2026-11-02", surface: "v1", client: "exSpy/0.4", country: "DE", spectrum: "", n: "10" },
    { day: "2026-11-03", surface: "v1", client: "exSpy/0.4", country: "DE", spectrum: "", n: "15" },
    { day: "2026-11-03", surface: "download", client: "exSpy/0.4", country: "DE", spectrum: "22236", n: "2" },
    { day: "2026-11-03", surface: "download", client: "someones-script/1.0", country: "IS", spectrum: "22236", n: "3" },
  ];
  fetch.mockResolvedValue(Response.json({ meta: [], data, rows: data.length }));
  await rollupUsage({ ...env, ANALYTICS_ACCOUNT_ID: "account", ANALYTICS_API_TOKEN: "token" }, now);
  const [url, init] = fetch.mock.calls[0];
  fetch.mockRestore();
  expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/account/analytics_engine/sql");
  expect(init!.headers).toEqual({ Authorization: "Bearer token" });
  expect(init!.body).toMatch(/FROM eelsdb_api\s+WHERE timestamp >= toDateTime\('2026-10-28 00:00:00'\) AND timestamp < toDateTime\('2026-11-04 00:00:00'\)/);

  const { results } = await env.DB.prepare("SELECT dimension, surface, value, day, n FROM usage_daily ORDER BY dimension, surface, value, day").all();
  const row = (dimension: string, surface: string, value: string, day: string, n: number) => ({ dimension, surface, value, day, n });
  expect(results).toEqual([
    row("client", "download", "exSpy/0.4", "2026-11-03", 2),
    row("client", "download", "other", "2026-11-03", 3),
    row("client", "v1", "exSpy/0.4", "2026-11-02", 10),
    row("client", "v1", "exSpy/0.4", "2026-11-03", 15),
    row("country", "download", "DE", "2026-11-03", 2),
    row("country", "download", "other", "2026-11-03", 3),
    row("country", "v1", "DE", "2026-11-02", 10),
    row("country", "v1", "DE", "2026-11-03", 15),
    row("spectrum", "download", "22236", "2026-11-03", 5),
    row("total", "download", "", "2026-11-03", 5),
    row("total", "v1", "", "2026-10-27", 5),
    row("total", "v1", "", "2026-11-02", 10),
    row("total", "v1", "", "2026-11-03", 15),
  ]);

  const page = await (await exports.default.fetch("https://eelsdb.eu/spectra/mlc-nanotube-ylas-tas2/")).text();
  expect(page).toContain("<dt>Downloads</dt><dd>5 since 2026-11-03</dd>");
  await env.DB.prepare("DELETE FROM usage_daily").run();
});
