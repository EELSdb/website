---
title: "0015. Processed versions"
description: "Processed versions of a measurement are extra files on one spectrum, not separate spectra."
adr:
  date: 2026-10-21
---

## Context

The Corex gas-phase files ([ADR 0024](/docs/adr/0024-scope-gas-phase-and-xas/)) carry several versions of one measurement:

- Raw counts, with calibration and glitch removal only.
- Oscillator strength, derived with factors that users may want to change.
- In about 10% of files, also impurity-removed, raw-smoothed or oscillator-strength-smoothed versions.

A separate spectrum for each version would repeat all metadata five times.

EELS contributors often have the same spectrum as raw data and background subtracted.

## Decision

- Processed versions are `files` rows with role `variant` and a fixed code: `os`, `os_smoothed`, `smoothed`, `impurity_removed`, `raw`.
- A spectrum is sent as raw data, background subtracted, or both. With both, the background-subtracted file is the main file, because readers expect to see it plotted, and the raw data is the `raw` variant.
- `treatment.background_subtracted` records whether the main file is background subtracted: 1, 0, or NULL when not stated (every legacy spectrum). The spectrum page and API v2 show it.
- The submit form asks "This file is" under the plot of each file: Raw data, Background subtracted, one choice for each processed version, Other (with a comment), Companion low-loss (for thickness), Companion file (beam settings), or Leave out.
  - The form guesses Background subtracted when a spectrum in counts has negative values, and Raw data otherwise.
  - The choice for the main file sets the Background subtracted field of the treatment step. A contributor without JavaScript sets that field by hand.
- The spectrum's `intensity_units` describes the main file. The `os` variants are in oscillator strength.
- The spectrum page plots one version at a time, because their units differ. It lists the versions in the download dialog. API v2 lists them with their units. API v1 is unchanged.
- The site stores variants as uploaded and does not reprocess them at review.
- "Other" files are related spectra that are not versions of this one, for example the same area after beam damage. A submission can have up to three, as variants `other_1` to `other_3`. Each needs a comment of up to 500 characters, stored in `files.note`, that says what it shows. The spectrum page lists them under "Other spectra from the contributor" with their comments, "Show" can plot them, and API v2 returns the comment as `note`. They are not separate spectra, so they have no metadata of their own: a related measurement that needs its own metadata is a separate submission, linked as an associated spectrum.

## Alternatives considered

- The raw data as the main file, with the background-subtracted file as a variant. Readers expect the plotted spectrum to be the background-subtracted one.
- A role for each kind of file in the database instead of variant codes. Variant codes need no migration for a new kind of version.

## Consequences

- A contributor can add variants only with a new submission. Edits do not support them.
- The site does not read a combined file that holds several spectra. Support for one needs an example file of that format first.
- Browse thumbnails read the legacy, MSA or original file. They never read a variant or the metadata file.
