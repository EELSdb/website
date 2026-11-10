import { describe, expect, it } from "vitest";
// @ts-expect-error plain browser module, no types
import { toSpectrum, traceStrokes } from "../public/digitise.js";

const W = 200;
const H = 100;
const R = 8;
const BLACK = [0, 0, 0];
const RED = [220, 30, 30];
// A pre-edge at y = 80, a sharp edge at x = 100 up to y = 30, then a slow fall.
const curve = (x: number) => (x < 100 ? 80 : 30 + (x - 100) * 0.3);

/** A white figure with a black frame and ticks, a 2 px black spectrum, a black label and a red line across. */
function figure() {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const paint = (x: number, y: number, [r, g, b]: number[]) => data.set([r, g, b], (y * W + x) * 4);
  for (let y = 5; y <= 95; y++) [10, 190].forEach((x) => paint(x, y, BLACK));
  for (let x = 10; x <= 190; x++) [5, 95].forEach((y) => paint(x, y, BLACK));
  for (let x = 20; x < 190; x += 10) for (let y = 89; y < 95; y++) paint(x, y, BLACK);
  for (let x = 11; x < 190; x++) {
    const [a, b] = [Math.round(curve(x)), Math.round(curve(x - 1))];
    for (let y = Math.min(a, b); y <= Math.max(a, b) + 1; y++) paint(x, y, BLACK);
  }
  for (let x = 140; x <= 150; x++) for (let y = 10; y <= 15; y++) paint(x, y, BLACK);
  for (let x = 20; x <= 180; x++) paint(x, 50, RED);
  return { width: W, height: H, data };
}

/** A rough stroke over the spectrum, a few pixels off, straight up the edge. */
const sloppy = () => {
  const s: number[][] = [];
  for (let x = 15; x <= 185; x += 5) {
    if (x === 100) s.push([100, 83]);
    s.push([x, curve(x) + (x % 2 ? 3 : -3)]);
  }
  return [s];
};

describe("figure tracing", () => {
  const img = figure();

  it("follows the spectrum under a rough stroke, over the edge and past the ticks, label and red line", () => {
    const points = traceStrokes(img, sloppy(), R);
    expect(points.map(([x]: number[]) => x)).toEqual(Array.from({ length: 171 }, (_, i) => 15 + i));
    for (const [x, y] of points) if (x !== 100) expect(Math.abs(y - (Math.round(curve(x)) + 0.5))).toBeLessThanOrEqual(1);
  });

  it("traces the curve under the middle of the stroke when a thicker one is also under the brush", () => {
    const two = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
    for (let x = 20; x <= 180; x++) {
      two.data.set(RED, (50 * W + x) * 4);
      for (const y of [55, 56]) two.data.set(BLACK, (y * W + x) * 4);
    }
    const points = traceStrokes(two, [[[40, 50], [160, 50]]], R);
    expect(points).toHaveLength(121);
    expect(points.every(([, y]: number[]) => y === 50)).toBe(true);
  });

  it("finds nothing under a stroke over bare background", () => {
    expect(traceStrokes(img, [[[30, 65], [90, 65]]], 4)).toEqual([]);
  });

  it("maps pixels to energy with two ticks", () => {
    const [x, y] = toSpectrum([[100, 30], [10, 80]], [{ px: 10, ev: 280 }, { px: 190, ev: 300 }], H);
    expect(x).toEqual([280, 290]);
    expect(y).toEqual([20, 70]);
  });
});
