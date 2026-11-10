-- Reference numbers (shown as EELSDB-0001), in publication order; a spectrum gets the next one when it is first published.
ALTER TABLE spectra ADD COLUMN accession INTEGER;
CREATE UNIQUE INDEX spectra_accession ON spectra(accession);
UPDATE spectra SET accession = (
  SELECT COUNT(*) FROM spectra p
  WHERE p.published_at IS NOT NULL
    AND (p.published_at < spectra.published_at OR (p.published_at = spectra.published_at AND p.id <= spectra.id))
) WHERE published_at IS NOT NULL;
