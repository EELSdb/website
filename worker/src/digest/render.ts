import { formulaTokens } from "../pages/layout";
import { SITE } from "../site";
import type { DigestData, DigestEdge, DigestGroup, DigestNews, DigestRecipient, DigestSpectrum } from "./types";

type Pair = [light: string, dark: string];

// Light / dark pairs from DESIGN.md tokens, as hex (email clients read neither oklch() nor light-dark()).
const T = {
  outer: ["#f3f1ed", "#0f0e0d"],
  bg: ["#fbfaf8", "#141312"],
  surface: ["#ffffff", "#1c1b19"],
  sunken: ["#f3f1ed", "#23211f"],
  ink: ["#1b1a19", "#ece8e2"],
  muted: ["#5d5852", "#a9a29a"],
  line: ["#e2ddd5", "#36332f"],
  rule: ["#eeeae4", "#262422"],
  accent: ["#345b80", "#98c3ec"],
  onAccent: ["#ffffff", "#141312"],
  link: ["#27527c", "#9bc9f6"],
  coreloss: ["#2769b7", "#9cc2ea"],
  lowloss: ["#cf7b00", "#e4bd81"],
  xrayabs: ["#1f8d54", "#90ceac"],
  zeroloss: ["#5d5852", "#a9a29a"],
  ptEmpty: ["#f3f1ed", "#1f1d1b"],
  ptEmptyInk: ["#bdb6ac", "#4f4a44"],
} satisfies Record<string, Pair>;

const AVATARS: Pair[] = [
  ["#cde1f5", "#2a3f54"],
  ["#f3dec1", "#543e24"],
  ["#cee9d9", "#2a4436"],
  ["#f5dad9", "#503534"],
  ["#e4ddf3", "#40384f"],
];
const PT: Pair[] = [
  ["#e7ebf0", "#2b2f32"],
  ["#d2dbe3", "#374047"],
  ["#b6c4d1", "#495765"],
  ["#95aabd", "#5c7287"],
  ["#718ca6", "#7391ad"],
  ["#345b80", "#98c3ec"],
];

const FONT = "'Mona Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TYPE_NAMES: Record<string, string> = { coreloss: "Core loss", lowloss: "Low loss", zeroloss: "Zero loss", xrayabs: "X-ray absorption" };
const TYPE_ADJ: Record<string, string> = { coreloss: "core-loss", lowloss: "low-loss", zeroloss: "zero-loss", xrayabs: "X-ray absorption" };
const typeName = (t: string) => TYPE_NAMES[t] ?? t;
const typeAdj = (t: string) => TYPE_ADJ[t] ?? t;
const typeColor = (t: string): Pair => (T as Record<string, Pair>)[t] ?? T.muted;

// Class -> [property, dark value][]. Light values are inline; these rules flip them where clients honour dark-mode CSS.
const DARK: Record<string, [string, string][]> = {
  "o-bg": [["background-color", T.outer[1]]],
  "p-bg": [["background-color", T.bg[1]]],
  "s-bg": [["background-color", T.surface[1]]],
  "k-bg": [["background-color", T.sunken[1]]],
  ink: [["color", T.ink[1]]],
  mut: [["color", T.muted[1]]],
  lnk: [["color", T.link[1]]],
  "b-line": [["border-color", T.line[1]]],
  "b-rule": [["border-color", T.rule[1]]],
  btn: [
    ["background-color", T.accent[1]],
    ["border-color", T.accent[1]],
  ],
  "btn-t": [["color", T.onAccent[1]]],
  btn2: [["border-color", T.accent[1]]],
  "btn2-t": [["color", T.link[1]]],
  pte: [
    ["background-color", T.ptEmpty[1]],
    ["color", T.ptEmptyInk[1]],
  ],
  ...Object.fromEntries(
    PT.map(([, d], i): [string, [string, string][]] => [
      `pt${i + 1}`,
      [
        ["background-color", d],
        ["color", i >= 4 ? T.onAccent[1] : T.ink[1]],
      ],
    ]),
  ),
  ...Object.fromEntries(
    AVATARS.map(([, d], i): [string, [string, string][]] => [
      `av${i}`,
      [
        ["background-color", d],
        ["color", T.ink[1]],
      ],
    ]),
  ),
  ...Object.fromEntries(Object.keys(TYPE_NAMES).map((k): [string, [string, string][]] => [`d-${k}`, [["color", typeColor(k)[1]]]])),
};

const cssRules = (prefix = "") =>
  Object.entries(DARK)
    .map(([c, props]) => `${prefix}.${c}{${props.map(([p, v]) => `${p}:${v}!important`).join(";")}}`)
    .join("");

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
const e = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const n0 = (n: number) => n.toLocaleString("en-US");
const SUB = 'style="font-size:72%;line-height:0"';

function formulaHtml(formula: string | null) {
  if (!formula) return "";
  return formulaTokens(formula)
    .map(([kind, v]) => {
      if (kind === "sub") return `<sub ${SUB}>${e(v)}</sub>`;
      if (kind === "sup") return `<sup ${SUB}>${e(v)}</sup>`;
      if (kind === "var") return `<sub ${SUB}><i>${e(v)}</i></sub>`;
      return e(v).replaceAll(".", "&middot;");
    })
    .join("");
}

const plainFormula = (formula: string | null) => (formula ? formulaTokens(formula).map(([, v]) => v).join("") : "");

const edgeHtml = (x: DigestEdge) => `${e(x.element)} ${e(x.edge[0] ?? "")}` + (x.edge.length > 1 ? `<sub ${SUB}>${e(x.edge.slice(1))}</sub>` : "");
const edgeText = (x: DigestEdge) => `${x.element} ${x.edge}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`;
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const words = (n: number) => (n < 10 ? WORDS[n] : n0(n));

function listing(names: string[], cap = 3) {
  if (names.length > cap) names = [...names.slice(0, cap - 1), `${names.length - cap + 1} others`];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function kindsText(kinds: DigestGroup["kinds"], count: number) {
  if (kinds.length > 2) return plural(count, "spectrum", "spectra");
  const parts = kinds.map((k) => `${n0(k.n)} ${k.phase !== "solid" ? `${k.phase}-phase ` : ""}${typeAdj(k.type)}`);
  return parts.join(" and ") + (count === 1 ? " spectrum" : " spectra");
}

function ev(x: number) {
  return Math.abs(x) >= 100 ? Math.round(x).toLocaleString("en-US") : x.toFixed(1).replace(/\.0$/, "");
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

function newsDate(published: string) {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(published) ? published : `${published.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? published : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const PERIODIC = `H . . . . . . . . . . . . . . . . He
Li Be . . . . . . . . . . B C N O F Ne
Na Mg . . . . . . . . . . Al Si P S Cl Ar
K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr
Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe
Cs Ba * Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn
Fr Ra * Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og`;
const FBLOCK = `. . La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu .
. . Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr .`;

function periodicTable(counts: Record<string, number>) {
  const mx = Math.max(...Object.values(counts));
  const rows = PERIODIC.split("\n").map((r) => r.split(" "));
  const fRows = FBLOCK.split("\n").map((r) => r.split(" "));
  const blank = Array<string>(18).fill(".");
  if (fRows.some((r) => r.some((s) => counts[s]))) rows.push(blank, ...fRows);
  const cell = "padding:3px 0 2px 3px;vertical-align:top;border-radius:3px;font-size:11px;line-height:13px;height:26px;font-weight:600";
  const out = [`<table role="presentation" class="pt" width="100%" cellpadding="0" cellspacing="2" style="table-layout:fixed;border-collapse:separate;font-family:${FONT}">`];
  for (const r of rows) {
    if (r === blank) {
      out.push('<tr><td colspan="18" style="height:4px;font-size:0;line-height:0">&nbsp;</td></tr>');
      continue;
    }
    out.push("<tr>");
    for (const s of r) {
      const n = counts[s] ?? 0;
      if (s === ".") out.push("<td></td>");
      else if (s === "*") out.push(`<td class="b-line" style="border:1px dashed ${T.line[0]};border-radius:3px"></td>`);
      else if (n) {
        const step = mx > 1 ? Math.min(6, 1 + Math.floor((Math.log(n) / Math.log(mx)) * 5.999)) : 6;
        const bg = PT[step - 1][0];
        const fg = step >= 5 ? T.onAccent[0] : T.ink[0];
        out.push(`<td class="pt${step}" bgcolor="${bg}" style="${cell};background-color:${bg};color:${fg}">${e(s)}<span class="ptn" style="display:block;text-align:right;padding-right:3px;font-size:8px;line-height:9px;font-weight:500">${n0(n)}</span></td>`);
      } else out.push(`<td class="pte" bgcolor="${T.ptEmpty[0]}" style="${cell};font-weight:500;background-color:${T.ptEmpty[0]};color:${T.ptEmptyInk[0]}">${e(s)}</td>`);
    }
    out.push("</tr>");
  }
  out.push("</table>");
  const ramp = PT.map(([c], i) => `<td class="pt${i + 1}" bgcolor="${c}" width="16" style="background-color:${c};border-radius:2px;font-size:0;line-height:0">&nbsp;</td><td width="2" style="font-size:0">&nbsp;</td>`).join("");
  const key =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>` +
    `<td class="mut" style="font-size:12px;line-height:16px;color:${T.muted[0]};padding-right:8px;white-space:nowrap">New spectra per element</td>` +
    `<td class="mut" style="font-size:12px;color:${T.muted[0]};padding-right:6px">1</td>` +
    `<td><table role="presentation" cellpadding="0" cellspacing="0"><tr style="height:10px">${ramp}</tr></table></td>` +
    `<td class="mut" style="font-size:12px;color:${T.muted[0]};padding-left:4px">${n0(mx)}</td></tr></table>`;
  return out.join("") + key;
}

function button(href: string, label: string, secondary = false) {
  const c = T.accent[0];
  const [cls, fill, fg] = secondary ? ["btn2", "", T.link[0]] : ["btn", ` bgcolor="${c}"`, T.onAccent[0]];
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="${cls}"${fill} style="${secondary ? "" : `background-color:${c};`}border:1px solid ${c};border-radius:4px;mso-padding-alt:10px 18px">` +
    `<a class="${cls}-t" href="${e(href)}" style="display:inline-block;padding:10px 18px;mso-padding-alt:0;font-family:${FONT};font-size:15px;line-height:18px;font-weight:600;color:${fg};text-decoration:none;white-space:nowrap">${e(label)}</a>` +
    "</td></tr></table>"
  );
}

function typeDot(type: string) {
  return `<span class="d-${e(type)}" style="color:${typeColor(type)[0]}">&#9679;</span>&nbsp;${e(typeName(type))}`;
}

const formulaSpan = (formula: string | null) => (formula ? [`<span class="ink" style="color:${T.ink[0]};font-weight:500">${formulaHtml(formula)}</span>`] : []);
const spectrumUrl = (t: DigestSpectrum) => `${SITE}/spectra/${encodeURIComponent(t.slug)}/`;
const authorUrl = (slug: string) => `${SITE}/author/${encodeURIComponent(slug)}/`;
const range = (t: DigestSpectrum) => (t.min_energy_ev != null && t.max_energy_ev != null ? `${ev(t.min_energy_ev)}–${ev(t.max_energy_ev)} eV` : "");

function tile(t: DigestSpectrum) {
  const url = spectrumUrl(t);
  const meta = [...formulaSpan(t.formula), typeDot(t.type)];
  const edges = t.edges.map(edgeText).join(", ") || "no edge";
  const rounded = t.min_energy_ev != null && t.max_energy_ev != null ? `${Math.round(t.min_energy_ev)}–${Math.round(t.max_energy_ev)} eV` : "";
  const alt = [`${t.title}: ${typeName(t.type).toLowerCase()} spectrum`, edges, rounded].filter(Boolean).join(", ");
  return (
    `<table role="presentation" class="s-bg b-line" width="100%" cellpadding="0" cellspacing="0" style="background-color:${T.surface[0]};border:1px solid ${T.line[0]};border-radius:6px;border-collapse:separate;table-layout:fixed">` +
    `<tr><td style="padding:11px 13px 0">` +
    `<a class="ink" href="${url}" style="display:block;color:${T.ink[0]};text-decoration:none;font-size:15px;line-height:20px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(t.title)}</a>` +
    `<div class="mut" style="color:${T.muted[0]};font-size:13px;line-height:19px;padding-top:1px">${meta.join(" &middot; ")}</div>` +
    `</td></tr><tr><td style="padding:6px 0 0"><a href="${url}"><img src="${SITE}/og/digest/tile/${encodeURIComponent(t.slug)}.png" width="258" alt="${e(alt)}" style="display:block;width:100%;max-width:258px;height:auto;border:0;border-radius:0 0 5px 5px;font-size:12px;color:${T.muted[0]}"></a></td></tr></table>`
  );
}

function tilesGrid(ts: DigestSpectrum[]) {
  const out = ['<!--[if mso]><table role="presentation" width="532" cellpadding="0" cellspacing="0"><tr><![endif]-->'];
  ts.forEach((t, i) => {
    const left = i % 2 === 0;
    if (i && left) out.push("<!--[if mso]></tr><tr><![endif]-->");
    out.push(`<!--[if mso]><td width="260" valign="top" style="padding:0 ${left ? 12 : 0}px 12px 0"><![endif]-->`);
    out.push(`<div class="tile" style="display:inline-block;width:100%;max-width:260px;vertical-align:top;margin:0 ${left ? 12 : 0}px 12px 0;text-align:left;font-size:15px">${tile(t)}</div>`);
    out.push("<!--[if mso]></td><![endif]-->");
  });
  out.push("<!--[if mso]></tr></table><![endif]-->");
  return out.join("");
}

function initials(name: string) {
  const parts = name.split(/[\s-]+/).filter((p) => /^\p{L}/u.test(p));
  if (!parts.length) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function groupBlock(g: DigestGroup, i: number, multi: boolean) {
  const av = AVATARS[i % 5][0];
  const name = g.slug ? `<a class="ink" href="${authorUrl(g.slug)}" style="color:${T.ink[0]};text-decoration:none">${e(g.name)}</a>` : e(g.name);
  const more =
    multi && g.count > g.spectra.length
      ? `<p style="margin:0 0 4px;font-size:14px;line-height:20px"><a class="lnk" href="${e(`${SITE}/spectra/?author=${encodeURIComponent(g.slug ?? g.name)}`)}" style="color:${T.link[0]};font-weight:600;text-decoration:none">See all ${n0(g.count)} from ${e(g.name)}</a></p>`
      : "";
  return (
    `<tr><td class="px" style="padding:22px 32px 12px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td width="34" height="34" align="center" class="av${i % 5}" bgcolor="${av}" style="width:34px;height:34px;background-color:${av};border-radius:17px;font-size:13px;font-weight:600;color:${T.ink[0]};line-height:34px">${e(initials(g.name))}</td>` +
    `<td style="padding-left:12px"><div class="ink" style="font-size:16px;line-height:21px;font-weight:600;color:${T.ink[0]}">${name}</div>` +
    `<div class="mut" style="font-size:14px;line-height:20px;color:${T.muted[0]}">${e(kindsText(g.kinds, g.count))}</div></td>` +
    `</tr></table></td></tr>` +
    `<tr><td class="px tiles" align="left" style="padding:0 32px;font-size:0">${tilesGrid(g.spectra)}${more}</td></tr>`
  );
}

const FEATURE_MAX = 3;
const TABLE_MIN_ELEMENTS = 6;

function featureCard(t: DigestSpectrum, g: DigestGroup, primary: boolean) {
  const url = spectrumUrl(t);
  const meta = [...formulaSpan(t.formula), typeDot(t.type)];
  if (t.phase && t.phase !== "solid") meta.push(`${e(t.phase[0].toUpperCase() + t.phase.slice(1))} phase`);
  const firsts = t.newEdges
    .map((x) => `<span class="k-bg ink" style="display:inline-block;background-color:${T.sunken[0]};color:${T.ink[0]};border-radius:999px;padding:2px 10px;margin:8px 4px 0 0;font-size:13px;line-height:18px;font-weight:600">First ${edgeHtml(x)} spectrum on EELSdb</span>`)
    .join("");
  const rows: [string, string][] = [];
  if (t.edges.length) rows.push(["Edges", t.edges.map(edgeHtml).join(", ")]);
  if (range(t)) rows.push(["Energy range", e(range(t))]);
  if (t.resolution_ev) rows.push(["Resolution", `${e(ev(t.resolution_ev))} eV`]);
  if (t.beam_energy_kv) rows.push(["Beam energy", `${e(ev(t.beam_energy_kv))} kV`]);
  if (g.name) rows.push(["Shared by", g.slug ? `<a class="lnk" href="${authorUrl(g.slug)}" style="color:${T.link[0]};text-decoration:none">${e(g.name)}</a>` : e(g.name)]);
  if (t.reference?.text) {
    const doi = t.reference.doi ? ` <a class="lnk" href="${e(`https://doi.org/${t.reference.doi}`)}" style="color:${T.link[0]};text-decoration:none">doi:${e(t.reference.doi)}</a>` : "";
    rows.push(["Reference", e(t.reference.text) + doi]);
  }
  const details = rows
    .map(
      ([k, v]) =>
        `<tr><td class="mut b-rule dl" width="112" valign="top" style="width:112px;padding:7px 12px 7px 0;border-top:1px solid ${T.rule[0]};font-size:14px;line-height:20px;color:${T.muted[0]};white-space:nowrap">${k}</td>` +
        `<td class="ink b-rule" valign="top" style="padding:7px 0;overflow-wrap:anywhere;word-break:break-word;border-top:1px solid ${T.rule[0]};font-size:14px;line-height:20px;color:${T.ink[0]}">${v}</td></tr>`,
    )
    .join("");
  const desc = t.description ? `<p class="ink" style="margin:0 0 14px;font-size:15px;line-height:23px;color:${T.ink[0]}">${e(t.description)}</p>` : "";
  const action = primary ? button(url, "Open the spectrum") : `<a class="lnk" href="${url}" style="font-size:15px;font-weight:600;color:${T.link[0]};text-decoration:none">Open the spectrum</a>`;
  const edges = t.edges.map(edgeText).join(", ") || "no edges marked";
  const alt = [`Plot of ${t.title}: ${typeName(t.type).toLowerCase()} spectrum`, edges, range(t)].filter(Boolean).join(", ");
  return (
    `<tr><td class="px" style="padding:22px 32px 0">` +
    `<table role="presentation" class="s-bg b-line" width="100%" cellpadding="0" cellspacing="0" style="background-color:${T.surface[0]};border:1px solid ${T.line[0]};border-radius:6px;border-collapse:separate;table-layout:fixed">` +
    `<tr><td class="cp" style="padding:18px 20px 0">` +
    `<a class="ink" href="${url}" style="font-size:20px;line-height:25px;font-weight:600;letter-spacing:-0.015em;color:${T.ink[0]};text-decoration:none">${e(t.title)}</a>` +
    `<div class="mut" style="padding-top:3px;font-size:14px;line-height:20px;color:${T.muted[0]}">${meta.join(" &middot; ")}</div>${firsts}` +
    `</td></tr>` +
    `<tr><td style="padding:14px 0 0"><a href="${url}"><img src="${SITE}/og/digest/plot/${encodeURIComponent(t.slug)}.png" width="532" alt="${e(alt)}" style="display:block;width:100%;max-width:532px;height:auto;border:0;font-size:13px;color:${T.muted[0]}"></a></td></tr>` +
    `<tr><td class="cp" style="padding:16px 20px 20px">${desc}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">${details}</table>${action}</td></tr>` +
    `</table></td></tr>`
  );
}

const INTRO = "News and new spectra from EELSdb, the open database of electron energy-loss and X-ray absorption spectra.";
const WHY = "A monthly digest of new spectra and news sent to registered users";
const SETTINGS = `${SITE}/account/settings/emails/#digest`;
const BROWSE_ALL = `${SITE}/spectra/?sort=published_at&order=desc`;

const PREFIX = "EELSdb digest: ";
const NEWS_SUBJECT_MAX = 60;

const sentence = (x: string) => {
  x = x.trim();
  return /[.?!]$/.test(x) ? x : `${x}.`;
};

type Used = "news" | "spectra" | "counts";

function spectraSentence(d: DigestData, featured: DigestSpectrum[], names: string[]) {
  const n = d.spectra;
  if (!n) return "";
  const ks = new Map(d.groups.flatMap((g) => g.kinds).map((k) => [`${k.phase}\0${k.type}`, k]));
  let adj = "";
  if (ks.size === 1) {
    const [k] = ks.values();
    adj = (k.phase && k.phase !== "solid" ? `${k.phase}-phase ` : "") + typeAdj(k.type) + " ";
  }
  if (n === 1 && featured[0]) {
    const t = featured[0];
    let s = `One new ${adj}spectrum` + (t.formula ? ` of ${plainFormula(t.formula)}` : `, ${t.title}`) + `, shared by ${names[0]}.`;
    if (t.newEdges.length) s += ` It is the first spectrum of the ${listing(t.newEdges.map(edgeText))} ${t.newEdges.length === 1 ? "edge" : "edges"} on EELSdb.`;
    return s;
  }
  const s = `${words(n)} new ${adj}spectra from ${listing(names)}`;
  const first = d.newEdges[0];
  if (first) return `${s}, including the first ${first.element} ${first.edge} ${first.n === 1 ? "spectrum" : "spectra"} on EELSdb.`;
  const titles = d.groups.flatMap((g) => g.spectra.map((t) => t.title)).slice(0, 3);
  return `${s}${n <= 3 ? ": " : ", including "}${listing(titles)}.`;
}

function subjectLine(d: DigestData, featured: DigestSpectrum[]): [string, Used] {
  const n = d.spectra;
  const month = monthName(d.month);
  const joined = d.news.length ? listing(d.news.map((a) => a.title), 99) : "";
  if (joined && joined.length <= NEWS_SUBJECT_MAX) return [PREFIX + joined, "news"];
  const titles = featured.length ? listing(featured.map((t) => t.title)) : "";
  if (!d.news.length && titles && titles.length <= 50) return [PREFIX + titles, "spectra"];
  if (!n) return [`${PREFIX}${month} news`, "counts"];
  let head = `${plural(n, "new spectrum", "new spectra")} in ${month}`;
  if (d.news.length) head = `${d.news.length === 1 ? "News" : `${d.news.length} news articles`} and ${head}`;
  return [PREFIX + head, "counts"];
}

function previewText(d: DigestData, used: Used, featured: DigestSpectrum[], names: string[], limit = 150) {
  const items = used === "news" ? [] : d.news.map((a) => sentence(a.title));
  const s = spectraSentence(d, featured, names);
  if (s) items.push(s);
  items.push(...d.news.map((a) => a.summary));
  let out = items[0] ?? "";
  for (const x of items.slice(1)) {
    if (out.length + 1 + x.length > limit) break;
    out += ` ${x}`;
  }
  return out;
}

function newsItem(a: DigestNews, i: number) {
  const url = `${SITE}/news/${encodeURIComponent(a.slug)}/`;
  return (
    `<tr><td class="px" style="padding:${i === 0 ? 24 : 40}px 32px 0">` +
    `<h1 class="h1 ink" style="margin:0;font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.025em"><a class="ink" href="${url}" style="color:${T.ink[0]};text-decoration:none">${e(a.title)}</a></h1>` +
    `<p class="mut" style="margin:4px 0 0;font-size:14px;line-height:20px;color:${T.muted[0]}">News &middot; ${e(newsDate(a.published_at))}</p>` +
    `<p class="ink" style="margin:12px 0 18px;font-size:16px;line-height:25px;color:${T.ink[0]}">${e(a.summary)}</p>` +
    `${button(url, "Read the article")}` +
    `</td></tr>`
  );
}

const RULE = `<tr><td class="px" style="padding:32px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="b-rule" style="border-top:1px solid ${T.rule[0]};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`;
const SHARE =
  `<tr><td class="px" style="padding:36px 32px 0">` +
  `<table role="presentation" class="k-bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.sunken[0]}" style="background-color:${T.sunken[0]};border-radius:8px"><tr><td class="cp" style="padding:20px 22px">` +
  `<p class="ink" style="margin:0;font-size:17px;line-height:24px;font-weight:600;color:${T.ink[0]}">Have spectra of your own?</p>` +
  `<p class="mut" style="margin:4px 0 14px;font-size:15px;line-height:22px;color:${T.muted[0]}">Upload a file in your browser. Your name stays on every spectrum you share.</p>` +
  `${button(`${SITE}/submit-data/`, "Share your spectra", true)}` +
  `</td></tr></table></td></tr>`;

export function renderDigest(d: DigestData, to: DigestRecipient): { subject: string; preheader: string; html: string; text: string } {
  const n = d.spectra;
  const month = monthName(d.month);
  const news = d.news;
  const groups = d.groups.filter((g) => g.spectra.length);
  const rest = d.groups.filter((g) => !g.spectra.length);
  const names = d.groups.map((g) => g.name);
  const multi = d.groups.length > 1;
  const feature = n <= FEATURE_MAX;
  const shown = groups.reduce((s, g) => s + g.spectra.length, 0);
  const featured = feature ? groups.flatMap((g) => g.spectra.map((t): [DigestSpectrum, DigestGroup] => [t, g])) : [];
  const featuredSpectra = featured.map(([t]) => t);

  const [subject, used] = subjectLine(d, featuredSpectra);
  const preheader = previewText(d, used, featuredSpectra, names);
  const h1 = `${words(n)} new ${n === 1 ? "spectrum" : "spectra"} in ${month}`;
  const totals = `EELSdb now has ${n0(d.totals.spectra)} spectra from ${n0(d.totals.contributors)} contributors.`;
  const lede = feature ? totals : `Shared by ${listing(names)}. ${totals}`;

  const chips = d.newEdges
    .slice(0, 12)
    .map((x) => `<span class="k-bg ink" style="display:inline-block;background-color:${T.sunken[0]};color:${T.ink[0]};border-radius:999px;padding:3px 10px;margin:0 4px 6px 0;font-size:13px;line-height:18px;font-weight:600;white-space:nowrap">${edgeHtml(x)}&nbsp;<span class="mut" style="color:${T.muted[0]};font-weight:500">${n0(x.n)}</span></span>`)
    .join("");
  const edgesBlock =
    d.newEdges.length && !feature
      ? `<tr><td class="px" style="padding:22px 32px 0"><p class="ink" style="margin:0 0 8px;font-size:15px;line-height:22px;color:${T.ink[0]}">First spectra of ${d.newEdges.length === 1 ? "this edge" : "these edges"} on EELSdb:</p>${chips}</td></tr>`
      : "";
  const also = rest.length
    ? `<tr><td class="px mut" style="padding:4px 32px 0;font-size:14px;line-height:21px;color:${T.muted[0]}">Also shared this month: ${rest
        .map((g) => `${g.slug ? `<a class="lnk" href="${authorUrl(g.slug)}" style="color:${T.link[0]};text-decoration:none">${e(g.name)}</a>` : e(g.name)}&nbsp;(${g.count})`)
        .join(", ")}.</td></tr>`
    : "";
  const cta = n > shown ? `<tr><td class="px" style="padding:16px 32px 4px">${button(BROWSE_ALL, `Browse all ${n0(n)} new spectra`)}</td></tr>` : "";
  const ptRow = Object.keys(d.elements).length >= TABLE_MIN_ELEMENTS ? `<tr><td class="px" style="padding:22px 30px 0">${periodicTable(d.elements)}</td></tr>` : "";
  const items = feature ? featured.map(([t, g]) => featureCard(t, g, n === 1)).join("") : groups.map((g, i) => groupBlock(g, i, multi)).join("");

  const newsHtml = news.map(newsItem).join("") + (news.length && n ? RULE : "");
  const spectraHtml = n
    ? `<tr><td class="px" style="padding:${news.length ? 28 : 22}px 32px 0">` +
      `<h1 class="h1 ink" style="margin:0;font-size:${news.length ? 26 : 28}px;line-height:${news.length ? 32 : 34}px;font-weight:700;letter-spacing:-0.025em;color:${T.ink[0]}">${e(h1)}</h1>` +
      `<p class="mut" style="margin:8px 0 0;font-size:16px;line-height:24px;color:${T.muted[0]}">${e(lede)}</p>` +
      `</td></tr>${ptRow}${edgesBlock}${items}${also}${cta}`
    : "";

  const settingsLink = `<a class="mut" href="${SETTINGS}" style="color:${T.muted[0]};text-decoration:underline">Email settings</a>`;
  const footerLinks = [
    ...(to ? [`<a class="mut" href="${e(to.unsubscribeUrl)}" style="color:${T.muted[0]};text-decoration:underline">Unsubscribe</a>`] : []),
    settingsLink,
    ...(to ? [`<a class="mut" href="${SITE}/digest/${e(d.month)}/" style="color:${T.muted[0]};text-decoration:underline">View in a browser</a>`] : []),
  ].join(" &nbsp;&middot;&nbsp; ");

  const spacer = "&#8199;&#65279;&#847; ".repeat(60);
  const ogsc = cssRules("[data-ogsc] ").replace(/\[data-ogsc\] \.(p-bg|o-bg|s-bg)/g, "[data-ogsb] .$1");
  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>body,table,td,a,p,h1,h2,div,span{font-family:'Segoe UI',Arial,sans-serif!important}.pt td{font-size:8pt!important}</style><![endif]-->
<!--[if !mso]><!--><style>@font-face{font-family:'Mona Sans';font-weight:200 900;font-display:swap;src:url(${SITE}/fonts/mona-sans-latin-wght-normal.woff2) format('woff2')}</style><!--<![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{mso-table-lspace:0;mso-table-rspace:0}
img{-ms-interpolation-mode:bicubic}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
.logo-d{display:none}
@media (max-width:620px){
.px{padding-left:20px!important;padding-right:20px!important}
.h1{font-size:24px!important;line-height:29px!important}
.tile{max-width:100%!important;margin-right:0!important}
.tile img{max-width:100%!important}
.pt td{font-size:9px!important;height:18px!important;padding:2px 0 0 2px!important}
.ptn{display:none!important}
.cp{padding-left:14px!important;padding-right:14px!important}
.dl{width:92px!important}
}
@media (prefers-color-scheme:dark){
${cssRules()}
.logo-l{display:none!important}.logo-d{display:block!important}
}
${ogsc}
</style>
</head>
<body class="o-bg" style="margin:0;padding:0;background-color:${T.outer[0]};font-variant-numeric:tabular-nums">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${e(preheader)}${spacer}</div>
<table role="presentation" class="o-bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.outer[0]}" style="background-color:${T.outer[0]}">
<tr><td align="center" style="padding:24px 10px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" class="p-bg b-line" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:${T.bg[0]};border:1px solid ${T.line[0]};border-radius:8px;border-collapse:separate;font-family:${FONT};color:${T.ink[0]}">
<tr><td class="px" style="padding:32px 32px 24px">
<a href="${SITE}/"><img class="logo-l" src="${SITE}/email/logo-light.png" width="208" alt="EELSdb" style="display:block;width:208px;height:auto;border:0;font-size:32px;line-height:40px;font-weight:700;color:${T.ink[0]}"><!--[if !mso]><!--><img class="logo-d" src="${SITE}/email/logo-dark.png" width="208" alt="EELSdb" style="width:208px;height:auto;border:0;mso-hide:all"><!--<![endif]--></a>
<p class="ink" style="margin:22px 0 0;font-size:17px;line-height:26px;color:${T.ink[0]}">${e(INTRO).replace("X-ray", '<span style="white-space:nowrap">X-ray</span>')}</p>
<p class="mut" style="margin:6px 0 0;font-size:15px;line-height:23px;color:${T.muted[0]}">${e(WHY)} (<a class="mut" href="${SETTINGS}" style="color:${T.muted[0]};text-decoration:underline">settings</a>).</p>
</td></tr>
<tr><td class="px" style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="b-rule" style="border-top:1px solid ${T.rule[0]};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
${newsHtml}
${spectraHtml}
${SHARE}
<tr><td class="px" style="padding:32px 32px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="b-rule mut" style="border-top:1px solid ${T.rule[0]};padding-top:20px;font-size:13px;line-height:20px;color:${T.muted[0]}">
${to ? `<p style="margin:0 0 8px">Sent to ${e(to.email)}.</p>\n` : ""}<p style="margin:0 0 8px">${footerLinks}</p>
<p style="margin:0">EELS Data Base &middot; <a class="mut" href="${SITE}/" style="color:${T.muted[0]};text-decoration:none">eelsdb.eu</a> &middot; Open reference spectra for EELS and XAS.</p>
</td></tr></table>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>
`;

  return { subject, preheader, html, text: textVersion(d, to, h1, lede, groups, rest, featured) };
}

function textVersion(d: DigestData, to: DigestRecipient, h1: string, lede: string, groups: DigestGroup[], rest: DigestGroup[], featured: [DigestSpectrum, DigestGroup][]) {
  const n = d.spectra;
  const footer = [
    "Have spectra of your own? Upload a file in your browser. Your name stays on every spectrum you share.",
    `Share your spectra: ${SITE}/submit-data/`,
    "",
    "-- ",
    ...(to ? [`Sent to ${to.email}.`, `Unsubscribe: ${to.unsubscribeUrl}`] : []),
    `Email settings: ${SETTINGS}`,
  ];
  const lines = [INTRO, `${WHY} (settings: ${SETTINGS}).`, "", ""];
  for (const a of d.news) lines.push(a.title, "=".repeat(Math.min(a.title.length, 72)), `News, ${newsDate(a.published_at)}`, "", a.summary, `Read the article: ${SITE}/news/${a.slug}/`, "", "");
  if (!n) return [...lines, ...footer].join("\n") + "\n";
  lines.push(h1, "=".repeat(h1.length), "", lede, "");
  if (featured.length) {
    for (const [t, g] of featured) {
      const phase = t.phase && t.phase !== "solid" ? `${t.phase[0].toUpperCase() + t.phase.slice(1)} phase` : null;
      lines.push(t.title, "-".repeat(t.title.length), [plainFormula(t.formula), typeName(t.type), phase].filter(Boolean).join(" · "));
      lines.push(...t.newEdges.map((x) => `First ${edgeText(x)} spectrum on EELSdb`));
      if (t.description) lines.push("", t.description);
      lines.push("");
      if (t.edges.length) lines.push(`Edges: ${t.edges.map(edgeText).join(", ")}`);
      if (range(t)) lines.push(`Energy range: ${range(t)}`);
      if (t.resolution_ev) lines.push(`Resolution: ${ev(t.resolution_ev)} eV`);
      if (t.beam_energy_kv) lines.push(`Beam energy: ${ev(t.beam_energy_kv)} kV`);
      if (g.name) lines.push(`Shared by: ${g.name}`);
      if (t.reference?.text) lines.push(`Reference: ${t.reference.text}${t.reference.doi ? ` https://doi.org/${t.reference.doi}` : ""}`);
      lines.push(`Open the spectrum: ${spectrumUrl(t)}`, "");
    }
    return [...lines, ...footer].join("\n") + "\n";
  }
  const entries = Object.entries(d.elements);
  const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) lines.push(`Elements: ${top.map(([k, v]) => `${k} ${n0(v)}`).join(", ")}${entries.length > 10 ? " …" : ""}`, "");
  if (d.newEdges.length) lines.push(`First spectra of these edges on EELSdb: ${d.newEdges.slice(0, 12).map((x) => `${edgeText(x)} (${x.n})`).join(", ")}`, "");
  for (const g of groups) {
    lines.push(`${g.name}: ${kindsText(g.kinds, g.count)}`);
    for (const t of g.spectra) lines.push(`  - ${t.title} (${typeName(t.type)}): ${spectrumUrl(t)}`);
    lines.push("");
  }
  if (rest.length) lines.push(`Also shared this month: ${rest.map((g) => `${g.name} (${g.count})`).join(", ")}`, "");
  if (n > groups.reduce((s, g) => s + g.spectra.length, 0)) lines.push(`Browse all ${n0(n)} new spectra: ${BROWSE_ALL}`, "");
  return [...lines, ...footer].join("\n") + "\n";
}
