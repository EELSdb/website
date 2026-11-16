---
title: Quick quantification
description: How the spectrum page estimates element ratios from a core-loss spectrum, and why to treat the numbers with care.
---

For core-loss spectra, the spectrum page estimates the ratio of the elements from their edges.
The estimate shows under the plot, for example **≈ B 46% · N 54%**.
Click it to open the **Analyse** tab, which has a table of the elements, the ratios and the settings used.

Treat the numbers as a rough check, not as a measurement.
They are often 10 to 20% out, and more for some edges (see [Limits](#limits)).

## When the page can quantify

The page quantifies a spectrum when all of these are true:

- It is a core-loss spectrum in counts.
- Its record gives the beam energy and the collection semi-angle. The page also uses the convergence semi-angle if it is known.
- It has K or L2,3 edges of at least two elements within its energy range, listed under **Edges**.

Otherwise the **Analyse** tab says what is missing.
Edges of other types (M, N and L1) are left out and listed under the table.
If an element has both a K and an L2,3 edge in range, the page uses the K edge.

## How it is calculated

The page uses Egerton's integral method. It runs in your browser, on the spectrum as published, before any of the settings in **Adjust the plot**.

1. **Window.** One energy window, Δ, is used for every edge: 50 eV, or less if the next edge or the end of the data is closer. With less than 20 eV, the page does not quantify.
2. **Background.** For each edge, the page fits a power law, A·E<sup>−r</sup>, to the 30 eV before the onset (ending 3 eV before it, and starting after the previous edge). If the main file is already background subtracted, the first edge has no fit.
3. **Counts.** The page adds up the counts above the background from the onset to the onset + Δ. The onset energies are from the exSpy edge table that the plot uses.
4. **Cross-section.** The page calculates the partial cross-section σ(β, Δ) of each edge with the hydrogenic model: Egerton's SIGMAK and SIGMAL routines, as exSpy uses them. With a convergent beam, it uses Egerton's effective collection angle.
5. **Ratio.** The number of atoms of each element is proportional to its counts divided by its cross-section. The table gives each element as a percentage of the elements measured, and as a ratio to the first one.

The code matches exSpy's hydrogenic cross-sections to better than one part in a million.

## Limits

- **Hydrogenic cross-sections are approximate.** They treat the atom as hydrogen-like. For K edges they are usually within about 10%. For L2,3 edges they are less good.
- **White lines.** The L2,3 edges of the transition metals (Ti to Cu) and the M4,5 edges of the rare earths have sharp white lines that no atomic model includes. These elements usually come out too high.
- **Near-edge structure.** Fine structure just above the onset differs between compounds. A wider window reduces its effect.
- **Background.** A power law fits poorly where the pre-edge region holds another edge or its fine structure. Results for edges close together are less reliable.
- **Thickness.** Plural scattering moves counts out of the window. For thick specimens (t/λ above about 0.5), remove it first, for example with Fourier-ratio deconvolution in HyperSpy.
- **Recorded values.** The result depends on the beam energy and the collection angle in the record. An error in the collection angle changes the result.
- **Only listed edges.** The percentages count only the elements in the table. Elements with no usable edge in the spectrum are not included.

## Do it properly

For a real quantification, fit a model to the spectrum with exSpy, with Hartree–Slater or Dirac cross-sections and fine-structure components, on a spectrum with known thickness. See the [exSpy documentation on EELS curve fitting](https://hyperspy.org/exspy/user_guide/eels.html#eels-curve-fitting).
The **Use in HyperSpy** tab gives code that loads the spectrum with its beam energy and angles.
