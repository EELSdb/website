// HyperSpy's peak finder for the spectrum page. As a SharedWorker it serves every open spectrum page, so HyperSpy
// loads once while the viewer moves between spectra; it also runs as a plain Worker.
// In: { id, x, y, level }, where level is slope_thresh as a fraction of the sharpest curvature in y.
// Out: { ready: true } once loaded, then for each request { id, peaks, slope } or { id, error }.

import { HYPERSPY, PYODIDE, RSCIIO } from "./pyreader.js";

const finder = (async () => {
  const { loadPyodide } = await import(`${PYODIDE}pyodide.mjs`);
  const py = await loadPyodide({ indexURL: PYODIDE });
  await py.loadPackage(["numpy", "micropip", "h5py"]);
  await py.pyimport("micropip").install([RSCIIO, HYPERSPY]);
  const find = py.runPython(`
import json, numpy as np, hyperspy.api as hs
from scipy.signal import medfilt
hs.preferences.General.show_progressbar = False
def find_peaks(x, y, level):
    x = np.asarray(x.to_py(), float)
    y = np.nan_to_num(np.asarray(y.to_py(), float))
    # The curvature that slope_thresh is compared with, as find_peaks_ohaver computes it (medfilt_radius=5).
    d = np.gradient(medfilt(y, 5))
    slope = float(level * np.max(d[:-1] - d[1:]))
    s = hs.signals.Signal1D(y, axes=[{"axis": x, "units": "eV"}])
    p = s.find_peaks1D_ohaver(slope_thresh=slope)[0]["position"]
    # The sub-channel Gaussian fit can put a peak at the very edge of the data outside it.
    return json.dumps({"peaks": p[(p >= x[0]) & (p <= x[-1])].tolist(), "slope": slope})
find_peaks`);
  // The first search imports more of HyperSpy and takes about 1.5 s, so do it before reporting ready.
  find(Float64Array.from({ length: 32 }, (_, i) => i), new Float64Array(32), 0.1);
  return find;
})();
const f64 = (a) => Float64Array.from(a, (v) => v ?? NaN);
// A page's MessagePort, or the worker itself when it is a plain Worker.
const serve = (port) => {
  // A failed load is reported to each request instead.
  finder.then(() => port.postMessage({ ready: true }), () => {});
  port.onmessage = async ({ data: { id, x, y, level } }) => {
    try {
      port.postMessage({ id, ...JSON.parse((await finder)(f64(x), f64(y), level)) });
    } catch (e) {
      port.postMessage({ id, error: String(e.message ?? e) });
    }
  };
};
if ("onconnect" in globalThis) onconnect = (e) => serve(e.ports[0]);
else serve(globalThis);
