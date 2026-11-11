# eels_binding_energies.json

Copy of exSpy's EELS edge table, used for edge markers on spectrum plots and for edge suggestions on the submit form.

- Source: https://github.com/hyperspy/exspy/blob/3a4ebf8f8fe73a50e3852b0b16b97bc243514365/exspy/material/eels_binding_energies.json (exSpy main, fetched 2026-11-08), with the local changes below.
- Licence: GPL-3.0 (exSpy)
- exSpy does not say where its onsets come from. Of its 504 edges that the Gatan EELS Atlas also lists, 439 have exactly the Atlas value.

Local changes, not in exSpy:

- 39 edges added, with onset energies from Elam, Ravel and Sieber (2002), *Radiation Physics and Chemistry* 63, 121–128, https://doi.org/10.1016/S0969-806X(01)00227-4, rounded to 1 eV. Their `edge` and `threshold` fields are empty.
  - K edges of S, Cl, Ar, K and Ca.
  - L1, L2 and L3 of Ru, Rh, Pd, Ag, Cd, In and Sn. exSpy's hydrogenic L model needs L1 for any element with L2 or L3.
  - Se M4,5, Br M4 and M5, Pd N2,3, I N4,5, Xe N4,5, Os O2, Ir O2 and O3, Th and U N6 and N7.
- Onsets corrected to Elam's values: At N4 (879 to 533 eV) and N5 (533 to 507), Pa O1 (223 to 310) and O2 (310 to 232), Ra O2 (254 to 200), Th O4 (83 to 93) and O5 (83 to 85), U O4 (96 to 103), Ru M4 (279 to 284), Pm N5 (121 to 120).
- Np "O1" (206 eV) renamed O3. Fe K, Pm N4 and Pm N5 changed from Minor to Major.

When exSpy has the same changes, replace this file with exSpy's and update the source above.
