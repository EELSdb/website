import { describe, expect, it } from "vitest";
import cases from "../../data/fixtures/quant.json";
import table from "../public/eels_binding_energies.json";
// @ts-expect-error plain browser module, no types
import { effectiveAngle, hydrogenic, quantify, windowCrossSection } from "../public/quantify.js";

const near = (got: number, want: number, tol: number) => expect(Math.abs(got - want) / Math.abs(want)).toBeLessThan(tol);

describe("hydrogenic cross-sections match exSpy", () => {
  for (const c of cases) {
    it(`${c.subshell} at ${c.E0} kV, α ${c.alpha}, β ${c.beta} mrad`, () => {
      const angle = effectiveAngle(c.E0, c.onset, c.alpha, c.beta);
      near(angle, c.effective_angle, 1e-12);
      const shell = c.subshell.split("_")[1];
      const gos = hydrogenic(c.Z, shell, shell === "K" ? { K: c.onset } : { L3: c.onset, L1: c.onset_L1 }, c.E0, angle);
      gos.energy.forEach((e: number, i: number) => near(e, c.energy_axis[i], 1e-9));
      gos.qint.forEach((q: number, i: number) => near(q, c.qint[i], 1e-7));
      for (const [delta, sigma] of Object.entries(c.sigma)) near(windowCrossSection(gos, Number(delta)), sigma as number, 1e-6);
    });
  }
});

describe("quick quantification", () => {
  // Boron and nitrogen K edges built from the same cross-sections, one atom of each, on a power-law background.
  const acq = { E0: 200, alpha: 10, beta: 20 };
  const x = Array.from({ length: 1300 }, (_, i) => 150 + i * 0.25);
  const shape = (el: string, Z: number) => {
    const onset = (table as any).elements[el].K["onset_energy (eV)"];
    const gos = hydrogenic(Z, "K", { K: onset }, acq.E0, effectiveAngle(acq.E0, onset, acq.alpha, acq.beta));
    return x.map((e) => {
      if (e < onset) return 0;
      const i = gos.energy.findIndex((v: number) => v > e);
      return gos.qint[i - 1] + ((gos.qint[i] - gos.qint[i - 1]) * (e - gos.energy[i - 1])) / (gos.energy[i] - gos.energy[i - 1]);
    });
  };
  const b = shape("B", 5);
  const n = shape("N", 7);
  const y = x.map((e, i) => 4e12 * e ** -3.5 + 0.25 * (b[i] + n[i]));

  it("recovers the ratio of a spectrum built from the cross-sections", () => {
    const q = quantify(x, y, ["B_K", "N_K"], (table as any).elements, acq);
    expect(q.error).toBeUndefined();
    expect(q.delta).toBe(50);
    expect(q.elements.map((e: any) => e.element)).toEqual(["B", "N"]);
    q.elements.forEach((e: any) => expect(e.fraction).toBeCloseTo(0.5, 2));
  });

  it("says why it cannot quantify", () => {
    expect(quantify(x, y, ["B_K"], (table as any).elements, acq).error).toMatch(/two elements/);
    expect(quantify(x, y, ["B_K", "N_K"], (table as any).elements, { E0: 200, beta: null }).error).toMatch(/collection angle/);
    const q = quantify(x, y, ["B_K", "N_K", "Fe_M2,3"], (table as any).elements, acq);
    expect(q.skipped).toContainEqual({ edge: "Fe M2,3", reason: "no hydrogenic cross-section (only K and L2,3 edges)" });
  });
});
