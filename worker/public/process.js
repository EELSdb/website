// View-only processing for the spectrum page, matching exSpy's results (see data/fixtures/process.json).

const nearest = (x, v) => {
  let best = 0;
  for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - v) < Math.abs(x[best] - v)) best = i;
  return best;
};

/**
 * Power-law background A·E^-r over the whole energy range, estimated from the window [lo, hi] by the two-area method
 * as exSpy's remove_background(signal_range=(lo, hi)) does. Null when the window is too narrow or the fit fails.
 */
export function powerLaw(x, y, lo, hi) {
  const p = powerLawParams(x, y, lo, hi);
  return p && x.map((e) => p.A * e ** -p.r * p.step);
}

/** The A and r of powerLaw, and the channel width that the binned model is multiplied by. */
function powerLawParams(x, y, lo, hi) {
  let i1 = nearest(x, lo);
  let i4 = nearest(x, hi);
  if ((i1 + i4) % 2) i4--;
  if (i4 === i1) i4 += 2;
  if (i4 <= i1 || i4 >= x.length) return null;
  const i3 = (i1 + i4) / 2;
  let I1 = 0;
  let I2 = 0;
  for (let i = i1; i < i3; i++) I1 += y[i];
  for (let i = i3; i < i4; i++) I2 += y[i];
  const [x1, x2, x3, x4] = [x[i1], x[i3], x[i3], x[i4]];
  const r = (2 * Math.log(((I1 / I2) * (x4 - x3)) / (x2 - x1))) / Math.log((x4 * x3) / x2 / x1);
  const k = 1 - r;
  const A1 = (k * I1) / (x2 ** k - x1 ** k);
  const A2 = (k * I2) / (x4 ** k - x3 ** k);
  const A = (A1 * I1 + A2 * I2) / (I1 + I2);
  if (!Number.isFinite(A) || !Number.isFinite(r)) return null;
  // exSpy treats EELS counts as binned: A comes from plain sums and the model is multiplied by the channel width.
  return { A, r, step: (x.at(-1) - x[0]) / (x.length - 1) };
}

/** Solve a small dense system by Gaussian elimination with partial pivoting. */
function solve(M, b) {
  const n = b.length;
  const a = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const out = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * out[k];
    out[r] = s / a[r][r];
  }
  return out;
}

/** Least-squares polynomial of the given order through (t, v), evaluated (or its first derivative, with deriv) at each of `at`. */
function polyAt(t, v, order, at, deriv = 0) {
  const n = order + 1;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  t.forEach((ti, j) => {
    for (let r = 0; r < n; r++) {
      b[r] += v[j] * ti ** r;
      for (let c = 0; c < n; c++) M[r][c] += ti ** (r + c);
    }
  });
  const coef = solve(M, b);
  return at.map((a) => coef.reduce((s, c, p) => s + (deriv ? (p ? p * c * a ** (p - 1) : 0) : c * a ** p), 0));
}

/** Savitzky–Golay smoothing like scipy's savgol_filter (mode "interp"), which exSpy's smooth_savitzky_golay uses. */
export function savitzkyGolay(y, window, order, deriv = 0, delta = 1) {
  const n = y.length;
  if (window > n || window <= order) return y.slice();
  const h = (window - 1) / 2;
  const t = Array.from({ length: window }, (_, j) => j - h);
  // Fitting a unit impulse at each window position gives the convolution weights for the centre point.
  const weights = t.map((_, j) => polyAt(t, t.map((_, k) => +(k === j)), order, [0], deriv)[0] / delta ** deriv);
  const out = new Array(n);
  for (let i = h; i < n - h; i++) {
    let s = 0;
    for (let j = 0; j < window; j++) s += weights[j] * y[i - h + j];
    out[i] = s;
  }
  const ends = Array.from({ length: h }, (_, j) => j - h);
  polyAt(t, y.slice(0, window), order, ends, deriv).forEach((v, j) => (out[j] = v / delta ** deriv));
  polyAt(t, y.slice(n - window), order, ends.map((e) => -e), deriv).forEach((v, j) => (out[n - 1 - j] = v / delta ** deriv));
  return out;
}

/**
 * Background, then Fourier-ratio deconvolution if a low-loss spectrum { x, y } is given, then smoothing, then
 * normalisation. `fit` is the background on the same scale as `y`, for drawing; `frd` is the deconvolution's
 * { fwhm, threshold } or { error }.
 */
export function processSpectrum(x, y, { background, window, smooth, normalise, lowloss = null }) {
  let fit = background ? powerLaw(x, y, window[0], window[1]) : null;
  let out = background === "subtract" && fit ? y.map((v, i) => v - fit[i]) : y.slice();
  let frd = null;
  if (lowloss) {
    const step = (x.at(-1) - x[0]) / (x.length - 1);
    const llStep = (lowloss.x.at(-1) - lowloss.x[0]) / (lowloss.x.length - 1);
    if (background === "subtract" && !fit) frd = { error: "no power law fits the background window. Pick a wider one before the edge." };
    else if (x.some((e, i) => i && Math.abs(e - x[i - 1] - step) > 1e-3 * step)) frd = { error: "the energy channels of this spectrum are not evenly spaced." };
    else {
      const ll = Math.abs(llStep - step) > 1e-6 * step ? resample(lowloss.x, lowloss.y, step) : lowloss;
      frd = fourierRatio(x, out, ll.x, ll.y);
      if (frd.y) [out, fit] = [frd.y, null];
      delete frd.y;
    }
  }
  if (smooth) out = savitzkyGolay(out, smooth, 2);
  const f = normalise === "max" ? Math.max(...out) : normalise === "area" ? out.reduce((s, v) => s + v, 0) : 1;
  if (f !== 1 && f) {
    out = out.map((v) => v / f);
    fit = fit?.map((v) => v / f);
  }
  return { y: out, fit, frd };
}

// ---- Fourier-ratio deconvolution, as exSpy's fourier_ratio_deconvolution ------------------------------------------

/** The smallest length ≥ n with no prime factor above 11, as scipy.fft.next_fast_len(n), which exSpy pads to. */
export function nextFastLen(n) {
  for (let m = n; ; m++) {
    let k = m;
    for (const p of [2, 3, 5, 7, 11]) while (k % p === 0) k /= p;
    if (k === 1) return m;
  }
}

/** In-place radix-2 FFT of (re, im); the length must be a power of two. */
function fft2(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inverse ? 2 : -2) * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const [c, s] = [Math.cos(a * k), Math.sin(a * k)];
        const [p, q] = [i + k, i + k + len / 2];
        const tr = re[q] * c - im[q] * s;
        const ti = re[q] * s + im[q] * c;
        [re[q], im[q]] = [re[p] - tr, im[p] - ti];
        re[p] += tr;
        im[p] += ti;
      }
    }
  }
}

/** Discrete Fourier transform of any length (Bluestein's chirp-z through a power-of-two FFT). Unnormalised both ways. */
function dft(re, im, inverse = false) {
  const n = re.length;
  if (!(n & (n - 1))) {
    const [r, i] = [Float64Array.from(re), Float64Array.from(im)];
    fft2(r, i, inverse);
    return [r, i];
  }
  const m = 2 ** Math.ceil(Math.log2(2 * n - 1));
  const sign = inverse ? 1 : -1;
  // k² mod 2n keeps the chirp's angle small, so it stays exact for long inputs.
  const wr = new Float64Array(n);
  const wi = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const a = (sign * Math.PI * ((k * k) % (2 * n))) / n;
    [wr[k], wi[k]] = [Math.cos(a), Math.sin(a)];
  }
  const [ar, ai, br, bi] = [new Float64Array(m), new Float64Array(m), new Float64Array(m), new Float64Array(m)];
  for (let k = 0; k < n; k++) {
    ar[k] = re[k] * wr[k] - im[k] * wi[k];
    ai[k] = re[k] * wi[k] + im[k] * wr[k];
    br[k] = wr[k];
    bi[k] = -wi[k];
    if (k) [br[m - k], bi[m - k]] = [wr[k], -wi[k]];
  }
  fft2(ar, ai, false);
  fft2(br, bi, false);
  for (let k = 0; k < m; k++) [ar[k], ai[k]] = [ar[k] * br[k] - ai[k] * bi[k], ar[k] * bi[k] + ai[k] * br[k]];
  fft2(ar, ai, true);
  const outR = new Float64Array(n);
  const outI = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const [r, i] = [ar[k] / m, ai[k] / m];
    outR[k] = r * wr[k] - i * wi[k];
    outI[k] = r * wi[k] + i * wr[k];
  }
  return [outR, outI];
}

/** numpy.fft.rfft(y, n): the first n/2 + 1 bins of the transform of y cut or zero-padded to n. */
function rfft(y, n) {
  const re = new Float64Array(n);
  re.set(y.slice(0, n));
  const [r, i] = dft(re, new Float64Array(n));
  const m = Math.floor(n / 2) + 1;
  return [r.slice(0, m), i.slice(0, m)];
}

/** numpy.fft.irfft(Y) with its default length, 2 (m − 1) for m bins; the imaginary parts of the first and last bins are dropped. */
function irfft(yr, yi) {
  const m = yr.length;
  const n = 2 * (m - 1);
  const [re, im] = [new Float64Array(n), new Float64Array(n)];
  for (let k = 0; k < m; k++) [re[k], im[k]] = [yr[k], k === 0 || k === m - 1 ? 0 : yi[k]];
  for (let k = 1; k < m - 1; k++) [re[n - k], im[n - k]] = [yr[k], -yi[k]];
  return Array.from(dft(re, im, true)[0], (v) => v / n);
}

/**
 * exSpy's estimate_elastic_scattering_threshold: the first minimum of the slope of the smoothed low-loss spectrum
 * between 1 and 11 eV, where the zero-loss peak gives way to inelastic scattering. Null if there is none.
 */
export function elasticThreshold(x, y, start = 1, window = 10) {
  const step = (x.at(-1) - x[0]) / (x.length - 1);
  const index = (v) => (v > x[0] && v <= x.at(-1) ? nearest(x, v) : null);
  const i1 = index(start) ?? 0;
  const i2 = index(start + window) ?? x.length - 1;
  if (i2 < i1 + 10) return null;
  const d = savitzkyGolay(y.slice(i1, i2), 5, 3, 1, step).map(Math.abs);
  const k = d.indexOf(Math.min(...d));
  return k > 0 ? x[i1 + k] : null;
}

/** Full width at half maximum of the tallest peak; each crossing from a cubic through the four channels around it, close to HyperSpy's interpolating spline. */
export function peakWidth(x, y) {
  const top = y.indexOf(Math.max(...y));
  const half = y[top] / 2;
  let [l, r] = [top, top];
  while (l > 0 && y[l] > half) l--;
  while (r < y.length - 1 && y[r] > half) r++;
  if (y[l] > half || y[r] > half) return null;
  const cross = (a, b) => {
    const pts = [a - 1, a, b, b + 1].filter((i) => i >= 0 && i < y.length);
    const at = (e) => pts.reduce((sum, i) => sum + y[i] * pts.reduce((w, j) => (j === i ? w : (w * (e - x[j])) / (x[i] - x[j])), 1), 0) - half;
    let [lo, hi] = [x[a], x[b]];
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(at(mid)) === Math.sign(at(lo))) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return cross(r - 1, r) - cross(l, l + 1);
}

const extrapolate = (x, y, window, extra) => {
  const p = powerLawParams(x, y, x[x.length - window], x.at(-1));
  if (!p) return null;
  const xs = [...x, ...Array.from({ length: extra }, (_, k) => x.at(-1) + p.step * (k + 1))];
  return { x: xs, y: [...y, ...xs.slice(x.length).map((e) => p.A * e ** -p.r * p.step)] };
};

const hanningTaper = (y) => {
  const c = Math.max(20, Math.round(y.length * 0.02));
  const w = (k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (2 * c - 1));
  const out = y.slice();
  for (let k = 0; k < c; k++) {
    out[k] *= w(k);
    out[out.length - c + k] *= w(c + k);
  }
  return out;
};

/**
 * Removes plural scattering from a background-subtracted core-loss spectrum (cx, cy) with a low-loss spectrum of the
 * same area (lx, ly) on channels of the same width, as exSpy's fourier_ratio_deconvolution with its defaults: both
 * extrapolated with a power law and tapered, the ratio of their transforms reconvolved with a Gaussian as wide as the
 * zero-loss peak, and scaled by the zero-loss intensity. Returns { y, fwhm, threshold }, or { error }.
 */
export function fourierRatio(cx, cy, lx, ly, { fwhm = null, threshold = null } = {}) {
  threshold ??= elasticThreshold(lx, ly);
  if (threshold === null) return { error: "no end of the zero-loss peak was found between 1 and 11 eV in the low-loss spectrum." };
  const cl = extrapolate(cx, cy, 20, 100);
  const ll = extrapolate(lx, ly, 100, 100);
  if (!cl || !ll) return { error: "the ends of the spectra could not be extrapolated with a power law." };
  const llTaper = hanningTaper(ll.y);
  const clTaper = hanningTaper(cl.y);
  // Like exSpy, the zero-loss intensity is summed after the taper.
  const iz = nearest(lx, threshold);
  let I0 = 0;
  for (let i = 0; i < iz; i++) I0 += llTaper[i];
  fwhm ??= peakWidth(ll.x, llTaper);
  if (!fwhm) return { error: "the width of the zero-loss peak could not be measured." };
  const size = nextFastLen(llTaper.length + cx.length - 1);
  const sigma = fwhm / 2.3548;
  const step = (lx.at(-1) - lx[0]) / (lx.length - 1);
  const zl = Array.from({ length: size }, (_, k) => Math.exp(-((lx[0] + step * k) ** 2) / (2 * sigma ** 2)) / (sigma * Math.sqrt(2 * Math.PI)));
  const [zr, zi] = rfft(zl, size);
  const [kr, ki] = rfft(clTaper, size);
  const [lr, li] = rfft(llTaper, size);
  const [or, oi] = [new Float64Array(zr.length), new Float64Array(zr.length)];
  for (let k = 0; k < zr.length; k++) {
    const nr = zr[k] * kr[k] - zi[k] * ki[k];
    const ni = zr[k] * ki[k] + zi[k] * kr[k];
    const den = lr[k] ** 2 + li[k] ** 2;
    or[k] = (nr * lr[k] + ni * li[k]) / den;
    oi[k] = (ni * lr[k] - nr * li[k]) / den;
  }
  return { y: irfft(or, oi).slice(0, cx.length).map((v) => v * I0), fwhm, threshold };
}

/** The low-loss spectrum on the core-loss spectrum's channel width, which Fourier-ratio deconvolution needs. */
export function resample(x, y, step) {
  const n = Math.floor((x.at(-1) - x[0]) / step + 1e-9) + 1;
  let j = 0;
  const xs = Array.from({ length: n }, (_, k) => x[0] + k * step);
  return {
    x: xs,
    y: xs.map((e) => {
      while (j < x.length - 2 && x[j + 1] < e) j++;
      return y[j] + ((y[j + 1] - y[j]) * (e - x[j])) / (x[j + 1] - x[j]);
    }),
  };
}
