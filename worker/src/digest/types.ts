/** A month's digest content (ADR 0039), stored as JSON in `digests.data_json` and rendered for each recipient. */
export type DigestData = {
  /** "YYYY-MM", UTC. */
  month: string;
  /** Newest first. */
  news: DigestNews[];
  /** Spectra published in the month. */
  spectra: number;
  /** The whole collection at the end of the month. */
  totals: { spectra: number; contributors: number };
  /** New spectra per element. */
  elements: Record<string, number>;
  /** Edges that no spectrum published before the month has, with the number of new spectra that have each. */
  newEdges: { element: string; edge: string; n: number }[];
  /** Every contributor of the month, most spectra first. `spectra` holds the ones the email shows; it is empty for contributors only named in a line. */
  groups: DigestGroup[];
};

export type DigestNews = { slug: string; title: string; summary: string; published_at: string };

export type DigestEdge = { element: string; edge: string };

export type DigestGroup = {
  name: string;
  /** For /author/{slug}/; null when the contributor has no page. */
  slug: string | null;
  count: number;
  kinds: { phase: string; type: string; n: number }[];
  spectra: DigestSpectrum[];
};

export type DigestSpectrum = {
  slug: string;
  title: string;
  formula: string | null;
  type: string;
  phase: string;
  min_energy_ev: number | null;
  max_energy_ev: number | null;
  edges: DigestEdge[];
  /** The spectrum's edges that are in DigestData.newEdges. */
  newEdges: DigestEdge[];
  description: string | null;
  beam_energy_kv: number | null;
  resolution_ev: number | null;
  reference: { text: string; doi: string | null } | null;
};

/** The person an email goes to; null renders the web version, which has no address or unsubscribe link. */
export type DigestRecipient = { email: string; unsubscribeUrl: string } | null;
