import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { platform } from "../src/usage";

it("counts API v1 requests by route and client, and never stores the full User-Agent", async () => {
  const write = vi.spyOn(env.API_USAGE, "writeDataPoint");
  const get = (ua: string) => exports.default.fetch("https://api.eelsdb.eu/spectra?per_page=1", { headers: { "User-Agent": ua } });
  await get("exSpy/0.4 (you@example.org)");
  await get("you@example.org");
  expect(write.mock.calls.map(([p]) => p)).toEqual([
    { indexes: ["v1"], blobs: ["v1", "/spectra", "GET", "exSpy/0.4", expect.any(String)], doubles: [200] },
    { indexes: ["v1"], blobs: ["v1", "/spectra", "GET", "", expect.any(String)], doubles: [200] },
  ]);
  write.mockRestore();
});

const get = (path: string, headers: Record<string, string> = {}, method = "GET") => exports.default.fetch(`https://eelsdb.eu${path}`, { method, headers });

it("counts downloads with their format and where they started, but not the site's own previews", async () => {
  await env.FILES.put("wp-content/uploads/2023/10/Y20.txt", "Energy Counts\n100.0 5\n100.5 7\n101.0 6\n");
  await env.FILES.put("wp-content/uploads/usage-test.txt", "no spectrum");
  const write = vi.spyOn(env.API_USAGE, "writeDataPoint");
  await get("/wp-content/uploads/2023/10/Y20.txt", { "User-Agent": "python-requests/2.32" });
  await get("/wp-content/uploads/2023/10/Y20.txt?preview", { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors" });
  await get("/spectra/mlc-nanotube-ylas-tas2/download/json?preview", { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors" });
  await get("/spectra/mlc-nanotube-ylas-tas2/download/csv", { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate" });
  // A script on the site that saves a file is a download too.
  await get("/spectra/mlc-nanotube-ylas-tas2/download/json", { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors" });
  // Safari sends no Sec-Fetch headers on a download, only the Referer.
  await get("/spectra/mlc-nanotube-ylas-tas2/download/msa", { Referer: "https://eelsdb.eu/spectra/mlc-nanotube-ylas-tas2/" });
  await get("/spectra/mlc-nanotube-ylas-tas2/download/msa", { Referer: "https://example.org/eels" });
  await get("/wp-content/uploads/usage-test.txt");
  const point = (route: string, client: string, spectrum: string, format: string, via: string) => ({
    indexes: ["download"],
    blobs: ["download", route, "GET", client, expect.any(String), spectrum, format, via],
    doubles: [200],
  });
  const route = "/spectra/:slug/download/:format{msa|csv|json}";
  expect(write.mock.calls.map(([p]) => p)).toEqual([
    point("/wp-content/uploads/*", "python-requests/2.32", "22236", "legacy", "direct"),
    point(route, "", "22236", "csv", "site"),
    point(route, "", "22236", "json", "site"),
    point(route, "", "22236", "msa", "site"),
    point(route, "", "22236", "msa", "direct"),
    point("/wp-content/uploads/*", "", "", "", "direct"),
  ]);
  write.mockRestore();
  await env.FILES.delete(["wp-content/uploads/2023/10/Y20.txt", "wp-content/uploads/usage-test.txt"]);
});

it("counts public page loads by kind of client, with only the host of another site's referrer", async () => {
  const write = vi.spyOn(env.API_USAGE, "writeDataPoint");
  const browser = { "User-Agent": "Mozilla/5.0 (Macintosh) Firefox/140.0", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" };
  await get("/spectra/mlc-nanotube-ylas-tas2/", { ...browser, Referer: "https://www.google.com/search?q=private+words" });
  await get("/", { ...browser, Referer: "https://eelsdb.eu/stats/" });
  await get("/spectra/mlc-nanotube-ylas-tas2/", { "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" });
  await get("/", { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  await get("/", { "User-Agent": "FancyCrawler/1.0 (you@example.org)" });
  await get("/", { "User-Agent": "curl/8.7.1" });
  await get("/", { ...browser, "Sec-Purpose": "prefetch" });
  // Not counted: the site's own fetches, private pages, errors and HEAD requests.
  await get("/spectra/", { ...browser, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" });
  await get("/login/", browser);
  await get("/spectra/no-such-spectrum/", browser);
  await get("/", browser, "HEAD");
  const point = (route: string, client: string, spectrum: string, referrer: string, kind: string, bot: string, os = "", browser = "") => ({
    indexes: ["view"],
    blobs: ["view", route, "GET", client, expect.any(String), spectrum, "", "", referrer, kind, bot, "", os, browser],
    doubles: [200],
  });
  const calls = write.mock.calls.map(([p]) => p);
  expect(calls).toEqual([
    point("/spectra/:slug/", "Mozilla/5.0", "22236", "www.google.com", "browser", "", "macOS", "Firefox"),
    point("/", "Mozilla/5.0", "", "", "browser", "", "macOS", "Firefox"),
    point("/spectra/:slug/", "Mozilla/5.0", "22236", "", "ai", "GPTBot"),
    point("/", "Mozilla/5.0", "", "", "search", "Googlebot"),
    point("/", "FancyCrawler/1.0", "", "", "bot", ""),
    point("/", "curl/8.7.1", "", "", "other", ""),
    point("/", "Mozilla/5.0", "", "", "other", ""),
  ]);
  expect(JSON.stringify(calls)).not.toMatch(/private|example\.org|openai|Macintosh/);
  write.mockRestore();
});

it("counts requests for the files for AI agents by file and kind of client", async () => {
  const write = vi.spyOn(env.API_USAGE, "writeDataPoint");
  await get("/llms.txt", { "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)" });
  await get("/spectra/mlc-nanotube-ylas-tas2.md", { "User-Agent": "python-httpx/0.28" });
  await get("/api/openapi-v2.json", { "User-Agent": "Mozilla/5.0", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" });
  const etag = (await get("/llms.txt", { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors" })).headers.get("ETag")!;
  await get("/llms.txt", { "User-Agent": "curl/8.7.1", "If-None-Match": etag });
  const point = (route: string, client: string, kind: string, bot: string, resource: string, status = 200) => ({
    indexes: ["agent"],
    blobs: ["agent", route, "GET", client, expect.any(String), "", "", "", "", kind, bot, resource],
    doubles: [status],
  });
  expect(write.mock.calls.map(([p]) => p)).toEqual([
    point("/llms.txt", "Mozilla/5.0", "ai-user", "Claude-User", "llms.txt"),
    point("/spectra/:file{.+\\.md}", "python-httpx/0.28", "other", "", "markdown"),
    point("/api/openapi-v2.json", "Mozilla/5.0", "browser", "", "openapi"),
    point("/llms.txt", "curl/8.7.1", "other", "", "llms.txt", 304),
  ]);
  write.mockRestore();
});

it("keeps only the family of a browser's operating system and browser", () => {
  const cases: [string, string, string][] = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0", "Windows", "Edge"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "macOS", "Chrome"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15", "macOS", "Safari"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", "iOS", "Safari"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1", "iOS", "Chrome"],
    ["Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36", "Android", "Samsung Internet"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0", "Linux", "Firefox"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/124.0.0.0", "Windows", "Opera"],
    ["Mozilla/5.0 (X11; CrOS x86_64 16328.65.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "Other", "Chrome"],
    ["", "Other", "Other"],
  ];
  for (const [ua, os, browser] of cases) expect(platform(ua), ua).toEqual([os, browser]);
});
