// Traces a curve in a screenshot of a published spectrum, under strokes the viewer draws over it, so the spectrum
// page can compare it as data.

/** RGB distance from the background (the top-left corner) that counts as ink. */
const INK = 60;
/** How far off the line from the curve's colour to the background a pixel may be, as RGB distance. */
const OFF_LINE = 60;

const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);

/**
 * Points [x, y] in image pixels along the curve under `strokes` (each a list of [x, y]), drawn with a brush of radius
 * r, one per column the strokes cross, left to right. The curve's colour is the commonest ink colour under the brush;
 * in each column the trace takes the run of pixels in that colour nearest the stroke, and y is the middle of the run.
 */
export function traceStrokes(img, strokes, r) {
  const { width: w, height: h, data: d } = img;
  const mask = new Uint8Array(w * h);
  const centres = Array.from({ length: w }, () => []);
  const dab = (cx, cy) => {
    for (let j = Math.max(0, Math.ceil(cy - r)); j <= Math.min(h - 1, Math.floor(cy + r)); j++)
      for (let i = Math.max(0, Math.ceil(cx - r)); i <= Math.min(w - 1, Math.floor(cx + r)); i++)
        if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) mask[j * w + i] = 1;
    const col = Math.round(cx);
    if (col >= 0 && col < w) centres[col].push(cy);
  };
  for (const stroke of strokes)
    stroke.forEach(([x, y], k) => {
      const [x0, y0] = k ? stroke[k - 1] : [x, y];
      const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0)));
      for (let s = 1; s <= n; s++) dab(x0 + ((x - x0) * s) / n, y0 + ((y - y0) * s) / n);
    });

  const bg = [d[0], d[1], d[2]];
  // Ink nearer the stroke's centre line counts for more, so the curve drawn over wins over another one under the brush.
  const counts = new Map();
  for (let i = 0; i < w; i++) {
    if (!centres[i].length) continue;
    for (let j = 0; j < h; j++) {
      const p = (j * w + i) * 4;
      if (!mask[j * w + i] || dist(d, p, bg) <= INK) continue;
      const weight = r - Math.min(...centres[i].map((y) => Math.abs(j - y)));
      const key = ((d[p] >> 4) << 8) | ((d[p + 1] >> 4) << 4) | (d[p + 2] >> 4);
      if (weight > 0) counts.set(key, (counts.get(key) ?? 0) + weight);
    }
  }
  if (!counts.size) return [];
  const key = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const ref = [key >> 8, (key >> 4) & 15, key & 15].map((v) => v * 16 + 8);
  // Anti-aliasing and JPEG blur mix the curve's colour with the background, so a pixel is part of the curve when it
  // lies near the line between those two colours, on the curve's side of halfway. Other colours lie off that line.
  const axis = bg.map((v, c) => v - ref[c]);
  const len2 = axis.reduce((s, v) => s + v * v, 0) || 1;
  const isCurve = (p) => {
    const v = [d[p] - ref[0], d[p + 1] - ref[1], d[p + 2] - ref[2]];
    const t = Math.max(0, (v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]) / len2);
    return t <= 0.5 && Math.hypot(v[0] - t * axis[0], v[1] - t * axis[1], v[2] - t * axis[2]) <= OFF_LINE;
  };

  const points = [];
  for (let i = 0; i < w; i++) {
    if (!centres[i].length) continue;
    const runs = [];
    for (let j = 0, top = -1; j <= h; j++) {
      const on = j < h && mask[j * w + i] && isCurve((j * w + i) * 4);
      if (on && top < 0) top = j;
      else if (!on && top >= 0) {
        // A gap of 1 or 2 pixels is still the same line: another curve crossing it, or a JPEG artefact.
        if (runs.length && top - runs.at(-1)[1] <= 3) runs.at(-1)[1] = j - 1;
        else runs.push([top, j - 1]);
        top = -1;
      }
    }
    const gap = ([a, b]) => Math.min(...centres[i].map((y) => Math.max(0, a - y, y - b)));
    const best = runs.reduce((a, b) => (a && gap(a) <= gap(b) ? a : b), null);
    if (best) points.push([i, (best[0] + best[1]) / 2]);
  }
  return points;
}

/**
 * [energies, intensities] from traced points and two ticks ({ px, ev }) on the energy axis. The figure's intensity
 * scale is unknown, so intensity is the height in pixels above the bottom of the image.
 */
export function toSpectrum(points, ticks, height) {
  const [a, b] = ticks;
  const evPerPx = (b.ev - a.ev) / (b.px - a.px);
  const pairs = points.map(([x, y]) => [a.ev + (x - a.px) * evPerPx, height - y]).sort((p, q) => p[0] - q[0]);
  return [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
}
