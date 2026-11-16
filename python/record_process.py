"""Record exSpy's background removal, smoothing and Fourier-ratio deconvolution on synthetic spectra into data/fixtures/process.json.

worker/public/process.js reimplements these for the spectrum page; worker/test/process.test.ts checks it against this file.

    uv run python record_process.py
"""

import json
from pathlib import Path

import exspy
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "data" / "fixtures" / "process.json"

x = np.arange(400.0, 700.0, 1.5)
rng = np.random.default_rng(1)
y = 3e9 * x**-3.2 + 40 * (x > 532) * (x / 532) ** -2 + rng.normal(0, 2, x.size)

s = exspy.signals.EELSSpectrum(y)
s.axes_manager[0].offset = x[0]
s.axes_manager[0].scale = x[1] - x[0]

window = (412.0, 520.0)
smooth = dict(window_length=11, polynomial_order=2)
sg = s.deepcopy()
sg.smooth_savitzky_golay(**smooth)

r = lambda a: [float(f"{v:.10g}") for v in a]

# Fourier-ratio: a low-loss spectrum (zero-loss peak and plasmons, t/λ = 0.6) and a background-subtracted carbon K
# edge with the same plural scattering, on the same 0.25 eV channels.
step = 0.25
llx = np.arange(-6.0, 110.0, step)
gauss = lambda x, c, w: np.exp(-0.5 * ((x - c) / (w / 2.3548)) ** 2)
plasmon = lambda x: (x > 3) * x * 1.0 / ((x**2 - 22.0**2) ** 2 + (x * 6.0) ** 2)
p1 = plasmon(llx)
p1 /= p1.sum()
t = 0.6
lly = 2e5 * (gauss(llx, 0, 1.1) / gauss(llx, 0, 1.1).sum() + t * p1 + t**2 / 2 * np.convolve(p1, p1)[: llx.size] * 0)
lly = lly + rng.normal(0, 3, llx.size) + 0.05
clx = np.arange(270.0, 420.0, step)
single = 900 * (clx > 284) * (clx / 284) ** -3 + 600 * gauss(clx, 286, 1.2) + 300 * gauss(clx, 292, 4)
kernel = np.interp(np.arange(0, 110, step), llx, p1, left=0)
cly = np.exp(-t) * (single + t * np.convolve(single, kernel)[: clx.size]) + rng.normal(0, 4, clx.size) + 20 * (clx / 270) ** -3


def eels(x, y):
    sig = exspy.signals.EELSSpectrum(y.copy())
    sig.axes_manager[0].offset = x[0]
    sig.axes_manager[0].scale = step
    return sig


ll, cl = eels(llx, lly), eels(clx, cly)
threshold = float(ll.estimate_elastic_scattering_threshold().data[0])
fwhm = float(ll.power_law_extrapolation(window_size=100, extrapolation_size=100).estimate_peak_width().data[0])
frd = cl.fourier_ratio_deconvolution(ll)
frd_fwhm = cl.fourier_ratio_deconvolution(ll, fwhm=0.5, threshold=3.0)
OUT.write_text(
    json.dumps(
        {
            "x": r(x),
            "y": r(y),
            "background_window": window,
            "remove_background": r(s.remove_background(signal_range=window).data),
            "smooth": smooth,
            "smooth_savitzky_golay": r(sg.data),
            "frd": {
                # Full precision: deconvolution amplifies rounding in its inputs.
                "lowloss_x": llx.tolist(),
                "lowloss_y": lly.tolist(),
                "coreloss_x": clx.tolist(),
                "coreloss_y": cly.tolist(),
                "threshold": threshold,
                "fwhm": fwhm,
                "deconvolved": r(frd.data),
                "deconvolved_fwhm_0.5_threshold_3": r(frd_fwhm.data),
            },
        }
    )
    + "\n"
)
print(f"wrote {OUT}")
