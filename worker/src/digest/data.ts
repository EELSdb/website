import { decodeEntities } from "../pages/entities";
import type { DigestData, DigestEdge, DigestGroup, DigestNews, DigestSpectrum } from "./types";

/** Up to this many new spectra, each gets a card; above it, tiles. */
export const FEATURE_MAX = 3;
const TILES_ONE_CONTRIBUTOR = 6;
const TILES_FIRST = 4;
const TILES_NEXT = 2;
const CONTRIBUTORS_WITH_TILES = 4;

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The first day of the month after "YYYY-MM", as "YYYY-MM-DD". */
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** The month before the one `now` is in, as "YYYY-MM". */
export const previousMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

const PUBLISHED_IN = "s.status = 'published' AND s.published_at >= ?1 AND s.published_at < ?2";

type Row = {
  id: number; slug: string; title: string; formula: string | null; type: string; phase: string; min_energy_ev: number | null; max_energy_ev: number | null;
  description: string | null; author_display: string | null; author_slug: string | null; beam_energy_kv: number | null; resolution_ev: number | null;
  doi: string | null; authors: string | null; journal: string | null; year: string | null; ref_title: string | null; freetext: string | null;
};

/** What the digest for a month holds (ADR 0039). Dates are UTC, as stored. */
export async function digestData(db: D1Database, month: string): Promise<DigestData> {
  const start = `${month}-01`;
  const end = monthEnd(month);
  const [news, spectra, edges, elements, newEdges, totals] = await db.batch<any>([
    db.prepare(`SELECT slug, title, summary, legacy_v1, published_at FROM news s WHERE ${PUBLISHED_IN} ORDER BY published_at DESC, id DESC`).bind(start, end),
    db.prepare(
      `SELECT s.id, s.slug, s.title, s.formula, s.type, s.phase, s.min_energy_ev, s.max_energy_ev, s.description, s.author_display, s.author_slug,
              a.beam_energy_kv, a.resolution_ev, r.doi, r.authors, r.journal, r.year, r.title AS ref_title, r.freetext
       FROM spectra s LEFT JOIN eels_acquisition a ON a.spectrum_id = s.id LEFT JOIN reference r ON r.spectrum_id = s.id
       WHERE ${PUBLISHED_IN} ORDER BY s.published_at, s.id`,
    ).bind(start, end),
    db.prepare(`SELECT e.spectrum_id, e.element, e.edge FROM spectrum_edges e JOIN spectra s ON s.id = e.spectrum_id WHERE ${PUBLISHED_IN} ORDER BY e.spectrum_id, e.position`).bind(start, end),
    db.prepare(
      `SELECT e.element, COUNT(DISTINCT e.spectrum_id) AS n FROM spectrum_elements e JOIN spectra s ON s.id = e.spectrum_id WHERE ${PUBLISHED_IN}
       GROUP BY e.element ORDER BY n DESC, e.element`,
    ).bind(start, end),
    db.prepare(
      `SELECT e.element, e.edge, COUNT(DISTINCT e.spectrum_id) AS n FROM spectrum_edges e JOIN spectra s ON s.id = e.spectrum_id
       WHERE ${PUBLISHED_IN} AND NOT EXISTS (
         SELECT 1 FROM spectrum_edges e2 JOIN spectra s2 ON s2.id = e2.spectrum_id
         WHERE s2.status = 'published' AND s2.published_at < ?1 AND e2.element = e.element AND e2.edge = e.edge)
       GROUP BY e.element, e.edge ORDER BY n DESC, e.element, e.edge`,
    ).bind(start, end),
    db.prepare("SELECT COUNT(*) AS spectra, COUNT(DISTINCT author_display) AS contributors FROM spectra WHERE status = 'published' AND published_at < ?").bind(end),
  ]);

  const newSet = new Set(newEdges.results.map((e: DigestEdge) => `${e.element} ${e.edge}`));
  const edgesOf = Map.groupBy(edges.results as (DigestEdge & { spectrum_id: number })[], (e) => e.spectrum_id);
  const rows = spectra.results as Row[];
  const byAuthor = [...Map.groupBy(rows, (r) => r.author_display ?? "").values()].sort((a, b) => b.length - a.length || (a[0].author_display ?? "").localeCompare(b[0].author_display ?? ""));
  const feature = rows.length <= FEATURE_MAX;

  const groups: DigestGroup[] = byAuthor.map((rs, i) => {
    const limit = feature ? rs.length : byAuthor.length === 1 ? TILES_ONE_CONTRIBUTOR : i >= CONTRIBUTORS_WITH_TILES ? 0 : i === 0 ? TILES_FIRST : TILES_NEXT;
    const kinds = [...Map.groupBy(rs, (r) => `${r.phase} ${r.type}`).values()]
      .map((k) => ({ phase: k[0].phase, type: k[0].type, n: k.length }))
      .sort((a, b) => b.n - a.n);
    return {
      name: rs[0].author_display ?? "",
      slug: rs[0].author_slug,
      count: rs.length,
      kinds,
      spectra: pick(rs, limit).map((r) => spectrum(r, edgesOf.get(r.id) ?? [], newSet)),
    };
  });

  return {
    month,
    news: news.results.map((n: DigestNews & { legacy_v1: string | null }) => ({
      slug: n.slug,
      title: n.title,
      // Archived articles keep their summary in legacy_v1 until someone saves them in the editor (ADR 0038).
      summary: n.summary || (n.legacy_v1 ? decodeEntities(JSON.parse(n.legacy_v1).description ?? "") : ""),
      published_at: n.published_at,
    })),
    spectra: rows.length,
    totals: totals.results[0],
    elements: Object.fromEntries(elements.results.map((e: { element: string; n: number }) => [e.element, e.n])),
    newEdges: newEdges.results,
    groups,
  };
}

/** The first `limit` spectra with different titles, so a series of one compound at many settings shows as one tile. */
function pick(rows: Row[], limit: number) {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    const key = r.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function spectrum(r: Row, edges: DigestEdge[], newSet: Set<string>): DigestSpectrum {
  const own = edges.map(({ element, edge }) => ({ element, edge }));
  return {
    slug: r.slug,
    title: r.title,
    formula: r.formula,
    type: r.type,
    phase: r.phase,
    min_energy_ev: r.min_energy_ev,
    max_energy_ev: r.max_energy_ev,
    edges: own,
    newEdges: own.filter((e) => newSet.has(`${e.element} ${e.edge}`)),
    description: clip(r.description),
    beam_energy_kv: r.beam_energy_kv,
    resolution_ev: r.resolution_ev,
    reference: shortReference(r),
  };
}

const DESCRIPTION_MAX = 280;

/** The description up to the last full sentence that fits, or cut with an ellipsis. */
export function clip(text: string | null) {
  const t = (text ?? "").split(/\s+/).filter(Boolean).join(" ");
  if (!t) return null;
  if (t.length <= DESCRIPTION_MAX) return t;
  const head = t.slice(0, DESCRIPTION_MAX);
  const cut = Math.max(...[...head.matchAll(/[.!?](?= )/g)].map((m) => m.index!), -1);
  return cut > 0 ? head.slice(0, cut + 1) : `${t.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

/** "Hettler et al. (2020), ACS Nano", or the free text when the reference has no author and year. */
export function shortReference(r: Pick<Row, "doi" | "authors" | "journal" | "year" | "ref_title" | "freetext">) {
  const authors = r.authors?.trim();
  let text = "";
  if (authors && (r.year || r.journal)) {
    const surname = authors.split(/ and |;|,/)[0].trim();
    const more = /[,;&]| and /.test(authors) ? " et al." : "";
    text = `${surname}${more}${r.year ? ` (${r.year})` : ""}${r.journal ? `, ${r.journal}` : ""}`;
  } else {
    text = (r.freetext || r.ref_title || "").trim() || (r.doi ? `doi:${r.doi}` : "");
    if (text.length > 110) text = `${text.slice(0, 109).trimEnd()}…`;
  }
  return text ? { text, doi: r.doi } : null;
}

export type DigestMonth = { month: string; spectra: number; news: number };

/** Every month that has ended and had news or new spectra, newest first. */
export async function digestMonths(db: D1Database, now = new Date()) {
  const { results } = await db.prepare(
    `SELECT month, SUM(spectra) AS spectra, SUM(news) AS news FROM (
       SELECT substr(published_at, 1, 7) AS month, COUNT(*) AS spectra, 0 AS news FROM spectra WHERE status = 'published' AND published_at IS NOT NULL GROUP BY 1
       UNION ALL
       SELECT substr(published_at, 1, 7), 0, COUNT(*) FROM news WHERE status = 'published' GROUP BY 1
     ) WHERE month < ? GROUP BY month ORDER BY month DESC`,
  ).bind(now.toISOString().slice(0, 7)).all<DigestMonth>();
  return results;
}

/** The digest as it went out, or for a month that never had one sent, what it holds now; null when the month had nothing new. */
export async function monthDigest(db: D1Database, month: string): Promise<DigestData | null> {
  const json = await db.prepare("SELECT data_json FROM digests WHERE month = ?").bind(month).first<string>("data_json");
  if (json) return JSON.parse(json);
  const data = await digestData(db, month);
  return data.news.length || data.spectra ? data : null;
}
