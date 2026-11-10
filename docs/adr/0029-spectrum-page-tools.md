---
title: "0029. Spectrum page tools"
description: "The compare, export and processing tools on the spectrum page run in the browser."
adr:
  date: 2026-10-21
---

## Context

Viewers want to check a reference against their own data and make figures. They also want to do the first steps of a HyperSpy analysis without leaving the page.

## Decision

### Layout

Below the plot are two boxes side by side. The left box is "Compare spectra". The right box has two tabs: "Adjust the plot" (first) and "Use in HyperSpy". The tabs are radio buttons styled as tabs, so switching them needs no JS. Both boxes appear when the plot has loaded, because their tools need it.

### Plot

- The page draws the spectrum with uPlot. It shows the exSpy edge onsets for the spectrum's elements as dashed markers. The onsets come from the pinned edge table. The plot shows major edges, and minor edges as an option.
- The y axis title is the sample name with the unit in brackets, for example "Graphite (counts)". When compared spectra share the main axis, the title is the unit only. A compared spectrum's axis has its name and the unit of the main spectrum's data, because the page does not know the units of a viewer's file.
- The legend shows only when spectra are compared. It names the spectra and leaves out fit lines, which share their spectrum's colour.
- A tooltip shows the values at the pointer. It interpolates each spectrum at the pointer's energy, because compared spectra rarely share energies (`uPlot.join` leaves gaps).
- A drag zooms to the box drawn, on both axes. uPlot does not run a scale's range function for a scale that is set directly. The y zoom is therefore held in a variable that the y range function returns, and the zoom sets only x. A change to the processing settings, the colour scheme or "Show" clears the y zoom. A double-click resets both axes.

### Compare

- Viewers can add their own files. They choose a file or drop it on the plot. The page reads MSA and text files in JS, and other formats with the shared Pyodide reader (`pyreader.js`). Files never leave the browser.
- Viewers can also trace a spectrum from a screenshot of a published figure. They paste, drop or choose an image, click two ticks on the energy axis and type their energies, then draw over the curve with a brush 24 screen pixels wide. `digitise.js` looks only under the drawing, so axes, ticks, labels and other curves elsewhere do not matter, and the trace covers only what the viewer drew over:
  - The curve's colour is the commonest ink colour under the brush, weighted towards the middle of the stroke.
  - A pixel belongs to the curve when it lies near the line in RGB from that colour to the background, on the curve's side of halfway. Anti-aliased and JPEG-blurred edges are blends of the two colours and pass; other colours do not.
  - In each column the stroke crosses, the trace takes the run of curve pixels nearest the stroke, at the middle of the run.
  - The trace becomes a compared spectrum, scaled to this spectrum's height over the same energies, because the figure's intensity scale is unknown.
  - The tracer does not calibrate the y axis or handle log axes. Two curves of the same colour under the brush can mix; the pink preview shows the viewer when that happens.
- Viewers can also add other EELSdb spectra. A type-ahead searches `/search/spectra.json?overlaps={slug}`, which returns spectra with an overlapping energy range. It lists spectra that share an edge first, then spectra that share an element. The page draws each one from its `/download/json`.
- The page draws compared spectra only within the energy range of the reference.
- "Independent y axes" gives each compared spectrum its own y scale. Each scale has a right-hand axis in the spectrum's colour (`--compare-1` to `--compare-4`). The checkbox is at the bottom of "Adjust the plot", with help text, and shows only while spectra are compared.
- Each compared scale keeps a linear map to the main scale (value = main × k + b, in log10 on a log axis). Zooming therefore keeps the overlays in place. A change to the processing settings resets the maps.
- A drag on the top half of an axis moves its maximum. A drag on the bottom half moves its minimum. A double-click resets the axis. On hover, the half that a drag moves has a 10% tint in the spectrum's colour.
- The main scale comes first in `scales`, so uPlot knows its range first.
- Each compared spectrum has an energy shift input.

### Export

Viewers can export the current view as PNG or SVG, in light or dark. The page draws a second uPlot off-screen at 1200 × 560 in the chosen theme. uPlot draws only to canvas. The page therefore builds the SVG from the scales and ticks of that uPlot (`_splits`, `_values`, `_size`). These are internal fields of uPlot 1.6. Each export states the processing that the viewer applied.

### View processing

The page does view processing in plain JS (`worker/public/process.js`), not with HyperSpy in Pyodide. [ADR 0003](/docs/adr/0003-small-browser-python-stack/) has the timings.

- Power-law background: the viewer sets the window with a two-thumb slider or types its ends. Dragging one thumb past the other pushes it along, because once the thumbs meet, only the top one can be grabbed. The plot marks the window with a capped, dashed `--edge` line along its bottom, and shades it only while the slider is dragged. The page can show the fit or subtract it. Each compared spectrum gets its own fit, drawn dashed in its colour, over the part of the window its data covers. With fewer than 10 of its channels in the window, it is neither fitted nor subtracted. This tool is for core-loss spectra only.
- The two-area estimate matches exSpy's `remove_background(signal_range=…)`. Like exSpy, it treats EELS counts as binned: A comes from plain sums, and the model is multiplied by the channel width.
- Savitzky–Golay smoothing uses order 2 and a window slider. The window length is also an editable number. It matches scipy's `savgol_filter` with mode "interp", which exSpy uses.
- The viewer can normalise to the maximum or to the area.
- A log scale labels only 1, 2 and 5 of each decade. With "Independent y axes", each compared spectrum keeps its own axis, and that axis is logarithmic too.
- The steps run in this order: background, smoothing, normalisation. Compared spectra get the same steps, each on its own data.
- Normalisation clears "Independent y axes", because normalised spectra share units. If the page cleared it, turning normalisation off sets it again.
- Processing never changes downloads.
- The "Use in HyperSpy" snippet reproduces the view. It loads every plotted spectrum: EELSdb spectra from their HSPY download (`/spectra/{slug}/download/hspy`), which carries their metadata, and the viewer's files by file name, because a page cannot know a file's folder. HyperSpy cannot read TXT, CSV and XDI files, so the code names them in a comment and leaves them out. Each spectrum gets the processing lines (`remove_background(signal_range=(a, b))` with its own window, `smooth_savitzky_golay(...)`, `s / s.data.max()`), then its energy shift as an axis offset. The code ends with `s.plot()` for one spectrum or `hs.plot.plot_spectra([...])` for several, with a log y axis if the plot has one, then `plt.show()`. HyperSpy has no independent y axes, so the overlay shares one axis. For one EELS spectrum, `s.plot(plot_edges=[...], only_edges=...)` marks the edges that the plot shows; `plot_spectra` cannot draw edge markers.
- The code starts with inline script metadata (PEP 723) that lists `hyperspy` and `exspy`, so `uv run` can run it as a file. exSpy provides `EELSSpectrum`: without it, HyperSpy loads EELS files as plain signals and warns.

### Peak labels

- "Label peaks" runs HyperSpy's `find_peaks1D_ohaver` on the main spectrum after processing. Compared spectra get no labels.
- With the default settings, HyperSpy finds 176 peaks in a noisy core-loss spectrum (YAG, Al K and Y L2,3). The "Sensitivity" slider sets `slope_thresh`, which is the minimum curvature of a peak. Its units are those of the data, so the slider gives it as a fraction of the sharpest curvature in the spectrum: 10^(−value/10), from 0.8 down to 0.001. The page computes that curvature in the same way as `find_peaks_ohaver` (the gradient of a 5-point median filter). The default, 0.1, gives 7 peaks on YAG and only π* and σ* (285 and 292 eV) on graphite. `amp_thresh` stays at HyperSpy's default (10% of the maximum). At these slope thresholds, it changed no result in the tests.
- Other thresholds were tried. A height threshold cannot separate the noise on a falling background from the edges. A threshold relative to the noise (the median curvature) failed on spectra with low counts, where the median filter makes the noise curvature zero.
- On low-loss spectra, the zero-loss peak sets the scale, so plasmons need a high sensitivity. `find_peaks_ohaver` also drops all peaks at energies of 0 or below, so it never finds the zero-loss peak.
- This is the one tool that loads HyperSpy in the browser. HyperSpy runs, without exSpy, in its own Pyodide in a SharedWorker (`peaks-worker.js`). `pyreader.js` pins its version with the others. On the page's thread, the import froze clicks for seconds. In the worker, the longest gap on the page's thread during the load was 13 ms.
- The worker starts when the viewer first ticks the box. While it loads, the plot is blurred under a "Loading HyperSpy, please wait…" overlay. The worker runs one search on dummy data before it reports ready, so that the slow first search is not the viewer's. Later searches take about 10 ms, so the labels follow every change to the processing.
- A load with the downloads in the browser cache still takes about 4 s in Chrome: 0.8 s for Pyodide, numpy and h5py, 1.25 s for micropip to resolve and unpack the wheels, 0.3 s for `import hyperspy.api`, and 1.9 s for the first search. Of that search, 1.35 s is `import scipy.signal`, which `find_peaks_ohaver` needs for its median filter, and 0.3 s is the first `map()`. On an empty cache, the first tick took 5 to 7.5 s.
- The worker is shared, so HyperSpy loads once per browsing session, not once per page. A SharedWorker lives while any page of the site is connected to it. In Chrome, this includes pages kept in the back/forward cache, so it survives a same-tab move to the next spectrum. The second spectrum page labelled its peaks 54 ms after the tick. Where the browser has no SharedWorker, the same script runs as a Worker for each page.
- After a viewer ticks the box once, the browser remembers it (`localStorage` key `peaks-used`). Later spectrum pages then connect to the worker as soon as the plot draws. This starts HyperSpy again if no other page has it loaded. The page never ticks the box for the viewer. Viewers who have not used the tool download nothing.
- The compare reader (`pyreader.js`) keeps its own Pyodide on the page's thread. A page that uses both therefore has two copies of Pyodide in memory.
- HyperSpy fits a Gaussian at each peak to place it between channels. Near the ends of the data, the fit can put a peak outside the data, so the page drops these peaks.
- Each label is the energy to 0.1 eV, above a short tick at the peak. The labels are placed tallest peak first. If the space above the peak is taken by another label or an edge label, the label goes to the right of the top of the peak, then to the left. If all three spots are taken, the peak gets no label. Without the side spots, the tallest peak on YAG lost its label to the Al K edge label next to it.
- The "Use in HyperSpy" snippet prints the peak energies of the main spectrum, with the `slope_thresh` value that the page used.

## Alternatives considered

- Tracing a figure from one click on the curve, following its colour outwards column by column. On real figures (JPEG-blurred lines, noise touching axis ticks) the trace jumped onto the axes and stopped at steep edges, and each fix fitted one figure. A drawn stroke tells the tracer where the curve is, and works for any figure.

- **Processing controls in a `<details>` under the plot.** Viewers did not find them.
- **Values at the pointer in the legend.** uPlot shows "--" while the pointer is off the plot, which looks broken. The tooltip shows values only on hover.
- **Zoom on energy only, with y fitted to the visible data.** The selection was a full-height band, but the y range then changed, so the zoom did not match the selection. A mode in which a flat drag zoomed only the energy was also tried. With independent axes it gave scaling that viewers could not predict.
- **Fit a compared spectrum only when its data covers the whole window.** The default window starts at the reference's first channel, so compared spectra almost never got a fit. Fitting over the covered part of the window, with at least 10 channels, keeps the fit where it makes sense.

## Consequences

- `worker/test/process.test.ts` checks the JS against exSpy output that `python/record_process.py` records. The tolerance is 1e-9 relative.
- For X-ray absorption spectra, HyperSpy integrates differently because the data is not binned. The snippet line for area normalisation would therefore give a slightly different result.
- uPlot sets scales on its first commit. A read of the scales in the same tick as a rebuild returns `null`. Check for `null` before you reuse them.
- These tools are not built:
  - Edge-jump normalisation. It needs a second window.
  - Derivatives.
  - Deconvolution. It needs a matching low-loss spectrum, and most entries do not have one.
