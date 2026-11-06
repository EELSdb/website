// "Use in HyperSpy" code: built as plain text, then highlighted like the docs (Night Owl). The server renders it
// with this module too (src/pages/snippet.tsx).

const KEYWORDS = new Set(["import", "from", "as", "for", "in", "if", "else", "not", "and", "or", "True", "False", "None"]);
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (c, t) => `<span class="t-${c}">${esc(t)}</span>`;

/** Highlight the small part of Python these snippets use. */
export function highlightPython(code) {
  let depth = 0;
  const re = /(#.*)|"((?:[^"\\]|\\.)*)"|([A-Za-z_]\w*)|(-?\d+(?:\.\d+)?)|(\+=|[=/*+-])|([()])|(\s+|.)/g;
  return code.replace(re, (m, comment, str, id, num, op, paren, other, at) => {
    if (comment) return span("c", comment);
    if (str !== undefined) return `${span("p", '"')}${span("s", str)}${span("p", '"')}`;
    if (id) {
      const next = code[at + id.length];
      if (KEYWORDS.has(id)) return span("k", id);
      if (next === "(") return span("f", id);
      if (next === "=" && code[at + id.length + 1] !== "=") return span("a", id);
      if (depth > 0 && code[at - 1] !== "." && next !== ".") return span("v", id);
      return id;
    }
    if (num) return num;
    if (op) return span("k", op);
    if (paren) {
      depth += paren === "(" ? 1 : -1;
      return paren;
    }
    return other === "," && depth > 0 ? span("p", ",") : esc(m);
  });
}

// Formats that EELSdb reads with its own code, which HyperSpy cannot load.
const NOT_HYPERSPY = /\.(txt|csv|xdi)$/i;

/**
 * Python that loads the spectra in HyperSpy, applies the plot's processing to each and plots them. The inline script
 * metadata (PEP 723) lets `uv run` install HyperSpy and exSpy; exSpy makes EELS files load as EELSSpectrum.
 * spectra: [{ name, file, url?, signalType?, window?: [lo, hi], shift? }]; a spectrum without a url is a local file.
 * o: { smooth, normalise, log, edges?: { elements, minor } } as on the page; a spectrum's `window` means its background
 * is subtracted. Edge markers need an EELSSpectrum, and plot_spectra cannot draw them, so only one spectrum gets them.
 */
export function hyperspyCode(spectra, o = {}) {
  const q = JSON.stringify;
  const num = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(4)));
  const lines = ["# /// script", '# dependencies = ["hyperspy", "exspy"]', "# ///", "import matplotlib.pyplot as plt", "import hyperspy.api as hs"];
  if (spectra.some((sp) => sp.url)) lines.push("from urllib.request import urlretrieve");
  const loaded = [];
  spectra.forEach((sp, i) => {
    lines.push("");
    if (!sp.url && NOT_HYPERSPY.test(sp.file)) {
      lines.push(`# ${sp.file}: HyperSpy cannot read this format, so it is left out.`);
      return;
    }
    const v = i ? `s${i + 1}` : "s";
    const type = sp.signalType ? `, signal_type=${q(sp.signalType)}` : "";
    if (sp.url) lines.push(`url = ${q(sp.url)}`, `path, _ = urlretrieve(url, ${q(sp.file)})`, `${v} = hs.load(path${type})`);
    else lines.push(`${v} = hs.load(${q(sp.file)}${type})  # your file: change the path if it is elsewhere`);
    if (sp.window) lines.push(`${v} = ${v}.remove_background(signal_range=(${num(sp.window[0])}, ${num(sp.window[1])}))`);
    if (o.smooth) lines.push(`${v}.smooth_savitzky_golay(window_length=${o.smooth}, polynomial_order=2)`);
    if (o.normalise) lines.push(`${v} = ${v} / ${v}.data.${o.normalise === "max" ? "max" : "sum"}()`);
    // The page shifts after processing, so the fit window is on the file's own energies.
    if (sp.shift) lines.push(`${v}.axes_manager[-1].offset += ${num(sp.shift)}`);
    loaded.push([v, sp.name]);
  });
  if (loaded.length === 1) {
    const edges = o.edges?.elements.length
      ? `plot_edges=[${o.edges.elements.map(q).join(", ")}]${o.edges.minor ? "" : ', only_edges=("Major",)'}`
      : "";
    if (spectra.length > 1) lines.push("");
    lines.push(`${loaded[0][0]}.plot(${[edges, o.log ? 'norm="log"' : ""].filter(Boolean).join(", ")})`);
  } else if (loaded.length > 1) {
    const call = `hs.plot.plot_spectra([${loaded.map(([v]) => v).join(", ")}], legend=[${loaded.map(([, n]) => q(n)).join(", ")}])`;
    lines.push("", o.log ? `ax = ${call}` : call);
    if (o.log) lines.push('ax.set_yscale("log")');
  }
  if (loaded.length) lines.push("plt.show()");
  return lines.join("\n");
}
