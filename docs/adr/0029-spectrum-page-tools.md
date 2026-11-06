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

## Alternatives considered

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
