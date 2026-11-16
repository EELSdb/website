---
title: "0040. X-ray absorption file formats"
description: "EELSdb reads the common XAS file formats in the browser, and offers X-ray absorption spectra as XDI instead of the EELS formats."
adr:
  date: 2026-11-16
---

## Context

X-ray absorption spectra ([ADR 0024](/docs/adr/0024-scope-gas-phase-and-xas/)) come from beamlines that each save data in their own way. The common formats are XDI, SPEC scan files, Athena (Demeter) project files, NeXus or other HDF5 files, and text files with several labelled columns (energy, I0, It, If and so on).

Larch (xraylarch) reads all of these, but it cannot run in Pyodide: its wheel contains native FEFF and XDI libraries, and several of its dependencies (silx, mkl-fft, pyfai and others) have no browser builds. RosettaSciIO reads none of them except NeXus files whose data group marks its signal.

XAS software (Larch, Athena, Demeter) reads XDI. MSA and HSPY are EELS and EDS formats. The NeXus XAS definition is changing: in November 2026 one open pull request adds a new `NXxas` and another proposes removing the current `NXxas` and `NXxasproc` because nobody uses them.

## Decision

### Reading

`python/eelsdb/io.py` reads these formats with numpy, h5py and the standard library, so the submit form, the compare tool and review all accept them:

- XDI (`.xdi`). The absorption is the first of `mutrans`, `mufluor`, `mu`, `xmu`, `mutey`, `normtrans`, `normfluor`, `norm` and `flat`, else `ln(i0/itrans)`, else `ifluor/i0`, as Larch derives it. An `angle` abscissa becomes energy through Bragg's law with `Mono.d_spacing`. Header fields after `# ///` are comments and are not read.
- SPEC (`.spec`, `.spc`): the first scan with an energy column. Energies below 100 are taken as keV.
- Athena project (`.prj`, gzipped or not): the first group of μ(E) data (`datatype` `xmu` or `xanes`). The header lists every group, and notes when there are several. Athena's saved processing is not read. The newer JSON project format is not read, because there is no example file to test against.
- NeXus or HDF5 (`.nxs`, `.h5`, `.hdf5`): an entry with `definition` NXxas (`data/energy` and `data/absorbed_beam`), else the first NXdata group whose axis name contains "energ".
- Beamline column files (`.dat`, `.xmu`, `.nor`): the labels are the last header line with enough words, as in Larch's `read_ascii`. The same column rules as XDI pick the energy and the absorption. A file with two columns reads like `.txt`.

Each reader returns `header.xas.intensity_column`, which tells the submit form that the file is X-ray absorption.

### Downloads

- X-ray absorption spectra (`technique = xas`) have an XDI download at `/spectra/{slug}/download/xdi`, made from the stored data on request like MSA and CSV. API v2 lists it in `downloads.xdi`, which is null for EELS spectra.
- The XDI file has the energy in eV and one absorption column. Its label follows the detection mode and units: `mutrans`, `mufluor`, `normtrans` or `normfluor` where XDI defines one, `mutey` for electron yield (Larch's name), and plain `mu` or `norm` when the mode is not recorded.
- `Element.edge` must be one subshell in XDI, so an EELS-style group becomes its lowest-energy member: L2,3 becomes L3, M4,5 becomes M5. All the edges, the reference number, the page address, the licence, the DOI and the XAS acquisition fields are in an `EELSdb` namespace. The description and the citation request are XDI comments.
- The download dialog of an X-ray absorption spectrum offers XDI, CSV, JSON and the original file. It leaves out MSA and HSPY, which are EELS formats; their addresses still work, and API v2 still lists them.

## Alternatives considered

- **Larch in Pyodide.** It does not install (see Context).
- **An NXxas download.** The definition is being replaced, and writing HDF5 needs h5py, so the file would have to be made at review like the HSPY file. Revisit when the new NXxas is in a NeXus release.
- **Choosing columns in a dialog, as Larix does.** The column rules are right for the files tried. A file whose labels the rules do not know still reads, from its second column, and the plot on the submit form shows the result to the contributor.

## Consequences

- `python/tests/test_xas_formats.py` covers each reader with a small file in its format. Real beamline files may still need more column names.
- The page's own parser (`parseSpectrum`) reads only MSA and text. New uploads in these formats plot on the spectrum page through the MSA file made at review.
- A Larch client for the EELSdb API needs only `downloads.xdi` and the existing search parameters.
