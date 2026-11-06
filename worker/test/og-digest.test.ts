import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { DIGEST_SIZES } from "../src/og/digest";

const get = (path: string) => exports.default.fetch(`https://eelsdb.eu${path}`);

describe("digest plots", () => {
  beforeAll(async () => {
    const row = await env.DB.prepare("SELECT r2_key FROM files WHERE spectrum_id = (SELECT id FROM spectra WHERE slug = 'ti-ferrite-spinel') AND role IN ('legacy', 'msa') AND lower(filename) GLOB '*.[mt][sx][at]' LIMIT 1").first<{ r2_key: string }>();
    const rows = Array.from({ length: 200 }, (_, i) => `${424 + i * 0.5} ${100 + Math.round(50 * Math.sin(i / 9)) + (i > 90 ? 80 : 0)}`);
    await env.FILES.put(row!.r2_key, `Energy Counts\n${rows.join("\n")}\n`);
  });

  for (const kind of ["plot", "tile"] as const) {
    it(`draws a transparent ${kind} PNG of the right size`, async () => {
      const res = await get(`/og/digest/${kind}/ti-ferrite-spinel.png`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const bytes = new Uint8Array(await res.arrayBuffer());
      const view = new DataView(bytes.buffer);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([...DIGEST_SIZES[kind]]);
      expect(bytes[25]).toBe(6);
    });
  }

  it("has no image for unknown spectra", async () => {
    for (const kind of ["plot", "tile"]) expect((await get(`/og/digest/${kind}/no-such-spectrum.png`)).status).toBe(404);
  });
});
