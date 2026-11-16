"""Read a spectrum file into a plain energy axis and intensities (no HyperSpy signal needed)."""

import re
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

TXT_SEPARATORS = {" , ": "space-comma-space", ",": "comma", "\t": "tab", " ": "space"}


@dataclass
class Spectrum:
    energy: np.ndarray
    intensity: np.ndarray
    format: str
    header: dict = field(default_factory=dict)
    layout: str | None = None
    header_axis: np.ndarray | None = None  # OFFSET + i * XPERCHAN, for MSA files
    navigation_shape: tuple[int, ...] | None = None  # the grid of a spectrum image, which the checks reject
    original_metadata: dict = field(default_factory=dict)  # every tag in the file, as the reader gives it


def msa_x_column(path):
    """X values of an XY MSA file, read directly (RosettaSciIO ignores them)."""
    xs, in_data = [], False
    for line in Path(path).read_text(encoding="latin-1").splitlines():
        if line.startswith("#SPECTRUM"):
            in_data = True
        elif line.startswith("#ENDOFDATA"):
            break
        elif in_data and line.strip() and not line.startswith("#"):
            xs.append(float(line.replace(",", " ").split()[0]))
    return np.array(xs)


def read_msa(path):
    from rsciio.msa import file_reader

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sig = file_reader(str(path))[0]
    header = dict(sig["original_metadata"])
    ax = sig["axes"][0]
    # XY files may leave OFFSET/XPERCHAN blank; RosettaSciIO then gives "" or a default 0, 1, 2… axis.
    try:
        float(header.get("OFFSET")), float(header.get("XPERCHAN"))
        header_axis = float(ax["offset"]) + float(ax["scale"]) * np.arange(ax["size"])
    except (TypeError, ValueError):
        header_axis = None
    datatype = str(header.get("DATATYPE", "")).strip()
    energy = msa_x_column(path) if datatype == "XY" else header_axis
    if energy is None:
        raise ValueError("MSA file has no energy axis: DATATYPE is Y but OFFSET or XPERCHAN is missing")
    return Spectrum(energy, np.asarray(sig["data"], dtype=float), "msa", header, header_axis=header_axis,
                    original_metadata=dict(header))


def read_txt(path):
    """Two-column text. The layout names the column separator."""
    lines = Path(path).read_text(encoding="latin-1").splitlines()
    data_lines = [line for line in lines if re.match(r"\s*[-+]?\d", line)]
    sep = re.match(r"\s*\S+?(\s*[,;]\s*|\s+)[-+\d.]", data_lines[0]).group(1)
    layout = TXT_SEPARATORS.get(sep, "tab+spaces" if sep.startswith("\t") else repr(sep))
    rows = np.array([[float(v) for v in re.split(r"[\s,;]+", line.strip())[:2]] for line in data_lines])
    return Spectrum(rows[:, 0], rows[:, 1], "txt", layout=layout)


# XDI (the XAS Data Interchange format) header fields → our xas_acquisition names.
XDI_FIELDS = {
    "facility.name": "facility",
    "beamline.name": "beamline",
    "facility.xray_source": "source_type",
    "mono.name": "monochromator",
    "element.symbol": "element",
    "element.edge": "edge",
    "scan.start_time": "date",
    "sample.name": "sample",
    "sample.formula": "formula",
}


# Column labels of X-ray absorption files, in order of preference; XDI defines the mu*/norm* names.
MU_LABELS = ("mutrans", "mufluor", "mu", "xmu", "mutey", "normtrans", "normfluor", "norm", "flat")
HC_EV_ANGSTROM = 12398.419843320026


def xas_columns(labels, data):
    """Energy and absorption from labelled columns, as Larch does: the column named energy (or e, en…), then a mu
    column, else ln(i0/itrans) or ifluor/i0. Returns (energy, mu, name of the mu column)."""
    names = [str(n).strip().lower() for n in labels]
    is_energy = lambda n: n in ("energy", "e", "energ") or n.startswith(("energy", "energ", "en ", "e(")) or n == "en"  # noqa: E731
    e_col = next((i for i, n in enumerate(names) if is_energy(n)), 0)
    for want in MU_LABELS:
        if want in names:
            return data[:, e_col], data[:, names.index(want)], want
    find = lambda *opts: next((names.index(o) for o in opts if o in names), None)  # noqa: E731
    i0, it, i_f = find("i0", "io", "mon", "monitor"), find("itrans", "it", "i1"), find("ifluor", "if", "fluo", "pfy", "tfy", "tey")
    with np.errstate(divide="ignore", invalid="ignore"):
        if i0 is not None and it is not None:
            return data[:, e_col], np.log(data[:, i0] / data[:, it]), "ln(i0/itrans)"
        if i0 is not None and i_f is not None:
            return data[:, e_col], data[:, i_f] / data[:, i0], f"{names[i_f]}/i0"
    other = next(i for i in range(data.shape[1]) if i != e_col)
    return data[:, e_col], data[:, other], names[other] or None


def read_xdi(path):
    """XDI file: energy from the column labelled energy (or angle, with Mono.d_spacing), absorption from a mu
    column, else derived from the intensities."""
    header, columns, rows, in_data, comments = {}, {}, [], False, False
    for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("#"):
            body = line.lstrip("#").strip()
            if body.startswith("///"):
                comments = True
            elif body.startswith("---"):
                in_data = True
            elif ":" in body and not in_data and not comments:
                key, value = (x.strip() for x in body.split(":", 1))
                header[key.lower()] = value
                if key.lower().startswith("column."):
                    columns[int(key.split(".")[1]) - 1] = value.split()[0].lower()
        elif line.strip():
            rows.append([float(v) for v in line.split()])
    data = np.array(rows)
    names = [columns.get(i, "") for i in range(data.shape[1])]
    if "energy" not in names and names and names[0] == "angle" and "mono.d_spacing" in header:
        # Bragg's law; the angle column is in degrees unless it says radians.
        theta = data[:, 0] if "rad" in header.get("column.1", "") else np.radians(data[:, 0])
        data[:, 0] = HC_EV_ANGSTROM / (2 * float(header["mono.d_spacing"]) * np.sin(theta))
        names[0] = "energy"
    if not any(names[1:]):
        names = ["energy"] + [f"col{i + 2}" for i in range(data.shape[1] - 1)]
    energy, mu, used = xas_columns(names, data)
    e_col = names.index("energy") if "energy" in names else 0
    if header.get(f"column.{e_col + 1}", "").lower().endswith("kev"):
        energy = energy * 1000
    meta = {ours: header[k] for k, ours in XDI_FIELDS.items() if k in header}
    meta["intensity_column"] = used
    return Spectrum(energy, mu, "xdi", {**header, "xas": meta}, original_metadata=dict(header))


def read_spec(path):
    """SPEC file: the first scan with an energy column. The header notes how many scans the file holds."""
    scans, current = [], None
    for line in Path(path).read_text(encoding="latin-1").splitlines():
        if line.startswith("#S "):
            current = {"title": line[3:].strip(), "labels": [], "rows": []}
            scans.append(current)
        elif current is not None and line.startswith("#L "):
            current["labels"] = re.split(r"\s{2,}", line[3:].strip())
        elif current is not None and line.strip() and not line.startswith("#"):
            current["rows"].append([float(v) for v in line.split()])
    usable = [sc for sc in scans if sc["rows"] and any(re.match(r"(?i)^(energy|energ|e$|en$)", lab) for lab in sc["labels"])]
    if not usable:
        raise ValueError("no scan with an energy column in this SPEC file")
    scan = usable[0]
    width = min(len(r) for r in scan["rows"])
    data = np.array([r[:width] for r in scan["rows"]])
    energy, mu, used = xas_columns(scan["labels"][:width], data)
    if energy.max() < 100:
        energy = energy * 1000  # keV
    header = {"scan": scan["title"], "scans": len(scans), "xas": {"intensity_column": used}}
    return Spectrum(energy, mu, "spec", header, original_metadata={"scan": scan["title"], "labels": scan["labels"], "scans": len(scans)})


def read_athena(path):
    """Athena (Demeter) project: the first group of μ(E) data. The header lists every group's label."""
    import ast
    import gzip

    raw = Path(path).read_bytes()
    text = (gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw).decode("utf-8", errors="replace")
    if not text.lstrip().startswith("# Athena project file"):
        raise ValueError("this is not an Athena project file")
    groups, current = [], {}

    def perl_list(rhs):
        # Perl lists of numbers and quoted strings: "(1, 'a', 2.5);" becomes a Python list.
        return ast.literal_eval("[" + rhs.strip().rstrip(";").strip()[1:-1] + "]")

    for line in text.splitlines():
        line = line.strip()
        if line.startswith("@args"):
            values = perl_list(line.split("=", 1)[1])
            current["args"] = dict(zip(values[::2], values[1::2]))
        elif line.startswith(("@x ", "@x=", "@y ", "@y=", "@i0 ", "@i0=")):
            name, rhs = line[1:].split("=", 1)
            current[name.strip()] = np.array(perl_list(rhs), dtype=float)
        elif line.startswith("[record]"):
            groups.append(current)
            current = {}
    mu_groups = [g for g in groups if "x" in g and "y" in g and str(g.get("args", {}).get("datatype", "xmu")) in ("xmu", "xanes")]
    if not mu_groups:
        raise ValueError("no μ(E) data in this Athena project")
    g = mu_groups[0]
    labels = [str(x.get("args", {}).get("label", "")) for x in mu_groups]
    header = {"groups": labels, "xas": {"intensity_column": "xmu"}}
    if len(mu_groups) > 1:
        header["note"] = f"The project holds {len(mu_groups)} spectra; the first, {labels[0]!r}, was read."
    return Spectrum(g["x"], g["y"], "prj", header, original_metadata={"args": g.get("args", {}), "groups": labels})


def read_nexus(path):
    """NeXus or other HDF5 file: an NXxas entry, else the first NXdata whose axis is an energy."""
    import h5py

    def text(v):
        return v.decode() if isinstance(v, bytes) else str(v)

    with h5py.File(path, "r") as f:
        found = []

        def visit(name, obj):
            if isinstance(obj, h5py.Group) and text(obj.attrs.get("NX_class", "")) == "NXdata":
                found.append(name)

        f.visititems(visit)
        for name in found:
            group = f[name]
            entry = group.parent
            definition = text(entry["definition"][()]) if "definition" in entry else ""
            if definition == "NXxas" and "energy" in group and "absorbed_beam" in group:
                energy, signal = group["energy"], group["absorbed_beam"]
            else:
                axes = group.attrs.get("axes")
                axis = text(axes[0] if isinstance(axes, (list, np.ndarray)) else axes) if axes is not None else None
                sig = text(group.attrs.get("signal", ""))
                if not axis or "energ" not in axis.lower() or sig not in group or axis not in group:
                    continue
                energy, signal = group[axis], group[sig]
            e = np.asarray(energy[()], float)
            y = np.asarray(signal[()], float)
            if e.ndim != 1 or y.shape[-1] != e.size:
                continue
            while y.ndim > 1:
                y = y.sum(axis=0)
            if text(energy.attrs.get("units", "eV")).lower() == "kev":
                e = e * 1000
            return Spectrum(e, y, "nexus", {"nxdata": name, "definition": definition or None, "xas": {"intensity_column": signal.name.rsplit("/", 1)[-1]}},
                            original_metadata={"nxdata": name, "definition": definition})
    raise ValueError("no NXxas entry or NXdata group with an energy axis in this file")


def read_columns(path):
    """Text with several columns and a label line (beamline files such as .dat, .xmu, .nor), as Larch's read_ascii:
    the labels are the last comment line before the data."""
    lines = Path(path).read_text(encoding="latin-1").splitlines()
    rows, labels, header = [], None, []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"[-+]?(\d|\.\d)", stripped):
            rows.append([float(v) for v in re.split(r"[\s,;]+", stripped)])
        elif not rows:
            header.append(stripped.lstrip("#;! ").strip())
    if not rows:
        raise ValueError("no rows of numbers in this file")
    width = min(len(r) for r in rows)
    data = np.array([r[:width] for r in rows])
    if width == 2:
        return Spectrum(data[:, 0], data[:, 1], "txt", layout="columns")
    for candidate in reversed(header):
        words = re.split(r"\s+|,", candidate)
        if len([w for w in words if w]) >= width:
            labels = [w for w in words if w][-width:]
            break
    energy, mu, used = xas_columns(labels or ["energy"] + [f"col{i + 2}" for i in range(width - 1)], data)
    if energy.max() < 100:
        energy = energy * 1000  # keV
    return Spectrum(energy, mu, "txt", {"xas": {"intensity_column": used}}, layout="columns", original_metadata={"labels": labels or []})


def read_spectrum(path):
    path = Path(path)
    return read_msa(path) if path.suffix.lower() == ".msa" else read_txt(path)


def _get(md, path):
    for key in path.split("."):
        if not isinstance(md, dict) or key not in md:
            return None
        md = md[key]
    return md


READERS = {".dm3": "digitalmicrograph", ".dm4": "digitalmicrograph", ".emd": "emd", ".hspy": "hspy", ".ser": "tia", ".emi": "tia"}


def read_any(path):
    """Any supported file as a Spectrum; `header` holds acquisition values found in it (kV, mrad, s).

    Spectrum images are summed to one spectrum, so they can be plotted, and keep their grid in navigation_shape. Files without an energy-loss axis (for example a
    companion image) return energy=None with their acquisition values.
    """
    import importlib

    path = Path(path)
    ext = path.suffix.lower()
    if ext in (".msa", ".emsa"):
        sp = read_msa(path)
        # Keywords may carry units, padded: "BEAMKV   -kV".
        base = {k.split("-")[0].strip(): v for k, v in sp.header.items()}
        sp.header = {**sp.header, "beam_energy_kv": base.get("BEAMKV"), "convergence_mrad": base.get("CONVANGLE"),
                     "collection_mrad": base.get("COLLANGLE"), "phase": str(base.get("PHASE") or "").strip().lower() or None,
                     "reference": str(base.get("REFERENCE") or "").strip() or None}
        return sp
    if ext in (".txt", ".csv"):
        return read_txt(path)
    if ext == ".xdi":
        return read_xdi(path)
    if ext in (".spec", ".spc"):
        return read_spec(path)
    if ext == ".prj":
        return read_athena(path)
    if ext in (".nxs", ".h5", ".hdf5", ".nx5"):
        return read_nexus(path)
    if ext in (".dat", ".xmu", ".nor"):
        return read_columns(path)
    if ext not in READERS:
        raise ValueError(f"cannot read {ext} files")
    reader = importlib.import_module(f"rsciio.{READERS[ext]}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        signals = reader.file_reader(str(path))
    is_eels = lambda s: s["axes"] and s["axes"][-1].get("units") in ("eV", "keV")  # noqa: E731
    sig = next((s for s in signals if is_eels(s)), signals[0])
    tem = _get(sig.get("metadata", {}), "Acquisition_instrument.TEM") or {}
    header = {
        "beam_energy_kv": tem.get("beam_energy"),
        "convergence_mrad": tem.get("convergence_angle"),
        "collection_mrad": _get(tem, "Detector.EELS.collection_angle"),
        "exposure_s": _get(tem, "Detector.EELS.exposure"),
        "frames": _get(tem, "Detector.EELS.frame_number"),
    }
    original = sig.get("original_metadata") or {}
    if not is_eels(sig):
        return Spectrum(None, None, ext.lstrip("."), header, original_metadata=original)
    data = np.asarray(sig["data"], dtype=float)
    navigation_shape = tuple(int(n) for n in data.shape[:-1]) or None
    while data.ndim > 1:
        data = data.sum(axis=0)
    ax = sig["axes"][-1]
    factor = 1000.0 if ax.get("units") == "keV" else 1.0
    energy = np.asarray(ax["axis"], float) if "axis" in ax else ax.get("offset", 0) + ax.get("scale", 1) * np.arange(data.size)
    energy = energy * factor
    return Spectrum(energy, data, ext.lstrip("."), header, header_axis=energy, navigation_shape=navigation_shape,
                    original_metadata=original)
