// Quick quantification for the spectrum page: element ratios from K and L2,3 edges by Egerton's integral method,
// with exSpy's hydrogenic cross-sections (data/fixtures/quant.json is exSpy's output for the tests).

const SYMBOLS = "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U".split(" ");
const R = 13.60569312299; // Rydberg constant times hc in eV, as scipy.constants
// Egerton's correction to the hydrogenic L cross-section, from Z = 11.
const XU = [0.82, 0.52, 0.52, 0.42, 0.3, 0.29, 0.22, 0.3, 0.22, 0.16, 0.12, 0.13, 0.13, 0.14, 0.16, 0.18, 0.19, 0.22, 0.14, 0.11, 0.12, 0.12, 0.12, 0.1, 0.1, 0.1];

/** Egerton's effective collection semi-angle (mrad) for a convergent beam, as exSpy's effective_angle. */
export function effectiveAngle(E0, E, alpha, beta) {
  if (!alpha) return beta;
  const tgt = (E0 * (1 + E0 / 1022)) / (1 + E0 / 511);
  const thetaE = E / tgt;
  const [A2, B2, T2] = [alpha * alpha * 1e-6, beta * beta * 1e-6, thetaE * thetaE * 1e-6];
  const eta1 = Math.sqrt((A2 + B2 + T2) ** 2 - 4 * A2 * B2) - A2 - B2 - T2;
  const eta2 = 2 * B2 * Math.log((0.5 / T2) * (Math.sqrt((A2 + T2 - B2) ** 2 + 4 * B2 * T2) + A2 + T2 - B2));
  const eta3 = 2 * A2 * Math.log((0.5 / T2) * (Math.sqrt((B2 + T2 - A2) ** 2 + 4 * A2 * T2) + B2 + T2 - A2));
  const F1 = (eta1 + eta2 + eta3) / 2 / A2 / Math.log(1 + B2 / T2);
  const F2 = alpha / beta > 1 ? (F1 * A2) / B2 : F1;
  return thetaE * Math.sqrt(Math.exp(F2 * Math.log(1 + B2 / T2)) - 1);
}

function gosK(Z, E, qa02) {
  const r = 13.606;
  const [zs, rnk] = Z === 1 ? [1, 1] : [Z - 0.5, 2];
  const q = qa02 / zs ** 2;
  const kh2 = E / (r * zs ** 2) - 1;
  const akh = Math.max(Math.sqrt(Math.abs(kh2)), 0.01);
  let c, d;
  if (kh2 >= 0) {
    d = 1 - Math.exp((-2 * Math.PI) / akh);
    let bp = Math.atan((2 * akh) / (q - kh2 + 1));
    if (bp < 0) bp += Math.PI;
    c = Math.exp((-2 / akh) * bp);
  } else {
    d = 1;
    c = Math.exp((-1 / akh) * Math.log((q + 1 - kh2 + 2 * akh) / (q + 1 - kh2 - 2 * akh)));
  }
  const a = ((q - kh2 + 1) ** 2 + 4 * kh2) ** 3;
  return ((((128 * rnk * E) / (r * zs ** 4)) * c) / d) * (q + kh2 / 3 + 1 / 3) / (a * r);
}

function gosL(Z, el3, el1, E, qa02) {
  const r = 13.606;
  const zs = Z - 0.35 * 7 - 1.7;
  const u = Z - 11 >= XU.length ? 0.1 : XU[Z - 11];
  const q = qa02 / zs ** 2;
  const kh2 = E / (r * zs ** 2) - 0.25;
  const akh = Math.sqrt(Math.abs(kh2));
  let c, d;
  if (kh2 >= 0) {
    d = 1 - Math.exp((-2 * Math.PI) / akh);
    let bp = Math.atan(akh / (q - kh2 + 0.25));
    if (bp < 0) bp += Math.PI;
    c = Math.exp((-2 / akh) * bp);
  } else {
    d = 1;
    c = Math.exp((-1 / akh) * Math.log((q + 0.25 - kh2 + akh) / (q + 0.25 - kh2 - akh)));
  }
  let g, a;
  if (E - el1 <= 0) {
    g =
      2.25 * q ** 4 - (0.75 + 3 * kh2) * q ** 3 + (0.59375 - 0.75 * kh2 - 0.5 * kh2 ** 2) * q * q +
      (0.11146 + 0.85417 * kh2 + 1.8833 * kh2 * kh2 + kh2 ** 3) * q + 0.0035807 + kh2 / 21.333 + (kh2 * kh2) / 4.5714 + kh2 ** 3 / 2.4 + kh2 ** 4 / 4;
    a = ((q - kh2 + 0.25) ** 2 + kh2) ** 5;
  } else {
    g = q ** 3 - ((5 / 3) * kh2 + 11 / 12) * q ** 2 + ((kh2 * kh2) / 3 + 1.5 * kh2 + 65 / 48) * q + kh2 ** 3 / 3 + 0.75 * kh2 * kh2 + (23 / 48) * kh2 + 5 / 64;
    a = ((q - kh2 + 0.25) ** 2 + kh2) ** 4;
  }
  const rf = ((E + 0.1 - el3) / 1.8 / Z / Z) ** u;
  return (((((rf * 32 * g * c) / a / d) * E) / r / r) / zs ** 4);
}

/** Adaptive Simpson integration to a relative tolerance, standing in for scipy's quad. */
function integrate(f, a, b, tol = 1e-11) {
  const simpson = (fa, fm, fb, h) => (h / 6) * (fa + 4 * fm + fb);
  const step = (a, b, fa, fm, fb, whole, depth) => {
    const m = (a + b) / 2;
    const [lm, rm] = [(a + m) / 2, (m + b) / 2];
    const [flm, frm] = [f(lm), f(rm)];
    const left = simpson(fa, flm, fm, m - a);
    const right = simpson(fm, frm, fb, b - m);
    if (depth > 40 || Math.abs(left + right - whole) <= 15 * tol * Math.abs(left + right)) return left + right + (left + right - whole) / 15;
    return step(a, m, fa, flm, fm, left, depth + 1) + step(m, b, fm, frm, fb, right, depth + 1);
  };
  const [fa, fm, fb] = [f(a), f((a + b) / 2), f(b)];
  return step(a, b, fa, fm, fb, simpson(fa, fm, fb, b - a), 0);
}

const parametrised = (k1, k2, n) => Array.from({ length: n }, (_, i) => k1 * (Math.exp((i * k2) / k1) - 1));

/**
 * exSpy's HydrogenicGOS for a K or L subshell ("K" or "L3"): the energy-differential cross-section (barn/eV/atom),
 * integrated over the scattering angles up to `angle` (mrad), at exSpy's tabulated energies.
 * onsets: { K } or { L3, L1 } in eV; E0 in kV.
 */
export function hydrogenic(Z, shell, onsets, E0, angle) {
  const isK = shell === "K";
  const onset = isK ? onsets.K : onsets.L3;
  let rel = parametrised(50, 3, 50);
  if (!isK) {
    const dL3L1 = onsets.L1 - onsets.L3;
    rel = [...rel.filter((v) => v < dL3L1), ...rel.map((v) => v + dL3L1)];
  }
  const energy = rel.map((v) => v + onset);
  const gamma = 1 + E0 / 511.06;
  const T = (511060 * (1 - 1 / gamma ** 2)) / 2;
  const s = Math.sin(angle * 1e-3 / 2) ** 2;
  const qint = energy.map((E) => {
    const qmin = E ** 2 / (4 * R * T) + E ** 3 / (8 * gamma ** 3 * R * T ** 2);
    const p02 = T / (R * (1 - (2 * T) / 511060));
    const pp2 = p02 - (E / R) * (gamma - E / 1022120);
    const qmax = qmin + 4 * Math.sqrt(p02 * pp2) * s;
    const gos = isK ? (x) => gosK(Z, E, Math.exp(x)) : (x) => gosL(Z, onsets.L3, onsets.L1, E, Math.exp(x));
    return 3.5166e8 * (R / T) * (R / E) * integrate(gos, Math.log(qmin), Math.log(qmax));
  });
  return { energy, qint };
}

/** The partial cross-section (barn/atom) from the onset to onset + delta, with exSpy's linear interpolation between energies. */
export function windowCrossSection({ energy, qint }, delta) {
  const end = energy[0] + delta;
  let sum = 0;
  for (let i = 0; i < energy.length - 1 && energy[i] < end; i++) {
    const [e0, e1] = [energy[i], Math.min(energy[i + 1], end)];
    const v1 = qint[i] + ((qint[i + 1] - qint[i]) * (e1 - energy[i])) / (energy[i + 1] - energy[i]);
    sum += ((qint[i] + v1) / 2) * (e1 - e0);
  }
  return sum;
}

/** Power law A·E^-r fitted by least squares to log counts; null where counts are not positive. */
function fitPowerLaw(x, y) {
  if (x.length < 5 || y.some((v) => !(v > 0))) return null;
  const lx = x.map(Math.log);
  const ly = y.map(Math.log);
  const n = x.length;
  const mx = lx.reduce((s, v) => s + v, 0) / n;
  const my = ly.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  lx.forEach((v, i) => {
    sxy += (v - mx) * (ly[i] - my);
    sxx += (v - mx) ** 2;
  });
  const r = -sxy / sxx;
  const lnA = my + r * mx;
  return r > 0 && Number.isFinite(lnA) ? (e) => Math.exp(lnA - r * Math.log(e)) : null;
}

/**
 * Element ratios from a core-loss spectrum by Egerton's integral method: for each K or L2,3 edge, the counts in a
 * window `delta` wide after the onset, above a power law fitted before it, divided by the hydrogenic partial
 * cross-section for that window.
 * edges: ["B_K", "Fe_L2,3", …]; table: the edge onset table; acq: { E0 (kV), alpha, beta (mrad) }.
 * Returns { elements: [{ element, edge, onset, counts, sigma, fraction }], delta, skipped: [{ edge, reason }] }, or { error }.
 */
export function quantify(x, y, edges, table, { E0, alpha = 0, beta }, { backgroundSubtracted = false } = {}) {
  if (!(E0 > 0 && beta > 0)) return { error: "needs the beam energy and the collection angle." };
  const skipped = [];
  const chosen = new Map();
  for (const code of edges) {
    const [element, edge] = code.split("_");
    const t = table[element];
    const Z = SYMBOLS.indexOf(element) + 1;
    const shell = edge === "K" ? "K" : edge === "L2,3" || edge === "L3" ? "L3" : null;
    if (!shell || !t || !Z) {
      skipped.push({ element, edge: `${element} ${edge}`, reason: "only K and L2,3 edges have hydrogenic cross-sections" });
      continue;
    }
    if (shell === "L3" && (Z < 11 || !t.L1)) {
      skipped.push({ element, edge: `${element} ${edge}`, reason: "the hydrogenic L cross-section needs an L1 onset, which the edge table lacks for this element" });
      continue;
    }
    const onset = t[shell]["onset_energy (eV)"];
    if (!(onset > x[0] && onset < x.at(-1))) {
      skipped.push({ element, edge: `${element} ${edge}`, reason: "outside the energy range of the spectrum" });
      continue;
    }
    // One edge per element: the K edge where both are in range.
    if (!chosen.has(element) || shell === "K") chosen.set(element, { element, edge, shell, Z, onset, onsets: { K: t.K?.["onset_energy (eV)"], L3: t.L3?.["onset_energy (eV)"], L1: t.L1?.["onset_energy (eV)"] } });
  }
  const list = [...chosen.values()].sort((a, b) => a.onset - b.onset);
  const step = (x.at(-1) - x[0]) / (x.length - 1);
  // One window width for every edge, so that errors in the cross-sections partly cancel: up to 50 eV, and short of
  // the next edge and the end of the data.
  let delta = 50;
  list.forEach((e, i) => {
    const next = i + 1 < list.length ? list[i + 1].onset - 5 : x.at(-1);
    delta = Math.min(delta, next - e.onset);
  });
  if (list.length < 2) return { error: "needs K or L2,3 edges of at least two elements in the spectrum.", skipped };
  if (delta < 20) return { error: "the edges are too close together, or too close to the end of the data, for a 20 eV window.", skipped };
  const out = [];
  for (const [i, e] of list.entries()) {
    const sum = (lo, hi, f) => {
      let s = 0;
      for (let k = 0; k < x.length; k++) if (x[k] >= lo && x[k] < hi) s += f(k);
      return s;
    };
    let background = () => 0;
    if (!backgroundSubtracted || i > 0) {
      // A pre-edge window up to 30 eV wide (at least 5 channels) ending 3 eV before the onset, after the previous edge.
      const lo = Math.max(e.onset - Math.max(30, 5 * step) - 3, i ? list[i - 1].onset + 3 : x[0], x[0]);
      const idx = x.map((_, k) => k).filter((k) => x[k] >= lo && x[k] <= e.onset - 3);
      const fit = fitPowerLaw(idx.map((k) => x[k]), idx.map((k) => y[k]));
      if (!fit) {
        skipped.push({ element: e.element, edge: `${e.element} ${e.edge}`, reason: "no power-law background fits before the edge" });
        continue;
      }
      background = (k) => fit(x[k]);
    }
    const counts = sum(e.onset, e.onset + delta, (k) => y[k] - background(k));
    const sigma = windowCrossSection(hydrogenic(e.Z, e.shell, e.onsets, E0, effectiveAngle(E0, e.onset, alpha, beta)), delta);
    out.push({ element: e.element, edge: e.edge, onset: e.onset, counts, sigma, n: counts / sigma });
  }
  if (out.length < 2) return { error: "fewer than two edges could be measured.", skipped };
  if (out.some((e) => !(e.n > 0))) return { error: "an edge has no counts above the background.", skipped };
  const total = out.reduce((s, e) => s + e.n, 0);
  // Other edges of an element that was measured (Co L1 beside Co L2,3) do not matter.
  const measured = new Set(out.map((e) => e.element));
  return { elements: out.map(({ n, ...e }) => ({ ...e, fraction: n / total })), delta, skipped: skipped.filter((k) => !measured.has(k.element)) };
}
