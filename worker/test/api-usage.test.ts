import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";

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

it("counts spectrum downloads by spectrum id, but not the site's own requests for plots", async () => {
  await env.FILES.put("wp-content/uploads/2023/10/Y20.txt", "Energy Counts\n100.0 5\n100.5 7\n101.0 6\n");
  await env.FILES.put("wp-content/uploads/usage-test.txt", "no spectrum");
  const write = vi.spyOn(env.API_USAGE, "writeDataPoint");
  const get = (path: string, headers: Record<string, string> = {}) => exports.default.fetch(`https://eelsdb.eu${path}`, { headers });
  await get("/wp-content/uploads/2023/10/Y20.txt", { "User-Agent": "python-requests/2.32" });
  await get("/wp-content/uploads/2023/10/Y20.txt", { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors" });
  await get("/spectra/mlc-nanotube-ylas-tas2/download/csv", { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate" });
  await get("/wp-content/uploads/usage-test.txt");
  const point = (route: string, client: string, spectrum: string) => ({
    indexes: ["download"],
    blobs: ["download", route, "GET", client, expect.any(String), spectrum],
    doubles: [200],
  });
  expect(write.mock.calls.map(([p]) => p)).toEqual([
    point("/wp-content/uploads/*", "python-requests/2.32", "22236"),
    point("/spectra/:slug/download/:format{msa|csv|json}", "", "22236"),
    point("/wp-content/uploads/*", "", ""),
  ]);
  write.mockRestore();
  await env.FILES.delete(["wp-content/uploads/2023/10/Y20.txt", "wp-content/uploads/usage-test.txt"]);
});
