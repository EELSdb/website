/** A spectrum's reference number as people quote it: EELSDB-0042, with a fifth digit from 10000. */
export const accessionId = (n: number) => `EELSDB-${String(n).padStart(4, "0")}`;

/** The number in "EELSDB-0042" (any case, with or without the dash), or null. */
export function parseAccession(text: string) {
  const m = /^\s*eelsdb[-\s]?0*(\d+)\s*$/i.exec(text);
  return m ? Number(m[1]) : null;
}
