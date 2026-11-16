import { describe, expect, it } from "vitest";
import fixture from "../../data/fixtures/process.json";
// @ts-expect-error plain browser module, no types
import { elasticThreshold, fourierRatio, nextFastLen, powerLaw, processSpectrum, resample, savitzkyGolay } from "../public/process.js";

const close = (got: number[], want: number[]) => {
  expect(got).toHaveLength(want.length);
  const scale = Math.max(...want.map(Math.abs));
  got.forEach((v, i) => expect(Math.abs(v - want[i]) / scale).toBeLessThan(1e-9));
};

describe("spectrum processing matches exSpy", () => {
  it("removes a power-law background like remove_background", () => {
    const [lo, hi] = fixture.background_window;
    const bg = powerLaw(fixture.x, fixture.y, lo, hi)!;
    close(fixture.y.map((v, i) => v - bg[i]), fixture.remove_background);
    close(processSpectrum(fixture.x, fixture.y, { background: "subtract", window: [lo, hi], smooth: 0, normalise: "" }).y, fixture.remove_background);
  });

  it("smooths like smooth_savitzky_golay", () => {
    close(savitzkyGolay(fixture.y, fixture.smooth.window_length, fixture.smooth.polynomial_order), fixture.smooth_savitzky_golay);
  });

  it("gives no background when the energies cannot be fitted", () => {
    expect(powerLaw([-2, -1, 0, 1, 2], [1, 2, 3, 2, 1], -2, 2)).toBeNull();
    expect(powerLaw([1, 2, 3], [3, 2, 1], 3, 3)).toBeNull();
  });

  it("normalises the processed spectrum and its fit together", () => {
    const { y, fit } = processSpectrum(fixture.x, fixture.y, { background: "fit", window: fixture.background_window, smooth: 0, normalise: "max" });
    expect(Math.max(...y)).toBe(1);
    expect(fit![0]).toBeCloseTo(powerLaw(fixture.x, fixture.y, ...(fixture.background_window as [number, number]))![0] / Math.max(...fixture.y));
  });
});

describe("Fourier-ratio deconvolution matches exSpy", () => {
  const f = fixture.frd;
  it("pads to scipy's fast FFT lengths", () => {
    expect([97, 1001, 1153, 4097].map(nextFastLen)).toEqual([98, 1008, 1155, 4116]);
  });

  it("finds the end of the zero-loss peak like estimate_elastic_scattering_threshold", () => {
    expect(elasticThreshold(f.lowloss_x, f.lowloss_y)).toBe(f.threshold);
  });

  it("deconvolves like fourier_ratio_deconvolution with a given width and threshold", () => {
    const out = fourierRatio(f.coreloss_x, f.coreloss_y, f.lowloss_x, f.lowloss_y, { fwhm: 0.5, threshold: 3 });
    close(out.y, f["deconvolved_fwhm_0.5_threshold_3"]);
  });

  it("deconvolves like fourier_ratio_deconvolution with its defaults", () => {
    // HyperSpy measures the zero-loss width with a spline through every channel, the page with a cubic through four.
    const out = fourierRatio(f.coreloss_x, f.coreloss_y, f.lowloss_x, f.lowloss_y);
    expect(out.fwhm).toBeCloseTo(f.fwhm, 2);
    const scale = Math.max(...f.deconvolved);
    out.y.forEach((v: number, i: number) => expect(Math.abs(v - f.deconvolved[i]) / scale).toBeLessThan(0.01));
  });

  it("resamples a low-loss spectrum onto another channel width", () => {
    const r = resample([0, 1, 2, 3], [0, 2, 4, 6], 0.5);
    expect(r.x).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(r.y).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
