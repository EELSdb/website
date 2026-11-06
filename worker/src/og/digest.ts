import { majorEdges } from "../preview";
import { esc, textWidth, ticks } from "./cards";

// Mid-tones that read on both #ffffff and #1c1b19: the images are transparent and sit on either theme.
// One mid-tone blue for every type: it reads on light and dark backgrounds, and the card states the type.
const LINE = "#4a73a6";
const EDGE = "#b97a35";
const AXIS = "#9a948c";
const AXIS_TEXT = "#8a847c";

const SIZES = {
  tile: { W: 524, H: 172, band: 36, bottom: 0, margin: 4, line: 2.4, font: 22, dash: "4.6 3.9", marker: 1.8, axis: false },
  plot: { W: 1072, H: 400, band: 44, bottom: 40, margin: 6, line: 3, font: 24, dash: "4.9 4.2", marker: 2, axis: true },
};
export type DigestKind = keyof typeof SIZES;
export const DIGEST_SIZES = { tile: [524, 172], plot: [1072, 400] } as const;

/** At most two points (min and max) per pixel column, so one-sample spikes survive. */
function decimate(x: number[], y: number[], columns: number): [number[], number[]] {
  if (x.length <= columns * 2) return [x, y];
  const xs: number[] = [];
  const ys: number[] = [];
  const step = x.length / columns;
  for (let c = 0; c < columns; c++) {
    const a = Math.floor(c * step);
    const b = Math.max(a + 1, Math.floor((c + 1) * step));
    let [lo, hi] = [a, a];
    for (let i = a; i < b; i++) {
      if (y[i] < y[lo]) lo = i;
      if (y[i] > y[hi]) hi = i;
    }
    for (const i of lo < hi ? [lo, hi] : [hi, lo]) {
      xs.push(x[i]);
      ys.push(y[i]);
    }
  }
  return [xs, ys];
}

function axisTicks(x0: number, x1: number) {
  const pad = (20 * (x1 - x0)) / 1072;
  const inside = ticks(x0, x1, 5).filter((v) => v > x0 + pad && v < x1 - pad);
  return inside.length > 6 ? inside.slice(0, 6) : inside;
}

/** The plot drawn on a digest card (`plot`) or tile (`tile`): transparent, with major edge markers and, on the card, an energy axis. */
export function digestPlot(kind: DigestKind, type: string, elements: string[], data: [number[], number[]]) {
  const c = SIZES[kind];
  const [x, y] = decimate(data[0], data[1], c.W);
  const [x0, x1] = [data[0][0], data[0][data[0].length - 1]];
  const loss = type === "lowloss" ? data[1].filter((_, i) => data[0][i] > 5) : [];
  const ys = loss.length ? loss : data[1];
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (type === "lowloss") hi *= 1.1;
  if (hi === lo) hi = lo + 1;
  const top = c.H - c.band;
  const base = c.H - c.bottom;
  const X = (e: number) => ((e - x0) / (x1 - x0)) * c.W;
  const Y = (v: number) => {
    const up = c.bottom + c.margin + ((v - lo) / (hi - lo)) * (top - c.bottom - c.margin);
    return c.H - Math.min(Math.max(up, c.bottom), top);
  };
  const line = "M" + x.map((e, i) => `${X(e).toFixed(1)},${Y(y[i]).toFixed(1)}`).join("L");
  const colour = LINE;
  let out = `<path d="${line}L${c.W},${base}L0,${base}Z" fill="${colour}" fill-opacity="0.1"/>`;

  const text = (s: string, cx: number, centre: number, weight: number, fill: string) => {
    const w = textWidth(s, c.font, weight);
    const left = Math.min(Math.max(cx - w / 2, 1), c.W - w - 1);
    return [`<text x="${left.toFixed(1)}" y="${(centre + c.font * 0.36).toFixed(1)}" font-size="${c.font}" font-weight="${weight}" fill="${fill}" font-family="Mona Sans" xml:space="preserve">${esc(s)}</text>`, left, w] as const;
  };

  let last = -Infinity;
  for (const edge of majorEdges(elements, x0, x1).sort((a, b) => a.energy - b.energy)) {
    const ex = X(edge.energy);
    out += `<line x1="${ex.toFixed(1)}" x2="${ex.toFixed(1)}" y1="${c.band + 2}" y2="${base}" stroke="${EDGE}" stroke-width="${c.marker}" stroke-dasharray="${c.dash}"/>`;
    const [label, left, w] = text(edge.label, ex, c.band / 2, 600, EDGE);
    if (left < last + 4) continue;
    out += label;
    last = left + w;
  }
  out += `<path d="${line}" fill="none" stroke="${colour}" stroke-width="${c.line}" stroke-linejoin="round" stroke-linecap="round"/>`;

  if (c.axis) {
    out += `<line x1="0" x2="${c.W}" y1="${base}" y2="${base}" stroke="${AXIS}" stroke-opacity="0.6" stroke-width="2"/>`;
    const marks = axisTicks(x0, x1);
    marks.forEach((v, i) => {
      out += `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${base}" y2="${base + 8}" stroke="${AXIS}" stroke-opacity="0.6" stroke-width="2"/>`;
      out += text(i === marks.length - 1 ? `${v} eV` : String(v), X(v), c.H - 14, 500, AXIS_TEXT)[0];
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.W}" height="${c.H}" viewBox="0 0 ${c.W} ${c.H}">${out}</svg>`;
}
