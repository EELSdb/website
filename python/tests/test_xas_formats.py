import gzip

import numpy as np

from eelsdb.io import read_any

E = [280.0, 285.0, 290.0, 295.0]


def test_xdi_derives_mu_and_skips_comments(tmp_path):
    path = tmp_path / "c.xdi"
    path.write_text(
        "# XDI/1.0\n# Column.1: energy eV\n# Column.2: i0\n# Column.3: itrans\n# Element.symbol: C\n# Element.edge: K\n"
        "# ///\n# Note: measured at 80 K\n#----\n# energy i0 itrans\n"
        + "".join(f"{e} 100 {v}\n" for e, v in zip(E, [50, 40, 20, 25]))
    )
    sp = read_any(path)
    np.testing.assert_allclose(sp.intensity, np.log(100 / np.array([50, 40, 20, 25])))
    assert sp.header["xas"]["intensity_column"] == "ln(i0/itrans)"
    assert "note" not in sp.header


def test_xdi_angle_abscissa(tmp_path):
    path = tmp_path / "a.xdi"
    path.write_text("# XDI/1.0\n# Column.1: angle degrees\n# Column.2: mutrans\n# Mono.d_spacing: 3.13553\n#----\n10.0 1.0\n10.1 1.1\n")
    sp = read_any(path)
    np.testing.assert_allclose(sp.energy[0], 12398.419843320026 / (2 * 3.13553 * np.sin(np.radians(10.0))))


def test_spec_first_scan_with_energy(tmp_path):
    path = tmp_path / "run.spec"
    path.write_text(
        "#F run.spec\n#E 1700000000\n\n#S 1 ascan th 0 1 3 1\n#N 2\n#L Theta  Counts\n0 1\n1 2\n\n"
        "#S 2 escan 0.280 0.295\n#N 3\n#L Energy  I0  TEY\n"
        + "".join(f"{e / 1000} 10 {v}\n" for e, v in zip(E, [1, 2, 5, 4]))
    )
    sp = read_any(path)
    np.testing.assert_allclose(sp.energy, E)
    np.testing.assert_allclose(sp.intensity, [0.1, 0.2, 0.5, 0.4])
    assert sp.header["scans"] == 2


def test_athena_project(tmp_path):
    record = lambda label, ys: (  # noqa: E731
        f"$old_group = 'g{label}';\n@args = ('label','{label}','datatype','xmu','bkg_e0','285');\n"
        f"@x = ({','.join(repr(str(e)) for e in E)});\n@y = ({','.join(repr(str(v)) for v in ys)});\n@i0 = ();\n[record] = ('g{label}');\n\n"
    )
    text = "# Athena project file -- Demeter version 0.9.26\n# This file created at 1:00\n\n" + record("graphite", [0.1, 0.9, 1.2, 1.0]) + record("diamond", [0, 0, 1, 1]) + "1;\n"
    path = tmp_path / "carbon.prj"
    path.write_bytes(gzip.compress(text.encode()))
    sp = read_any(path)
    np.testing.assert_allclose(sp.energy, E)
    np.testing.assert_allclose(sp.intensity, [0.1, 0.9, 1.2, 1.0])
    assert sp.header["groups"] == ["graphite", "diamond"]
    assert "2 spectra" in sp.header["note"]


def test_nexus_nxxas(tmp_path):
    import h5py

    path = tmp_path / "scan.nxs"
    with h5py.File(path, "w") as f:
        entry = f.create_group("entry")
        entry.attrs["NX_class"] = "NXentry"
        entry["definition"] = "NXxas"
        data = entry.create_group("data")
        data.attrs["NX_class"] = "NXdata"
        data["energy"] = np.array(E) / 1000
        data["energy"].attrs["units"] = "keV"
        data["absorbed_beam"] = np.array([1.0, 2.0, 3.0, 2.5])
    sp = read_any(path)
    np.testing.assert_allclose(sp.energy, E)
    np.testing.assert_allclose(sp.intensity, [1, 2, 3, 2.5])


def test_nexus_nxdata_with_energy_axis(tmp_path):
    import h5py

    path = tmp_path / "scan.h5"
    with h5py.File(path, "w") as f:
        data = f.create_group("entry/measurement")
        data.attrs.update({"NX_class": "NXdata", "signal": "tey", "axes": ["energy"]})
        data["energy"] = np.array(E)
        data["tey"] = np.array([4.0, 5.0, 6.0, 7.0])
    np.testing.assert_allclose(read_any(path).intensity, [4, 5, 6, 7])


def test_beamline_columns(tmp_path):
    path = tmp_path / "b18.dat"
    path.write_text("# Diamond B18\n# energy\tI0\tIt\tIref\n" + "".join(f"{e}\t200\t{v}\t1\n" for e, v in zip(E, [100, 80, 40, 50])))
    sp = read_any(path)
    np.testing.assert_allclose(sp.energy, E)
    np.testing.assert_allclose(sp.intensity, np.log(200 / np.array([100, 80, 40, 50])))


def test_msa_in_mev(tmp_path):
    path = tmp_path / "vib.msa"
    path.write_text(
        "#FORMAT      : EMSA/MAS Spectral Data File\n#VERSION     : 1.0\n#TITLE       : hBN phonons\n#NPOINTS     : 3\n#NCOLUMNS    : 1\n"
        "#XUNITS      : meV\n#YUNITS      : counts\n#DATATYPE    : Y\n#XPERCHAN    : 1.0\n#OFFSET      : -1.0\n"
        "#SPECTRUM    : Spectral Data Starts Here\n10\n1000\n12\n#ENDOFDATA   :\n"
    )
    np.testing.assert_allclose(read_any(path).energy, [-0.001, 0.0, 0.001])
