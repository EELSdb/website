import { describe, expect, it } from "vitest";
// @ts-expect-error plain browser module, no types
import { highlightPython, hyperspyCode } from "../public/snippet.js";

describe("HyperSpy snippet", () => {
  it("loads one spectrum in a script uv can run, with the plot's edge markers", () => {
    const one = [{ name: "A", url: "https://eelsdb.eu/a.msa", file: "a.msa", signalType: "EELS" }];
    expect(hyperspyCode(one)).toBe(
      '# /// script\n# dependencies = ["hyperspy", "exspy"]\n# ///\nimport matplotlib.pyplot as plt\nimport hyperspy.api as hs\nfrom urllib.request import urlretrieve\n\nurl = "https://eelsdb.eu/a.msa"\npath, _ = urlretrieve(url, "a.msa")\ns = hs.load(path, signal_type="EELS")\ns.plot()\nplt.show()',
    );
    expect(hyperspyCode(one, { edges: { elements: ["Fe", "O"], minor: false }, log: true })).toContain(
      's.plot(plot_edges=["Fe", "O"], only_edges=("Major",), norm="log")\nplt.show()',
    );
    expect(hyperspyCode(one, { edges: { elements: ["Fe"], minor: true } })).toContain('s.plot(plot_edges=["Fe"])');
    expect(hyperspyCode(one, { peaks: 76.4512 })).toContain('s = hs.load(path, signal_type="EELS")\nprint("Peaks (eV):", s.find_peaks1D_ohaver(slope_thresh=76.45)[0]["position"].round(1))\ns.plot()');
  });

  it("loads, processes and overlays compared spectra", () => {
    const code = hyperspyCode(
      [
        { name: "A", url: "https://eelsdb.eu/a.hspy", file: "spectrum.hspy", window: [685.2, 706] },
        { name: "B", url: "https://eelsdb.eu/spectra/b/download/msa", file: "b.msa", signalType: "EELS", window: [698, 706], shift: 1.5 },
        { name: "mine.csv", file: "mine.csv" },
        { name: "mine.dm4", file: "mine.dm4" },
      ],
      { smooth: 11, normalise: "max", log: true },
    );
    expect(code).toContain("s = s.remove_background(signal_range=(685.2, 706.0))");
    expect(code).toContain("s2 = s2.remove_background(signal_range=(698.0, 706.0))\ns2.smooth_savitzky_golay(window_length=11, polynomial_order=2)\ns2 = s2 / s2.data.max()\ns2.axes_manager[-1].offset += 1.5");
    expect(code).toContain("# mine.csv: HyperSpy cannot read this format, so it is left out.");
    expect(code).toContain('s4 = hs.load("mine.dm4")  # your file');
    expect(code).toContain('ax = hs.plot.plot_spectra([s, s2, s4], legend=["A", "B", "mine.dm4"])\nax.set_yscale("log")');
  });

  it("highlights like the docs", () => {
    const html = highlightPython('s = hs.load(path, signal_type="EELS")  # note');
    expect(html).toBe(
      's <span class="t-k">=</span> hs.<span class="t-f">load</span>(<span class="t-v">path</span><span class="t-p">,</span> <span class="t-a">signal_type</span><span class="t-k">=</span><span class="t-p">"</span><span class="t-s">EELS</span><span class="t-p">"</span>)  <span class="t-c"># note</span>',
    );
  });
});
