// Spectrum page: plot the data file with uPlot and mark exSpy edge onsets for the spectrum's elements.

import { processSpectrum } from "/process.js";
import { toSpectrum, traceStrokes } from "/digitise.js";
import { highlightPython, hyperspyCode } from "/snippet.js";

for (const button of document.querySelectorAll("[data-open]")) {
  button.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById(button.dataset.open).showModal();
  });
}
for (const radio of document.querySelectorAll("[name=download-format]")) {
  radio.addEventListener("change", () => {
    const link = document.getElementById("download-link");
    link.href = radio.value;
    link.download = radio.dataset.name;
    link.querySelector(".dl-name").textContent = `Download ${radio.dataset.name}`;
  });
}
// The usage dialog shows the spectrum's usage page, fetched when it first opens.
const usageLink = document.querySelector("[data-open=usage-dialog]");
usageLink?.addEventListener("click", async () => {
  const body = document.getElementById("usage-body");
  if (body.dataset.loaded) return;
  body.dataset.loaded = "1";
  try {
    const res = await fetch(usageLink.href);
    if (!res.ok) throw new Error(res.statusText);
    body.replaceChildren(new DOMParser().parseFromString(await res.text(), "text/html").getElementById("spectrum-usage"));
    await import("/stats.js");
  } catch {
    body.innerHTML = '<p class="muted">The numbers could not be loaded.</p>';
    delete body.dataset.loaded;
  }
});
// A click on the backdrop lands on the dialog itself, outside its box.
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
  });
}
for (const button of document.querySelectorAll("dialog [data-close]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}
// data-copy names the element whose text to copy; data-copy-text gives the text itself.
for (const button of document.querySelectorAll("[data-copy], [data-copy-text]")) {
  const label = button.querySelector(".copy-label");
  button.addEventListener("click", async () => {
    const target = button.dataset.copy && document.getElementById(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(button.dataset.copyText ?? target.textContent);
      button.classList.add("copied");
      label.textContent = label.dataset.done ?? "Copied";
      setTimeout(() => {
        button.classList.remove("copied");
        label.textContent = label.dataset.idle ?? "Copy";
      }, 1600);
    } catch {
      if (target) getSelection().selectAllChildren(target);
    }
  });
}

/** Parse MSA (XY or Y) or two-column text into [energies, intensities]. */
function parseSpectrum(text) {
  const header = {};
  const x = [];
  const y = [];
  let inData = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = line.match(/^#([A-Z0-9 -]+?)\s*:\s*(.*)$/i);
      if (m) header[m[1].trim().toUpperCase()] = m[2].trim();
      if (/^#SPECTRUM/i.test(line)) inData = true;
      if (/^#ENDOFDATA/i.test(line)) break;
      continue;
    }
    if (!/^[-+.\d]/.test(line)) continue;
    const nums = line.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (nums.some(Number.isNaN)) continue;
    if (inData && (header.DATATYPE || "").toUpperCase() === "Y") {
      y.push(...nums);
    } else if (nums.length >= 2) {
      x.push(nums[0]);
      y.push(nums[1]);
    }
  }
  if (!x.length) {
    const offset = parseFloat(header.OFFSET) || 0;
    const step = parseFloat(header.XPERCHAN) || 1;
    for (let i = 0; i < y.length; i++) x.push(offset + step * i);
  }
  // uPlot needs increasing x.
  const order = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  return [order.map((i) => x[i]), order.map((i) => y[i])];
}

/** A colour token resolved for canvas drawing (tokens use light-dark(), which only the cascade resolves). */
const probe = document.createElement("span");
probe.hidden = true;
document.body.append(probe);
const css = (name) => {
  probe.style.color = `var(${name})`;
  return getComputedStyle(probe).color;
};

// "?preview" keeps the site's own fetches out of the download counts.
async function load(src) {
  const res = await fetch(`${src}?preview`);
  if (!res.ok) throw new Error(res.statusText);
  const data = parseSpectrum(await res.text());
  if (data[0].length < 2) throw new Error("no data");
  return data;
}

async function main() {
  const el = document.getElementById("plot");
  if (!el || !el.dataset.src) return;
  const versions = JSON.parse(el.dataset.versions || "[]");
  // Colours for drawing; an image export swaps in the chosen theme's while it draws.
  let paint = css;
  let yLabel = versions[0]?.axis ?? (el.dataset.type === "xrayabs" ? "Intensity" : "Counts");
  const title = document.querySelector("h1")?.textContent ?? "";
  const unit = () => (normalise?.value ? "Normalised intensity" : yLabel);
  const withUnit = (name, u) => `${name} (${u[0].toLowerCase()}${u.slice(1)})`;
  const seriesName = () => withUnit(title, unit());
  // Compared spectra are raw files, not the processed versions "Show" can switch to.
  const baseLabel = yLabel;
  const compareName = (c) => withUnit(c.name, normalise?.value ? "Normalised intensity" : baseLabel);
  // The y axis names the spectrum unless compared spectra share it.
  const axisName = () => (compares.length && !separate() ? unit() : seriesName());
  let data;
  try {
    await document.fonts.ready;
    data = await load(el.dataset.src);
  } catch (e) {
    el.innerHTML = '<p class="plot-message">The data file could not be read for plotting. You can still download it.</p>';
    return;
  }

  const elements = JSON.parse(el.dataset.elements || "[]");
  let table = {};
  try {
    table = (await (await fetch("/eels_binding_energies.json")).json()).elements;
  } catch {}
  const [xmin, xmax] = [data[0][0], data[0][data[0].length - 1]];
  const edges = [];
  for (const symbol of elements) {
    for (const [shell, info] of Object.entries(table[symbol] || {})) {
      const e = info["onset_energy (eV)"];
      if (e >= xmin && e <= xmax) edges.push({ label: `${symbol} ${shell}`, energy: e, major: info.relevance === "Major" });
    }
  }

  const showEdges = document.getElementById("show-edges");
  const showMinor = document.getElementById("show-minor");
  edges.sort((a, b) => a.energy - b.energy);

  const bgMode = document.getElementById("bg-mode");
  const bgFrom = document.getElementById("bg-from");
  const bgTo = document.getElementById("bg-to");
  const smooth = document.getElementById("smooth");
  const normalise = document.getElementById("normalise");
  const logY = document.getElementById("log-y");
  const peaksBox = document.getElementById("find-peaks");
  const peakLevel = document.getElementById("peak-level");
  const peaksStatus = document.getElementById("peaks-status");
  const procStatus = document.getElementById("process-status");
  const PROC_NOTE = procStatus?.textContent;
  const snippet = document.getElementById("snippet-code");
  if (bgFrom) {
    // From the start of the data to just before the first major edge, where the pre-edge background usually is.
    const span = xmax - xmin;
    const first = edges.find((e) => e.major)?.energy;
    const to = first && first - 0.02 * span > xmin + 0.05 * span ? first - 0.02 * span : xmin + 0.15 * span;
    // min and max first: a range input clamps its value to them.
    for (const r of [bgFrom, bgTo]) [r.min, r.max] = [Math.floor(xmin * 10) / 10, Math.ceil(xmax * 10) / 10];
    bgFrom.defaultValue = +xmin.toFixed(1);
    bgTo.defaultValue = +to.toFixed(1);
    // Push the other thumb rather than stop: once they meet, only the top one can be grabbed.
    bgFrom.addEventListener("input", () => { if (+bgFrom.value > +bgTo.value) bgTo.value = bgFrom.value; });
    bgTo.addEventListener("input", () => { if (+bgTo.value < +bgFrom.value) bgFrom.value = bgTo.value; });
  }
  const bgText = [document.getElementById("bg-from-text"), document.getElementById("bg-to-text")];
  const smoothText = document.getElementById("smooth-text");
  // Size each plain-text number field to its text, measured in the same font. Only works while it is shown.
  const sizer = Object.assign(document.createElement("span"), { style: "position: absolute; visibility: hidden; white-space: pre" });
  const fitWidth = (t) => {
    t.after(sizer);
    sizer.textContent = t.value || t.placeholder;
    t.style.width = `${sizer.offsetWidth + 1}px`;
    sizer.remove();
  };
  const showValues = () => {
    if (bgFrom) {
      const frac = (r) => (r.value - r.min) / (r.max - r.min);
      bgFrom.parentElement.style.setProperty("--a", frac(bgFrom));
      bgFrom.parentElement.style.setProperty("--b", frac(bgTo));
      [bgFrom, bgTo].forEach((r, i) => {
        bgText[i].value = (+r.value).toFixed(1);
        fitWidth(bgText[i]);
      });
    }
    if (smoothText) {
      smoothText.value = +smooth.value ? 2 * +smooth.value + 1 : "";
      fitWidth(smoothText);
    }
  };
  const log = () => !!logY?.checked;
  const settings = () => ({
    background: bgMode?.value ?? "",
    window: [+bgFrom?.value, +bgTo?.value],
    smooth: +smooth?.value ? 2 * +smooth.value + 1 : 0,
    normalise: normalise?.value ?? "",
  });
  const describe = () => {
    const o = settings();
    const parts = [];
    if (o.background === "subtract") parts.push(`power-law background subtracted (fit ${o.window[0]}–${o.window[1]} eV)`);
    if (o.smooth) parts.push(`Savitzky–Golay smoothed (${o.smooth} points)`);
    if (o.normalise) parts.push(`normalised to ${o.normalise === "max" ? "maximum" : "area"}`);
    return parts.length ? `Processed: ${parts.join(", ")}` : "";
  };
  // "Use in HyperSpy": code that loads every plotted spectrum and gives the same processing as the plot.
  const writeSnippet = (o, main, procs) => {
    const d = snippet.dataset;
    const sub = o.background === "subtract";
    const spectra = [
      { name: title, url: d.url, file: d.file, signalType: d.signalType, window: sub && main.fit ? o.window : null },
      ...compares.map((c, j) => ({
        name: c.name,
        ...(c.slug
          ? { url: `${new URL(d.url).origin}/spectra/${c.slug}/download/hspy`, file: `${c.slug}.hspy` }
          : { file: c.name }),
        window: sub && procs[j].fit ? procs[j].window : null,
        shift: +c.shift || 0,
      })),
    ];
    const edges = el.dataset.type !== "xrayabs" && showEdges.checked ? { elements, minor: showMinor.checked } : null;
    snippet.innerHTML = highlightPython(hyperspyCode(spectra, { smooth: o.smooth, normalise: o.normalise, log: log(), edges, peaks: peaksBox?.checked ? peakSlope : null }));
  };
  let snippetArgs;
  const family = getComputedStyle(document.body).fontFamily;
  // "Ti L2,3" draws as "Ti L" plus a subscript "2,3", like the typeset edge names elsewhere.
  const drawLabel = (ctx, label, x, y, dpr, alignRight) => {
    const [, main, sub] = label.match(/^(.* [A-Z])(.*)$/) || [, label, ""];
    const mainFont = `600 ${12 * dpr}px ${family}`;
    const subFont = `600 ${9 * dpr}px ${family}`;
    ctx.font = mainFont;
    const w1 = ctx.measureText(main).width;
    ctx.font = subFont;
    const w2 = ctx.measureText(sub).width;
    const x0 = alignRight ? x - w1 - w2 : x;
    ctx.font = mainFont;
    ctx.fillText(main, x0, y);
    ctx.font = subFont;
    ctx.fillText(sub, x0 + w1, y + 5 * dpr);
    return w1 + w2;
  };
  // Label boxes drawn in this frame, in canvas pixels, so peak labels can keep clear of them.
  let taken = [];
  const edgePlugin = {
    hooks: {
      draw: (u) => {
        taken = [];
        if (!showEdges.checked) return;
        const ctx = u.ctx;
        const dpr = devicePixelRatio || 1;
        const right = u.bbox.left + u.bbox.width;
        const colours = { major: paint("--edge"), minor: paint("--muted") };
        ctx.save();
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.lineWidth = dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        let row = 0;
        for (const edge of edges) {
          if (!edge.major && !showMinor.checked) continue;
          const px = Math.round(u.valToPos(edge.energy, "x", true)) + 0.5;
          if (px < u.bbox.left || px > right) continue;
          const colour = edge.major ? colours.major : colours.minor;
          ctx.strokeStyle = colour;
          ctx.beginPath();
          ctx.moveTo(px, u.bbox.top);
          ctx.lineTo(px, u.bbox.top + u.bbox.height);
          ctx.stroke();
          ctx.fillStyle = colour;
          const y = u.bbox.top + 4 * dpr + (row++ % 3) * 17 * dpr;
          ctx.font = `600 ${12 * dpr}px ${family}`;
          const nearRight = px + 4 * dpr + ctx.measureText(edge.label).width > right;
          const lx = nearRight ? px - 4 * dpr : px + 4 * dpr;
          const w = drawLabel(ctx, edge.label, lx, y, dpr, nearRight);
          taken.push({ x: nearRight ? lx - w : lx, y, w, h: 17 * dpr });
        }
        ctx.restore();
      },
    },
  };
  // Peaks of the main spectrum as drawn, from HyperSpy in Pyodide; i is the nearest channel.
  let peaks = [];
  let peakSeq = 0;
  let hyperspyReady = false;
  // The slope_thresh of the last search, for the snippet.
  let peakSlope = null;
  // The shared worker lives while any spectrum page uses it, including pages kept for the back button.
  let peakPort;
  const startPeakWorker = () => {
    if (peakPort) return peakPort;
    const worker = typeof SharedWorker === "function" ? new SharedWorker("/peaks-worker.js", { type: "module" }) : new Worker("/peaks-worker.js", { type: "module" });
    peakPort = worker.port ?? worker;
    peakPort.onmessage = ({ data: r }) => {
      if (r.ready) return void (hyperspyReady = true);
      busy.hidden = true;
      // Only the latest search counts, and its data is still what is plotted.
      if (r.id !== peakSeq) return;
      if (r.error) {
        peaks = [];
        peaksStatus.textContent = `HyperSpy could not run: ${r.error.split("\n").filter(Boolean).pop()}`;
      } else {
        const x = data[0];
        peaks = r.peaks.map((energy) => {
          const i = x.findIndex((v) => v >= energy);
          return { energy, i: i > 0 && energy - x[i - 1] < x[i] - energy ? i - 1 : i };
        });
        peakSlope = r.slope;
        if (snippet) writeSnippet(...snippetArgs);
        peaksStatus.textContent = peaks.length ? `${peaks.length} found by HyperSpy` : "HyperSpy found no peaks";
      }
      plot.redraw(false);
    };
    worker.onerror = () => {
      busy.hidden = true;
      peaksStatus.textContent = "HyperSpy could not be loaded.";
    };
    return peakPort;
  };
  const findPeaks = () => {
    if (!hyperspyReady) {
      peaksStatus.textContent = "Loading HyperSpy in your browser (this takes a few seconds)…";
      busy.hidden = false;
    }
    // A fraction of the sharpest curvature: 0.8 at the slider's left end, 0.001 at its right.
    startPeakWorker().postMessage({ id: ++peakSeq, x: data[0], y: view.y, level: 10 ** (-peakLevel.value / 10) });
  };
  // Tallest peaks first. A label goes above its peak, else beside the top, else nowhere.
  const peakPlugin = {
    hooks: {
      draw: (u) => {
        // Kept for the SVG export, which cannot read the canvas.
        u.peakMarks = [];
        if (!peaks.length) return;
        const ctx = u.ctx;
        const dpr = devicePixelRatio || 1;
        const { left, top, width, height } = u.bbox;
        const h = 13 * dpr;
        ctx.save();
        ctx.font = `500 ${11 * dpr}px ${family}`;
        ctx.textBaseline = "bottom";
        ctx.fillStyle = ctx.strokeStyle = paint("--ink");
        ctx.lineWidth = dpr;
        const free = (b) =>
          b.x >= left && b.x + b.w <= left + width && b.y >= top && !taken.some((t) => b.x < t.x + t.w && t.x < b.x + b.w && b.y < t.y + t.h && t.y < b.y + b.h);
        for (const p of [...peaks].sort((a, b) => view.y[b.i] - view.y[a.i])) {
          const x = u.valToPos(p.energy, "x", true);
          const y = u.valToPos(view.y[p.i], "y", true);
          if (!(x >= left && x <= left + width && y >= top && y <= top + height)) continue;
          const text = p.energy.toFixed(1);
          const w = ctx.measureText(text).width + 6 * dpr;
          const base = Math.max(top + h, y - 7 * dpr);
          const spot = [
            { align: "center", tx: x, ty: base, box: { x: x - w / 2, y: base - h, w, h }, tick: base < y - 2 * dpr ? [x, y - 2 * dpr, base] : null },
            { align: "left", tx: x + 6 * dpr, ty: y + h / 2, box: { x: x + 3 * dpr, y: y - h / 2, w, h } },
            { align: "right", tx: x - 6 * dpr, ty: y + h / 2, box: { x: x - 3 * dpr - w, y: y - h / 2, w, h } },
          ].find((s) => free(s.box));
          if (!spot) continue;
          taken.push(spot.box);
          u.peakMarks.push({ ...spot, text });
          if (spot.tick) {
            ctx.beginPath();
            ctx.moveTo(x, spot.tick[1]);
            ctx.lineTo(x, spot.tick[2]);
            ctx.stroke();
          }
          ctx.textAlign = spot.align;
          ctx.fillText(text, spot.tx, spot.ty);
        }
        ctx.restore();
      },
    },
  };

  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const plain = new Intl.NumberFormat("en", { maximumFractionDigits: 6 });
  const tickFont = `12px ${family}`;
  // Fit the y axis to its widest tick label so labels never run into the axis title.
  const ySize = (u, values, axisIdx, cycleNum) => {
    const axis = u.axes[axisIdx];
    if (cycleNum > 1) return axis._size;
    let width = 0;
    if (values) {
      u.ctx.font = `${12 * (devicePixelRatio || 1)}px ${family}`;
      for (const v of values) width = Math.max(width, u.ctx.measureText(v).width);
    }
    return Math.ceil(width / (devicePixelRatio || 1)) + 36;
  };
  const axis = () => ({
    stroke: paint("--muted"),
    font: tickFont,
    labelFont: `500 13px ${family}`,
    grid: { stroke: paint("--rule"), width: 1 },
    ticks: { stroke: paint("--line"), width: 1, size: 5 },
  });
  // Spectra from the viewer's computer, drawn on top; never uploaded.
  const compares = [];
  const scaleBox = document.getElementById("compare-scale");
  // With "Independent y axes", each compared spectrum gets its own y scale and right-hand axis, in its colour.
  const separate = () => scaleBox.checked;
  const scaleOf = (i) => (separate() ? `c${i}` : "y");
  // What is drawn: the data after the processing settings; `fit` only while the fitted background is shown.
  let view;
  const compute = () => {
    const o = settings();
    const main = processSpectrum(data[0], data[1], o);
    // A compared spectrum is fitted over the part of the window its data covers. powerLaw snaps the window to the
    // nearest channels, so with fewer than 10 channels there it would fit the spectrum's edge: leave it unfitted.
    const clipped = (x) => {
      const [lo, hi] = [Math.max(o.window[0], x[0]), Math.min(o.window[1], x.at(-1))];
      return (hi - lo) / ((x.at(-1) - x[0]) / (x.length - 1)) >= 10 ? { ...o, window: [lo, hi] } : { ...o, background: "" };
    };
    const procs = compares.map((c) => {
      const opts = clipped(c.x);
      return { ...processSpectrum(c.x, c.y, opts), from: opts.window[0], window: opts.window };
    });
    // The fit is drawn from the window start onwards; before it, it is extrapolation.
    const shownFit = (x, fit, from) => (o.background === "fit" && fit ? fit.map((v, i) => (x[i] < from ? null : v)) : null);
    view = {
      y: main.y,
      fit: shownFit(data[0], main.fit, o.window[0]),
      compares: procs.map((p) => p.y),
      compareFits: procs.map((p, j) => shownFit(compares[j].x, p.fit, p.from)),
    };
    if (procStatus) procStatus.textContent = o.background && !main.fit ? "No power law fits that window. Pick a wider one before the edge, at positive energies." : PROC_NOTE;
    snippetArgs = [o, main, procs];
    if (snippet) writeSnippet(...snippetArgs);
    showValues();
    if (peaksBox?.checked) findPeaks();
  };
  // Log axes cannot show zero or below.
  const shown = (ys) => (log() ? ys.map((v) => (v > 0 ? v : null)) : ys);
  const colour = (i) => paint(`--compare-${(i % 4) + 1}`);
  // Only where this spectrum has data, so a wider file does not squeeze the reference.
  const plotData = () => {
    const main = [data[0], shown(view.y), ...(view.fit ? [shown(view.fit)] : [])];
    if (!compares.length) return main;
    const [lo, hi] = [data[0][0], data[0].at(-1)];
    return uPlot.join([
      main,
      ...compares.map((c, j) => {
        const x = c.x.map((v) => v + (c.shift || 0));
        const ys = [view.compares[j], ...(view.compareFits[j] ? [view.compareFits[j]] : [])].map(shown);
        const keep = x.map((_, i) => i).filter((i) => x[i] >= lo && x[i] <= hi);
        return [keep.map((i) => x[i]), ...ys.map((y) => keep.map((i) => y[i]))];
      }),
    ]);
  };
  // Each compared spectrum's axis is a linear map of the main one (value = main × k + b, in log10 on a log axis),
  // so zooming scales both alike. Dragging the top half of its axis moves its maximum, the bottom half its minimum;
  // double-click resets it.
  let yRange = null;
  // Set by a box zoom; the y range function returns it, because uPlot only runs that function when y is not set directly.
  let zoomY = null;
  const tf = (v) => (log() ? Math.log10(v) : v);
  const inv = (v) => (log() ? 10 ** v : v);
  const autoRange = (lo, hi) => (log() ? uPlot.rangeLog(lo, hi, 10, false) : uPlot.rangeNum(lo, hi, 0.1, true));
  const link = (c, min, max) => {
    const [m0, m1] = yRange.map(tf);
    const k = (tf(max) - tf(min)) / (m1 - m0);
    c.map = { k, b: tf(min) - m0 * k };
  };
  const mapped = (c) => yRange.map((v) => inv(tf(v) * c.map.k + c.map.b));
  const axisDrag = {
    hooks: {
      ready: (u) => {
        if (!separate()) return;
        compares.forEach((c, i) => c.map ?? link(c, u.scales[`c${i}`].min, u.scales[`c${i}`].max));
        u.root.querySelectorAll(".u-axis").forEach((node, idx) => {
          const c = compares[idx - 2];
          if (!c) return;
          const key = scaleOf(idx - 2);
          node.classList.add("axis-drag");
          node.title = "Drag the top half to move the maximum, the bottom half to move the minimum. Double-click to reset.";
          node.style.color = colour(idx - 2);
          const half = (e) => {
            const box = node.getBoundingClientRect();
            return e.clientY < box.top + box.height / 2 ? "top" : "bottom";
          };
          // Tint the half a drag would move; it stays put while dragging.
          node.addEventListener("pointermove", (e) => node.hasPointerCapture(e.pointerId) || (node.dataset.half = half(e)));
          node.addEventListener("pointerleave", () => delete node.dataset.half);
          node.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            node.setPointerCapture(e.pointerId);
            const top = half(e) === "top";
            const [y0, min, max] = [e.clientY, ...mapped(c).map(tf)];
            const move = (m) => {
              const f = Math.exp((m.clientY - y0) / 150);
              const [lo, hi] = (top ? [min, min + (max - min) * f] : [max - (max - min) / f, max]).map(inv);
              link(c, lo, hi);
              u.setScale(key, { min: lo, max: hi });
            };
            node.addEventListener("pointermove", move);
            node.addEventListener("pointerup", () => node.removeEventListener("pointermove", move), { once: true });
          });
          node.addEventListener("dblclick", () => {
            c.map = null;
            rebuild();
          });
        });
      },
    },
  };
  // The legend names the spectra only; a fit shares its spectrum's colour. Its rows follow the series after x.
  const legendSpectra = {
    hooks: {
      ready: (u) => u.root.querySelectorAll(".u-legend .u-series").forEach((row, k) => u.series[k + 1].isFit && (row.style.display = "none")),
    },
  };
  // Drag a box to zoom to it. Setting x re-ranges y, and the compared scales after it.
  const boxZoom = {
    hooks: {
      setSelect: (u) => {
        const { left, top, width, height } = u.select;
        if (!width || !height) return;
        zoomY = [u.posToVal(top + height, "y"), u.posToVal(top, "y")];
        u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        u.setScale("x", { min: u.posToVal(left, "x"), max: u.posToVal(left + width, "x") });
      },
    },
  };
  // The values at the cursor go in a tooltip; the legend only names the series.
  const sig = new Intl.NumberFormat("en", { maximumSignificantDigits: 5 });
  // Compared spectra rarely share energies (uPlot.join leaves gaps), so interpolate each one at x between its own
  // nearest points; null outside its data.
  const valueAt = (xs, ys, i, x) => {
    let [l, r] = [i, i];
    while (l >= 0 && (ys[l] == null || xs[l] > x)) l--;
    while (r < xs.length && (ys[r] == null || xs[r] < x)) r++;
    if (l < 0 || r >= xs.length) return null;
    return l === r ? ys[l] : ys[l] + ((ys[r] - ys[l]) * (x - xs[l])) / (xs[r] - xs[l]);
  };
  const tooltip = {
    hooks: {
      init: (u) => u.over.append(Object.assign(document.createElement("div"), { className: "plot-tip", hidden: true })),
      setCursor: (u) => {
        const tip = u.over.querySelector(".plot-tip");
        const i = u.cursor.idx;
        tip.hidden = i == null;
        if (i == null) return;
        const x = u.posToVal(u.cursor.left, "x");
        const head = document.createElement("b");
        head.textContent = `${x.toFixed(2)} eV`;
        const rows = u.series.slice(1).flatMap((s, k) => {
          const v = valueAt(u.data[0], u.data[k + 1], i, x);
          if (v == null || !s.show) return [];
          const name = document.createElement("span");
          const mark = document.createElement("i");
          mark.style.borderColor = s._stroke ?? s.stroke;
          name.append(mark, s.label);
          const value = document.createElement("span");
          value.textContent = sig.format(v);
          return [name, value];
        });
        tip.replaceChildren(head, ...rows);
        const gap = 14;
        const [w, h] = [tip.offsetWidth, tip.offsetHeight];
        const left = u.cursor.left + gap + w > u.over.clientWidth ? u.cursor.left - gap - w : u.cursor.left + gap;
        tip.style.left = `${Math.max(0, left)}px`;
        tip.style.top = `${Math.min(Math.max(0, u.cursor.top - h / 2), u.over.clientHeight - h)}px`;
      },
    },
  };
  // Mark the background fit window as a capped range along the bottom of the plot; shade it only while its slider is dragged.
  let dragging = false;
  const windowPlugin = {
    hooks: {
      drawAxes: (u) => {
        if (!bgMode?.value) return;
        const [a, b] = settings().window.map((v) => u.valToPos(v, "x", true));
        const left = Math.max(a, u.bbox.left);
        const right = Math.min(b, u.bbox.left + u.bbox.width);
        if (right <= left) return;
        const { top, height } = u.bbox;
        const px = devicePixelRatio;
        const y = top + height - 6 * px;
        const ctx = u.ctx;
        ctx.save();
        if (dragging) {
          ctx.fillStyle = paint("--accent");
          ctx.globalAlpha = 0.1;
          ctx.fillRect(left, top, right - left, height);
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = paint("--edge");
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5 * px;
        ctx.setLineDash([6 * px, 4 * px]);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        // No cap where the plot edge cuts the window off.
        for (const [x, end] of [[left, a], [right, b]]) {
          if (x !== end) continue;
          ctx.moveTo(x, y - 4 * px);
          ctx.lineTo(x, y + 4 * px);
        }
        ctx.stroke();
        ctx.restore();
      },
    },
  };
  const format = (ys) => {
    const big = Math.max(...ys.map(Math.abs)) >= 1e5;
    // Log axes put a tick at every multiple in each decade; label only 1, 2 and 5 of them.
    const labelled = (v) => !log() || [1, 2, 5].includes(Math.round(v / 10 ** Math.floor(Math.log10(v))));
    return (u, splits) => splits.map((v) => (!labelled(v) ? "" : big ? compact.format(v) : plain.format(v)));
  };

  const opts = () => {
    const dual = compares.length > 0 && separate();
    const distr = log() ? { distr: 3, log: 10 } : {};
    return {
    width: el.clientWidth,
    height: Math.max(280, Math.min(460, el.clientWidth * 0.5)),
    scales: {
      x: { time: false },
      // The main scale is listed first so it is ranged before the compared ones, which follow it.
      y: { ...distr, range: (u, lo, hi) => (yRange = zoomY ?? autoRange(lo, hi)) },
      ...Object.fromEntries(
        compares.map((c, i) => [`c${i}`, { ...distr, range: (u, lo, hi) => (c.map && yRange ? mapped(c) : autoRange(lo, hi)) }]),
      ),
    },
    axes: [
      { ...axis(), label: "Energy (eV)", labelGap: 4 },
      {
        ...axis(),
        ...(dual ? { stroke: paint("--plot") } : {}),
        label: axisName(),
        size: ySize,
        values: format(view.y),
      },
      ...(dual
        ? compares.map((c, i) => ({ ...axis(), scale: scaleOf(i), side: 1, stroke: colour(i), grid: { show: false }, size: ySize, label: compareName(c), values: format(view.compares[i]) }))
        : []),
    ],
    series: [
      { label: "Energy (eV)" },
      { label: title, stroke: paint("--plot"), width: 1.5, points: { show: false } },
      ...(view.fit ? [{ label: compares.length ? `${title} fit` : "Power-law fit", stroke: paint("--plot"), width: 1.5, dash: [6, 4], points: { show: false }, isFit: true }] : []),
      ...compares.flatMap((c, i) => [
        { label: c.name, scale: scaleOf(i), stroke: colour(i), width: 1.5, points: { show: false }, spanGaps: true },
        ...(view.compareFits[i] ? [{ label: `${c.name} fit`, scale: scaleOf(i), stroke: colour(i), width: 1.5, dash: [6, 4], points: { show: false }, isFit: true }] : []),
      ]),
    ],
    legend: { show: compares.length > 0, live: false },
    cursor: {
      drag: { x: true, y: true, setScale: false },
      points: { show: false },
      bind: {
        dblclick: (u, targ, handler) => (e) => {
          zoomY = null;
          return handler(e);
        },
      },
    },
    plugins: [windowPlugin, edgePlugin, peakPlugin, axisDrag, tooltip, boxZoom, legendSpectra],
    };
  };

  el.innerHTML = "";
  // A sibling of the uPlot root, so it survives rebuilds.
  const busy = Object.assign(document.createElement("div"), { className: "plot-busy", hidden: true, textContent: "Loading HyperSpy, please wait…" });
  el.append(busy);
  compute();
  let plot = new uPlot(opts(), plotData(), el);
  const redraw = () => plot.redraw(false);
  for (const box of [showEdges, showMinor])
    box.addEventListener("change", () => {
      redraw();
      if (snippet) writeSnippet(...snippetArgs);
    });
  peaksBox?.addEventListener("change", () => {
    if (snippet) writeSnippet(...snippetArgs);
    if (peaksBox.checked) {
      try {
        localStorage.setItem("peaks-used", "1");
      } catch {}
      return findPeaks();
    }
    peakSeq++;
    peaks = [];
    peaksStatus.textContent = "";
    redraw();
  });
  peakLevel?.addEventListener("input", findPeaks);
  new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: opts().height })).observe(el);
  // Canvas colours are resolved once, so rebuild when the scheme changes.
  const rebuild = (keepZoom) => {
    if (keepZoom !== true) zoomY = null;
    const { min, max } = plot.scales.x;
    compute();
    plot.destroy();
    plot = new uPlot(opts(), plotData(), el);
    // Scales are null until uPlot's first commit, so a second rebuild in the same tick has no zoom to keep.
    if (keepZoom === true && min != null) plot.setScale("x", { min, max });
  };
  const proc = document.getElementById("process");
  if (proc) proc.hidden = false;
  showValues();
  // Viewers who have used "Label peaks" get HyperSpy loaded in the background, so the box answers at once.
  try {
    if (peaksBox && localStorage.getItem("peaks-used")) startPeakWorker();
  } catch {}
  // Normalised spectra share units, so separate axes stop making sense. Bring them back if normalising is turned off.
  let unscaled = false;
  normalise?.addEventListener("input", () => {
    if (normalise.value && scaleBox.checked) [scaleBox.checked, unscaled] = [false, true];
    else if (!normalise.value && unscaled) [scaleBox.checked, unscaled] = [true, false];
  });
  for (const control of [bgMode, bgFrom, bgTo, smooth, normalise, logY]) {
    control?.addEventListener("input", () => {
      // The data or the axis type changed, so the compared axes' maps to the main one no longer hold.
      compares.forEach((c) => (c.map = null));
      zoomY = null;
      rebuild(true);
    });
  }
  for (const r of [bgFrom, bgTo]) r?.addEventListener("pointerdown", () => (dragging = true));
  for (const type of ["pointerup", "pointercancel"])
    addEventListener(type, () => {
      if (!dragging) return;
      dragging = false;
      redraw();
    });
  bgText.forEach((t, i) =>
    t?.addEventListener("change", () => {
      const range = [bgFrom, bgTo][i];
      if (t.value !== "") {
        range.value = t.value;
        range.dispatchEvent(new Event("input"));
      }
      showValues();
    }),
  );
  smoothText?.addEventListener("change", () => {
    smooth.value = Math.round((+smoothText.value - 1) / 2);
    smooth.dispatchEvent(new Event("input"));
  });
  for (const t of [...bgText, smoothText]) t?.addEventListener("input", () => fitWidth(t));
  document.getElementById("bg-reset")?.addEventListener("click", () => {
    bgFrom.value = bgFrom.defaultValue;
    bgTo.value = bgTo.defaultValue;
    rebuild(true);
  });
  new MutationObserver(rebuild).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rebuild);
  const box = document.getElementById("compare");
  const input = document.getElementById("compare-file");
  const status = document.getElementById("compare-status");
  const list = document.getElementById("compare-list");
  if (box) box.hidden = false;
  const NOTE = status?.textContent;
  const update = () => {
    scaleBox.closest(".scale-row").hidden = !compares.length;
    list.replaceChildren(
      ...compares.map((c, i) => {
        const li = document.createElement("li");
        li.innerHTML = '<span class="swatch" aria-hidden="true"></span> <span class="name"></span> <label class="shift">shift <input type="number" step="0.1"> eV</label> <button type="button" class="link-button">Remove</button>';
        const shift = li.querySelector(".shift input");
        shift.value = c.shift || 0;
        shift.setAttribute("aria-label", `Energy shift for ${c.name} (eV)`);
        shift.addEventListener("input", () => {
          c.shift = +shift.value || 0;
          rebuild(true);
        });
        li.querySelector(".swatch").style.background = `var(--compare-${(i % 4) + 1})`;
        li.querySelector(".name").textContent = c.name;
        li.querySelector("button").setAttribute("aria-label", `Remove ${c.name}`);
        li.querySelector("button").addEventListener("click", () => {
          compares.splice(compares.indexOf(c), 1);
          update();
          status.textContent = NOTE;
        });
        return li;
      }),
    );
    list.hidden = !compares.length;
    rebuild();
  };
  const span = (x) => `${+x[0].toFixed(1)}–${+x.at(-1).toFixed(1)} eV`;
  const overlaps = (x) => x[0] < data[0].at(-1) && x.at(-1) > data[0][0];
  // The plot only draws compared spectra within this spectrum's energy range, so one outside it would not show.
  const addCompare = (c) => {
    if (!overlaps(c.x)) {
      status.textContent = `Not added: ${c.name} covers ${span(c.x)}, outside this spectrum's ${span(data[0])}.`;
      return;
    }
    compares.push(c);
    update();
    status.textContent = NOTE;
  };
  // A figure's intensity scale is unknown: start the trace at the height of this spectrum over the same energies.
  const fitToMain = (x, y) => {
    let [lo, hi] = [Infinity, -Infinity];
    data[0].forEach((e, i) => {
      if (e >= x[0] && e <= x.at(-1)) [lo, hi] = [Math.min(lo, data[1][i]), Math.max(hi, data[1][i])];
    });
    const [ylo, yhi] = [Math.min(...y), Math.max(...y)];
    return hi > lo && yhi > ylo ? y.map((v) => lo + ((v - ylo) / (yhi - ylo)) * (hi - lo)) : y;
  };
  // Screenshots of published figures: the viewer clicks two ticks on the energy axis, types their energies and draws
  // over a curve to trace it.
  const figure = document.getElementById("figure-dialog");
  const traceFigure =
    figure &&
    (() => {
      const BLUE = "#1f6fd6";
      const BRUSH = 12;
      const canvas = document.getElementById("figure-canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const steps = [...figure.querySelectorAll(".figure-steps > li")];
      const energies = [document.getElementById("figure-e1"), document.getElementById("figure-e2")];
      const handles = [...figure.querySelectorAll("[data-handle]")];
      const clear = document.getElementById("figure-clear");
      const warning = document.getElementById("figure-warning");
      const nameInput = document.getElementById("figure-name");
      const add = document.getElementById("figure-add");
      // A circle the size of the brush, dark with a white rim so it shows on any figure.
      const brushCursor = `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * BRUSH + 2}" height="${2 * BRUSH + 2}"><circle cx="${BRUSH + 1}" cy="${BRUSH + 1}" r="${BRUSH}" fill="rgb(31 111 214 / 0.15)" stroke="white" stroke-width="2"/><circle cx="${BRUSH + 1}" cy="${BRUSH + 1}" r="${BRUSH}" fill="none" stroke="${BLUE}" stroke-width="1"/></svg>`,
      )}") ${BRUSH + 1} ${BRUSH + 1}, crosshair`;
      let bitmap, pixels, ticks, strokes, trace, drawing, hover, done;
      // The tick whose handle is being dragged, and where on the handle it was grabbed.
      let grabbed = null;
      let grabOffset = 0;
      // Image pixels per screen pixel, so marks and the brush look the same however much the screenshot is scaled.
      const scale = () => canvas.width / canvas.getBoundingClientRect().width;
      const at = (e) => {
        const box = canvas.getBoundingClientRect();
        return [(e.clientX - box.left) * scale(), (e.clientY - box.top) * scale()];
      };
      const energy = (i) => (energies[i].value.trim() !== "" && Number.isFinite(+energies[i].value) ? +energies[i].value : null);
      const placing = () => ticks.includes(null);
      // Each placed tick has a handle above the figure, kept inside the strip; its nub points at the tick.
      const placeHandles = () => {
        const strip = handles[0].parentElement.getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        handles.forEach((h, i) => {
          h.hidden = ticks[i] === null;
          if (h.hidden) return;
          const ev = energy(i);
          h.lastElementChild.textContent = ev === null ? `${i + 1}` : `${ev} eV`;
          h.setAttribute("aria-label", `Tick ${i + 1}${ev === null ? "" : `, ${ev} eV`}. Drag it, or use the arrow keys, to move it.`);
          const x = box.left - strip.left + (ticks[i] + 0.5) / scale();
          const left = Math.min(Math.max(x - h.offsetWidth / 2, 0), strip.width - h.offsetWidth);
          h.style.left = `${left}px`;
          h.style.setProperty("--nub", `${x - left}px`);
        });
      };
      const moveTick = (i, x) => {
        x = Math.min(canvas.width - 1, Math.max(0, Math.round(x)));
        if (x !== ticks[1 - i]) ticks[i] = x;
        draw();
      };
      const path = (points) => {
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (points.length === 1) ctx.lineTo(points[0][0] + 0.01, points[0][1]);
        ctx.stroke();
      };
      const draw = () => {
        const k = scale();
        ctx.drawImage(bitmap, 0, 0);
        ctx.setLineDash([6 * k, 4 * k]);
        ctx.lineWidth = 1.5 * k;
        const guides = ticks.map((x, i) => [x, i]).filter(([x]) => x !== null);
        if (hover !== null && placing()) guides.push([hover, ticks.indexOf(null)]);
        for (const [x, i] of guides) {
          ctx.strokeStyle = x === hover && ticks[i] === null ? "rgb(31 111 214 / 0.55)" : BLUE;
          path([[x + 0.5, 0], [x + 0.5, canvas.height]]);
        }
        ctx.setLineDash([]);
        placeHandles();
        Object.assign(ctx, { lineCap: "round", lineJoin: "round", lineWidth: 2 * BRUSH * k, strokeStyle: "rgb(31 111 214 / 0.25)" });
        strokes.forEach(path);
        if (trace?.length) {
          Object.assign(ctx, { lineWidth: 2 * k, strokeStyle: "rgb(255 30 140 / 0.9)" });
          path(trace);
        }

        const e = [energy(0), energy(1)];
        const same = e[0] !== null && e[0] === e[1];
        const complete = [ticks[0] !== null && e[0] !== null, ticks[1] !== null && e[1] !== null && !same, trace?.length > 1];
        const current = complete.indexOf(false);
        steps.forEach((li, i) => (li.dataset.state = complete[i] ? "done" : i === current ? "current" : "upcoming"));
        energies.forEach((input, i) => (input.disabled = ticks[i] === null));
        clear.hidden = !strokes.length;
        canvas.style.cursor = placing() ? "crosshair" : brushCursor;

        let problem = same ? "The two ticks need different energies." : strokes.length && !drawing && !trace?.length ? "No curve found under the drawing. Draw right over the line." : "";
        if (!problem && !complete.includes(false)) {
          const [x] = toSpectrum(trace, ticks.map((px, i) => ({ px, ev: e[i] })), canvas.height);
          if (!overlaps(x)) problem = `The trace covers ${span(x)}, outside this spectrum's ${span(data[0])}, so it would not show on the plot. Check the energies of the ticks.`;
        }
        warning.textContent = problem;
        warning.hidden = !problem;
        add.disabled = complete.includes(false) || !!problem;
      };
      canvas.addEventListener("click", (e) => {
        if (!placing()) return;
        const x = Math.round(at(e)[0]);
        if (ticks.includes(x)) return;
        const i = ticks.indexOf(null);
        ticks[i] = x;
        hover = null;
        draw();
        energies[i].focus();
      });
      canvas.addEventListener("pointerdown", (e) => {
        if (placing()) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        drawing = true;
        strokes.push([at(e)]);
        draw();
      });
      canvas.addEventListener("pointermove", (e) => {
        if (drawing) strokes.at(-1).push(at(e));
        else if (placing()) hover = Math.round(at(e)[0]);
        else return;
        draw();
      });
      canvas.addEventListener("pointerleave", () => {
        if (hover === null) return;
        hover = null;
        draw();
      });
      for (const type of ["pointerup", "pointercancel"])
        canvas.addEventListener(type, () => {
          if (!drawing) return;
          drawing = false;
          trace = traceStrokes(pixels, strokes, BRUSH * scale());
          draw();
        });
      for (const input of energies) input.addEventListener("input", draw);
      handles.forEach((h, i) => {
        h.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          h.setPointerCapture(e.pointerId);
          h.focus();
          [grabbed, grabOffset] = [i, ticks[i] - at(e)[0]];
        });
        h.addEventListener("pointermove", (e) => grabbed === i && moveTick(i, at(e)[0] + grabOffset));
        for (const type of ["pointerup", "pointercancel"]) h.addEventListener(type, () => (grabbed = null));
        h.addEventListener("keydown", (e) => {
          const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
          if (!step) return;
          e.preventDefault();
          moveTick(i, ticks[i] + step * (e.shiftKey ? 10 : 1));
        });
      });
      // The handles follow the figure when the dialog changes size.
      new ResizeObserver(() => figure.open && draw()).observe(canvas);
      clear.addEventListener("click", () => {
        [strokes, trace] = [[], null];
        draw();
      });
      add.addEventListener("click", () => {
        const [x, y] = toSpectrum(trace, ticks.map((px, i) => ({ px, ev: energy(i) })), canvas.height);
        done({ name: nameInput.value.trim() || nameInput.placeholder, x, y: fitToMain(x, y) });
        figure.close();
      });
      figure.addEventListener("close", () => done(null));
      return async (file) => {
        bitmap = await createImageBitmap(file);
        [canvas.width, canvas.height] = [bitmap.width, bitmap.height];
        ctx.drawImage(bitmap, 0, 0);
        pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        [ticks, strokes, trace, drawing, hover] = [[null, null], [], null, false, null];
        for (const input of energies) input.value = "";
        // Pasted screenshots are all called image.png.
        nameInput.value = nameInput.placeholder = /^image\.\w+$/i.test(file.name) ? "Pasted figure" : file.name;
        figure.showModal();
        draw();
        return new Promise((resolve) => (done = resolve));
      };
    })();
  async function addFiles(files) {
    for (const file of files) {
      if (traceFigure && file.type.startsWith("image/")) {
        try {
          const traced = await traceFigure(file);
          if (traced) addCompare(traced);
        } catch {
          status.textContent = `${file.name} could not be opened as an image.`;
        }
        continue;
      }
      const text = /\.(msa|emsa|txt|csv)$/i.test(file.name);
      status.textContent = text ? `Reading ${file.name}…` : "Getting the file reader ready (the first time takes a few seconds)…";
      try {
        let [x, y] = text ? parseSpectrum(await file.text()) : await (await import("/pyreader.js")).readXY(file);
        if (!text) {
          const order = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
          [x, y] = [order.map((i) => x[i]), order.map((i) => y[i])];
        }
        if (x.length < 2) throw new Error("No spectrum found in this file.");
        addCompare({ name: file.name, x, y });
      } catch (e) {
        status.textContent = `${file.name} could not be read: ${String(e.message).split("\n").filter(Boolean).pop()}`;
      }
    }
  }
  // Other EELSdb spectra, searched by name or formula; with an empty field, those overlapping this one that share an element.
  const search = document.getElementById("compare-search");
  if (search) {
    const options = document.getElementById("compare-options");
    const TYPES = { coreloss: "Core loss", lowloss: "Low loss", zeroloss: "Zero loss", xrayabs: "X-ray absorption (NEXAFS)" };
    let matches = [];
    let active = -1;
    let seq = 0;
    const close = () => {
      options.hidden = true;
      search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
      active = -1;
    };
    const setActive = (i) => {
      active = i;
      [...options.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
      if (i < 0) search.removeAttribute("aria-activedescendant");
      else search.setAttribute("aria-activedescendant", `compare-opt-${i}`);
    };
    const pick = async (s) => {
      close();
      search.value = "";
      // So that focusing it again opens the list for the next one.
      search.blur();
      if (compares.some((c) => c.slug === s.slug)) return;
      status.textContent = `Loading ${s.title}…`;
      try {
        const res = await fetch(`/spectra/${encodeURIComponent(s.slug)}/download/json?preview`);
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        const { data: d } = await res.json();
        compares.push({ name: s.title, slug: s.slug, type: s.type, x: d.energy_ev, y: d.intensity });
        update();
        status.textContent = NOTE;
      } catch (e) {
        status.textContent = `${s.title} could not be loaded: ${e.message}`;
      }
    };
    const range = (s) => `${Math.round(s.min_energy_ev)}–${Math.round(s.max_energy_ev)} eV`;
    const show = async () => {
      const mine = ++seq;
      const params = new URLSearchParams({ overlaps: search.dataset.slug });
      if (search.value.trim()) params.set("q", search.value.trim());
      const found = await (await fetch(`/search/spectra.json?${params}`)).json();
      if (mine !== seq || document.activeElement !== search) return;
      matches = found.filter((s) => !compares.some((c) => c.slug === s.slug));
      options.replaceChildren(
        ...(matches.length
          ? matches.map((s, i) => {
              const li = document.createElement("li");
              li.id = `compare-opt-${i}`;
              li.setAttribute("role", "option");
              li.innerHTML = '<span></span><span class="n"></span>';
              li.firstChild.textContent = s.title;
              li.lastChild.textContent = [s.formula, TYPES[s.type], range(s)].filter(Boolean).join(" · ");
              li.addEventListener("mousedown", (e) => e.preventDefault());
              li.addEventListener("click", () => pick(matches[i]));
              return li;
            })
          : [Object.assign(document.createElement("li"), { className: "none", textContent: `No ${search.value.trim() ? "matching " : ""}spectra overlap this energy range` })]),
      );
      options.hidden = false;
      search.setAttribute("aria-expanded", "true");
      setActive(matches.length ? 0 : -1);
    };
    search.addEventListener("focus", show);
    search.addEventListener("click", () => options.hidden && show());
    search.addEventListener("input", show);
    search.addEventListener("blur", close);
    search.addEventListener("keydown", (e) => {
      const shown = !options.hidden;
      if (e.key === "ArrowDown" && !shown) {
        e.preventDefault();
        show();
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && shown && matches.length) {
        e.preventDefault();
        setActive((active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
      } else if (e.key === "Enter" && shown) {
        e.preventDefault();
        if (active >= 0) pick(matches[active]);
      } else if (e.key === "Escape" && shown) {
        e.preventDefault();
        close();
      }
    });
  }
  if (traceFigure)
    addEventListener("paste", (e) => {
      const images = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (images.length && !figure.open) {
        e.preventDefault();
        addFiles(images.slice(0, 1));
      }
    });
  input?.addEventListener("change", async () => {
    await addFiles([...input.files]);
    input.value = "";
  });
  scaleBox?.addEventListener("change", rebuild);

  // While files are dragged over the page, the plot and the compare button become drop targets.
  const drop = document.getElementById("plot-drop");
  if (drop) {
    const targets = [drop, box];
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    let depth = 0;
    const hide = () => {
      depth = 0;
      drop.hidden = true;
      box.classList.remove("dragging");
      for (const t of targets) t.classList.remove("over");
    };
    addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      depth++;
      drop.hidden = false;
      box.classList.add("dragging");
    });
    addEventListener("dragleave", (e) => {
      if (hasFiles(e) && --depth <= 0) hide();
    });
    addEventListener("dragover", (e) => hasFiles(e) && e.preventDefault());
    addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const onTarget = targets.some((t) => t.contains(e.target));
      hide();
      if (onTarget) addFiles([...e.dataTransfer.files]);
    });
    for (const t of targets) {
      t.addEventListener("dragover", () => t.classList.add("over"));
      t.addEventListener("dragleave", (e) => t.contains(e.relatedTarget) || t.classList.remove("over"));
    }
  }

  const picker = document.getElementById("plot-version");
  picker?.addEventListener("change", async () => {
    const v = versions[picker.value];
    try {
      data = await load(v.src);
      yLabel = v.axis;
      rebuild();
    } catch {
      picker.setCustomValidity("This version could not be read for plotting.");
      picker.reportValidity();
    }
  });

  // ---- Save the current view as an image -----------------------------------------------------
  const W = 1200;
  const H = 560;
  const HEAD = 64;
  const pageUrl = `EELSdb • ${location.origin}${location.pathname}`;
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

  /** A copy of the plot at a fixed size in the given theme, over the current energy range; call done() after use. */
  async function themedPlot(theme) {
    const holder = document.createElement("div");
    holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;color-scheme:${theme}`;
    const themedProbe = document.createElement("span");
    holder.append(themedProbe);
    document.body.append(holder);
    paint = (name) => {
      themedProbe.style.color = `var(${name})`;
      return getComputedStyle(themedProbe).color;
    };
    const o = { ...opts(), width: W, height: H, cursor: { show: false }, legend: { show: false } };
    const u = new uPlot(o, plotData(), holder);
    u.setScale("x", { min: plot.scales.x.min, max: plot.scales.x.max });
    await new Promise((r) => requestAnimationFrame(() => r()));
    const colours = { bg: paint("--bg"), ink: paint("--ink"), muted: paint("--muted"), rule: paint("--rule"), line: paint("--line"), edge: paint("--edge") };
    return {
      u,
      colours,
      done: () => {
        paint = css;
        u.destroy();
        holder.remove();
      },
    };
  }

  const legendItems = (u) => u.series.slice(1).filter((s) => !s.isFit).map((s) => ({ label: s.label, colour: s._stroke ?? s.stroke }));

  async function savePng(theme) {
    const { u, colours, done } = await themedPlot(theme);
    const src = u.ctx.canvas;
    const r = src.width / u.width;
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height + HEAD * r;
    const ctx = out.getContext("2d");
    ctx.fillStyle = colours.bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = colours.ink;
    ctx.font = `600 ${18 * r}px ${family}`;
    ctx.fillText(title, 16 * r, 26 * r);
    let x = 16 * r;
    ctx.font = `${13 * r}px ${family}`;
    for (const item of legendItems(u)) {
      ctx.fillStyle = typeof item.colour === "function" ? item.colour(u, 1) : item.colour;
      ctx.fillRect(x, 44 * r, 14 * r, 3 * r);
      ctx.fillStyle = colours.muted;
      ctx.fillText(item.label, x + 20 * r, 50 * r);
      x += (ctx.measureText(item.label).width + 44 * r);
    }
    ctx.textAlign = "right";
    ctx.fillText(pageUrl, out.width - 16 * r, 26 * r);
    ctx.fillText(describe(), out.width - 16 * r, 50 * r);
    ctx.drawImage(src, 0, HEAD * r);
    done();
    out.toBlob((blob) => give(blob, "png"));
  }

  async function saveSvg(theme) {
    const { u, colours, done } = await themedPlot(theme);
    const r = u.ctx.canvas.width / u.width;
    const [L, T, PW, PH] = [u.bbox.left / r, u.bbox.top / r + HEAD, u.bbox.width / r, u.bbox.height / r];
    const parts = [];
    const text = (x, y, t, attrs = "") => parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${esc(t)}</text>`);
    const ax = u.axes;
    // Grid and tick labels.
    (ax[0]._splits ?? []).forEach((v, k) => {
      const x = L + u.valToPos(v, "x");
      parts.push(`<line x1="${x.toFixed(1)}" y1="${T}" x2="${x.toFixed(1)}" y2="${T + PH}" stroke="${colours.rule}"/>`);
      text(x, T + PH + 18, ax[0]._values?.[k] ?? v, `text-anchor="middle" fill="${colours.muted}" font-size="12"`);
    });
    (ax[1]._splits ?? []).forEach((v, k) => {
      const y = T + u.valToPos(v, "y");
      parts.push(`<line x1="${L}" y1="${y.toFixed(1)}" x2="${L + PW}" y2="${y.toFixed(1)}" stroke="${colours.rule}"/>`);
      text(L - 8, y + 4, ax[1]._values?.[k] ?? v, `text-anchor="end" fill="${typeof ax[1].stroke === "function" ? ax[1].stroke(u, 1) : ax[1].stroke}" font-size="12"`);
    });
    let right = L + PW;
    ax.slice(2).forEach((a) => {
      const stroke = typeof a.stroke === "function" ? a.stroke(u, 0) : a.stroke;
      (a._splits ?? []).forEach((v, k) => text(right + 8, T + u.valToPos(v, a.scale) + 4, a._values?.[k] ?? v, `fill="${stroke}" font-size="12"`));
      text(0, 0, a.label, `transform="translate(${right + a._size + a.labelSize - 18} ${T + PH / 2}) rotate(90)" text-anchor="middle" fill="${stroke}" font-size="13"`);
      right += a._size + a.labelSize;
    });
    text(L + PW / 2, T + PH + 44, "Energy (eV)", `text-anchor="middle" fill="${colours.muted}" font-size="13"`);
    text(0, 0, axisName(), `transform="translate(18 ${T + PH / 2}) rotate(-90)" text-anchor="middle" fill="${colours.muted}" font-size="13"`);
    // Series, clipped to the plot area. undefined is a point only another series has (from uPlot.join) and is skipped;
    // null is a real gap and starts a new path, as on the canvas.
    parts.push(`<clipPath id="area"><rect x="${L}" y="${T}" width="${PW}" height="${PH}"/></clipPath><g clip-path="url(#area)" fill="none" stroke-width="1.5">`);
    u.series.forEach((s, i) => {
      if (i === 0) return;
      const stroke = typeof s.stroke === "function" ? s.stroke(u, i) : s.stroke;
      let d = "";
      let pen = "M";
      u.data[0].forEach((xv, k) => {
        const yv = u.data[i][k];
        if (yv === undefined) return;
        if (yv === null) return s.spanGaps || (pen = "M");
        d += `${pen}${(L + u.valToPos(xv, "x")).toFixed(2)} ${(T + u.valToPos(yv, s.scale)).toFixed(2)}`;
        pen = "L";
      });
      parts.push(`<path d="${d}" stroke="${stroke}"${s.dash ? ` stroke-dasharray="${s.dash.join(" ")}"` : ""}/>`);
    });
    if (showEdges.checked) {
      edges.filter((e) => (e.major || showMinor.checked) && e.energy >= u.scales.x.min && e.energy <= u.scales.x.max).forEach((e, k) => {
        const x = L + u.valToPos(e.energy, "x");
        const c = e.major ? colours.edge : colours.muted;
        parts.push(`<line x1="${x.toFixed(1)}" y1="${T}" x2="${x.toFixed(1)}" y2="${T + PH}" stroke="${c}" stroke-dasharray="3 3" stroke-width="1"/>`);
        parts.push(`<text x="${(x + 4).toFixed(1)}" y="${T + 14 + (k % 3) * 17}" fill="${c}" font-size="12" font-weight="600" stroke="none">${esc(e.label)}</text>`);
      });
    }
    // Peak marks are in canvas pixels; the canvas baseline is the bottom of the text, about 3 px below the SVG one.
    const anchor = { center: "middle", left: "start", right: "end" };
    for (const m of u.peakMarks ?? []) {
      if (m.tick) {
        const [x, y0, y1] = m.tick.map((v, k) => (v / r + (k ? HEAD : 0)).toFixed(1));
        parts.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${colours.ink}" stroke-width="1"/>`);
      }
      text(m.tx / r, m.ty / r + HEAD - 3, m.text, `text-anchor="${anchor[m.align]}" fill="${colours.ink}" font-size="11" font-weight="500" stroke="none"`);
    }
    parts.push("</g>");
    // Title, legend and address.
    text(16, 26, title, `fill="${colours.ink}" font-size="18" font-weight="600"`);
    text(W - 16, 26, pageUrl, `text-anchor="end" fill="${colours.muted}" font-size="13"`);
    text(W - 16, 50, describe(), `text-anchor="end" fill="${colours.muted}" font-size="13"`);
    let x = 16;
    for (const item of legendItems(u)) {
      const colour = typeof item.colour === "function" ? item.colour(u, 1) : item.colour;
      parts.push(`<rect x="${x}" y="44" width="14" height="3" fill="${colour}"/>`);
      text(x + 20, 50, item.label, `fill="${colours.muted}" font-size="13"`);
      x += 44 + item.label.length * 7.5;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + HEAD}" viewBox="0 0 ${W} ${H + HEAD}" font-family="${esc(family)}">
<rect width="100%" height="100%" fill="${colours.bg}"/>
${parts.join("\n")}
</svg>`;
    done();
    give(new Blob([svg], { type: "image/svg+xml" }), "svg");
  }

  function give(blob, ext) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${location.pathname.split("/").filter(Boolean).pop()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  for (const button of document.querySelectorAll("[data-save-plot]")) {
    button.addEventListener("click", () => {
      const [fmt, theme] = button.dataset.savePlot.split("-");
      (fmt === "svg" ? saveSvg : savePng)(theme);
      button.closest("[popover]")?.hidePopover();
    });
  }
}

/** File metadata as a flat table of dotted paths, fetched the first time it is opened. */
const flatten = (value, path = "", out = []) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
  } else {
    out.push([path, Array.isArray(value) ? JSON.stringify(value) : String(value)]);
  }
  return out;
};
for (const details of document.querySelectorAll("details.file-metadata")) {
  details.addEventListener("toggle", async () => {
    if (!details.open || details.dataset.loaded) return;
    details.dataset.loaded = "1";
    const table = details.querySelector("table");
    try {
      const rows = flatten(await (await fetch(`${details.dataset.src}?preview`)).json());
      for (const [k, v] of rows) {
        const tr = table.insertRow();
        tr.append(Object.assign(document.createElement("th"), { textContent: k }), Object.assign(document.createElement("td"), { textContent: v }));
      }
      const filter = details.querySelector(".metadata-filter");
      filter.hidden = rows.length < 20;
      filter.addEventListener("input", () => {
        const q = filter.value.toLowerCase();
        for (const tr of table.rows) tr.hidden = !!q && !tr.textContent.toLowerCase().includes(q);
      });
    } catch {
      table.insertRow().insertCell().textContent = "The metadata could not be loaded. You can still download it.";
    }
  });
}

main();
