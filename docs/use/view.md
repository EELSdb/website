---
title: View a spectrum
description: Read a spectrum page on EELSdb, use its plot, compare other spectra with it, adjust the view and export an image of the plot.
---

Each spectrum has its own page, at an address such as [`/spectra/graphite/`](/spectra/graphite/).
The page shows the plot of the spectrum, the contributor's comments and all its metadata.

At the top of the page are the title, the type of spectrum, the formula, the contributor and the date it was added.
The **Beam energy and angles known** label tells you that the beam energy and both semi-angles are recorded.
You need these values to compare fine structure between spectra or to do quantification.

The contributor's comments are in the box below the title.

## Use the plot

- Drag a box on the plot to zoom in to it. Double-click the plot to zoom out again.
- Hold the pointer over the plot to see the energy, and the intensity of each spectrum at that energy.
- **Edge onsets (exSpy)** marks the onset energy of each listed edge, from the exSpy edge table.
- **Minor edges** adds the weaker edges of the same elements.
- **Show** switches between the main spectrum and its processed versions, for example oscillator strength, if the contributor added them.

The y axis shows the name of the sample and the unit, for example "Graphite (counts)".

## Compare with other spectra

The **Compare spectra** box is below the plot, on the left.

To compare with another EELSdb spectrum, click the **Or an EELSdb spectrum** search field.
It lists spectra whose energy range overlaps this one, with those that share an edge or an element first.
Type a name or a formula to search, then choose a spectrum.

To compare with your own files, click **Compare with your spectra** and choose one or more files, or drag the files onto the plot.
EELSdb reads MSA, CSV, text, DigitalMicrograph, Velox EMD, HyperSpy and XDI files.
Your browser reads the files. EELSdb does not upload them.

Each compared spectrum has its own colour.
The list in the box shows the compared spectra, and the legend below the plot names them.
To move a spectrum along the energy axis, type a value in its **shift** field.
Click **Remove** to take a spectrum away.

### Independent y axes

When you compare spectra, **Independent y axes** shows at the bottom of the **Adjust the plot** box.
It is on by default.
With it on, each compared spectrum has its own y axis on the right, in its colour, with its name and unit:

- Drag the top half of that axis up or down to move its maximum.
- Drag the bottom half to move its minimum.
- Double-click the axis to reset it.

When you hold the pointer over an axis, the half that a drag moves is tinted.
When you zoom, the compared spectra keep their position relative to the reference.
Clear **Independent y axes** to plot them on the same axis as the reference.

## Adjust the plot

The **Adjust the plot** box is below the plot, on the right.
These settings change only what the plot shows. Downloads always contain the original data.
Compared spectra get the same settings, each on its own data.

- **Background**, for core-loss spectra only, fits a power law to the background before the edge, as exSpy does.
  - **Show power-law fit** draws the fit of each spectrum as a dashed line in its colour.
  - **Subtract power law** subtracts the fit from each spectrum.
  - Set the fit window with the two handles of the slider, or click one of the energies and type a value.
  - The reset button next to the energies sets the window back to the default: from the start of the data to just before the first major edge.
  - The plot marks the window with a dashed line along the bottom. While you drag a handle, the plot also shades the window.
  - A compared spectrum is fitted over the part of the window that its data covers. If fewer than 10 of its data points are in the window, it is not fitted or subtracted.
  - If no power law fits the window of the main spectrum, a message under the settings tells you. Pick a wider window before the edge.
- **Smoothing** applies a Savitzky–Golay filter. Drag the slider, or click the value and type the number of points, an odd number from 3 to 51.
- **Normalise intensity** divides each spectrum by its maximum or by its area. This clears **Independent y axes**, because the spectra then have the same units. If the page cleared it, setting normalisation back to **Off** turns it on again.
- **Log intensity scale** shows the y axis on a log scale. The plot does not show values at or below zero.

The steps run in this order: background, smoothing, normalisation.

## Use in HyperSpy

The **Use in HyperSpy** tab is next to **Adjust the plot**.
It shows the Python code that downloads the spectrum as a HyperSpy file (or an MSA file, if there is none) and loads it in HyperSpy (see [Load spectra in Python](/docs/use/python/)).
The code also has the HyperSpy lines that give the same result as your **Adjust the plot** settings, so you can do the same processing in a notebook.
If you compare spectra, the code loads them too and plots them all on one axis, because HyperSpy has no independent y axes.
Your own files load by their file name. Change the path if the file is in another folder.
HyperSpy cannot read CSV, text and XDI files, so the code leaves them out.
For one spectrum, the plot also marks the same edge onsets as the page, from the exSpy edge table.

The code starts with a short header that lists HyperSpy and exSpy.
Save the code as a file, for example `spectrum.py`, and run it with `uv run spectrum.py`: [uv](https://docs.astral.sh/uv/) installs both packages for you.
In a notebook, install `hyperspy` and `exspy` first. Without exSpy, HyperSpy loads the files as plain spectra and gives a warning.

## Export an image of the plot

Click **Export**, then choose PNG or SVG, and a light or dark background.
The image shows the plot as it is on the page: the area you zoomed to, the edge markers, any spectra you compare with it and the settings from **Adjust the plot**.
If you changed the settings, the image says which processing it shows.
It has the title of the spectrum and its address at the top.

## Read the metadata

Below the plot, the metadata is in sections:

- **Specimen**: formula, elements, edges, source and purity, keywords.
- **Acquisition**: microscope, detector, beam energy, angles and the other settings. Each value shows where it came from (see [Beam energy and angles](/docs/share/beam-energy-and-angles/)).
- **Treatment**: corrections and deconvolutions applied to the data.
- **Reference**: the paper the spectrum comes from, if there is one.
- **Associated spectra**: related spectra, for example the low-loss spectrum of the same specimen.
- **Metadata from the file**: every tag in the uploaded file, for spectra reviewed on the new site. A person has not checked these values.

To download the data or cite the spectrum, see [Download and cite spectra](/docs/use/download/).
