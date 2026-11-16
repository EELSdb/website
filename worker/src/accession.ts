/** A spectrum's reference number as people quote it: EELSDB-0042, with a fifth digit from 10000. */
export const accessionId = (n: number) => `EELSDB-${String(n).padStart(4, "0")}`;

/** Another spectrum as the site names it: "Diamond (EELSDB-0018)", or the title alone before it has a number. */
export const spectrumName = (title: string, accession: number | null | undefined) => (accession ? `${title} (${accessionId(accession)})` : title);

/** The number in "EELSDB-0042" (any case, with or without the dash), or null. */
export function parseAccession(text: string) {
  const m = /^\s*eelsdb[-\s]?0*(\d+)\s*$/i.exec(text);
  return m ? Number(m[1]) : null;
}
