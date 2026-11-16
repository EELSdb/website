"""Record exSpy's hydrogenic K and L cross-sections into data/fixtures/quant.json.

worker/public/quant.js reimplements them for the spectrum page's quick quantification; worker/test/quant.test.ts
checks it against this file.

    uv run python record_quant.py
"""

import json
from pathlib import Path

import numpy as np
from exspy._misc.eels.effective_angle import effective_angle
from exspy._misc.eels.hydrogenic_gos import HydrogenicGOS

OUT = Path(__file__).resolve().parent.parent / "data" / "fixtures" / "quant.json"
r = lambda a: [float(f"{v:.12g}") for v in a]

cases = []
for subshell, E0, alpha, beta in [
    ("B_K", 200, 10, 20),
    ("C_K", 100, 0, 10),
    ("N_K", 200, 10, 20),
    ("O_K", 300, 25, 15),
    ("Si_K", 200, 0, 30),
    ("Si_L3", 200, 10, 20),
    ("Ti_L3", 200, 10, 20),
    ("Fe_L3", 300, 20, 30),
    ("Zn_L3", 200, 0, 50),
    ("Sr_L3", 200, 10, 20),
]:
    gos = HydrogenicGOS(subshell)
    angle = effective_angle(E0, gos.onset_energy, alpha, beta)
    spline = gos.integrateq(gos.onset_energy, angle * 1e-3, E0)
    windows = {}
    for delta in (30, 50, 100):
        e = np.linspace(gos.onset_energy, gos.onset_energy + delta, 20001)
        windows[delta] = float(np.trapezoid(spline(e), e))
    cases.append(
        {
            "subshell": subshell,
            "E0": E0,
            "alpha": alpha,
            "beta": beta,
            "Z": int(gos.Z),
            "onset": float(gos.onset_energy),
            "onset_L1": float(getattr(gos, "onset_energy_L1", 0)) or None,
            "effective_angle": angle,
            "energy_axis": r(gos.energy_axis),
            "qint": r(gos.qint),
            "sigma": windows,
        }
    )

OUT.write_text(json.dumps(cases) + "\n")
print(f"wrote {OUT}")
