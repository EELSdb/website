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
