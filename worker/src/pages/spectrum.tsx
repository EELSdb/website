import type { Context } from "hono";
import { raw } from "hono/html";
import { GRAVATAR_EMAIL_SQL, avatarUrl, type AppEnv } from "../auth";
import { API_HOST, SITE, loadBundle, type SpectrumBundle } from "../api/format";
import { creatorOrcids, jsonLdScript, licenceOf, schemaOrg, toRecord } from "../api/metadata";
import { EELSDB_BIBTEX, EELSDB_CITATION, referenceText, stripTags } from "./citation";
import { isModerator } from "../instruments";
import { UNIT_LABELS, VARIANTS, variantUnits } from "../submit/form";
import { Avatar, Formula, Layout, TYPE_NAMES, TypeBadge, fmt } from "./layout";
import { HistoryTimeline, spectrumHistory } from "./history";
import { HyperSpySnippet } from "./snippet";

type Row = Record<string, any>;


const SOURCE_NOTE: Record<string, string> = {
  file: "from the data file",
  companion: "from a companion file",
  profile: "from the instrument profile",
  estimate: "approximate",
};

/** A value with its uncertainty and, unless the submitter typed it, where it came from. */
function measured(value: number | null, unit: string, source: string | null, uncertainty: number | null) {
  if (source === "unknown") return <span class="muted">Unknown</span>;
  if (value === null || value === undefined) return null;
  const note = source && SOURCE_NOTE[source];
  return (
    <>
      {fmt(value, unit)}
      {uncertainty ? ` ± ${uncertainty} ${unit}` : ""}
      {note && <span class="muted small"> ({note})</span>}
    </>
  );
}

const href = (key: string) => `/${key.split("/").map(encodeURIComponent).join("/")}`;
// Formats spectrum.js can parse for the plot.
const PLOTTABLE = /\.(msa|emsa|txt|csv)$/i;

const yesNo = (v: unknown) => (v === null || v === undefined ? null : Number(v) ? "Yes" : "No");

function MetaList(props: { items: [string, unknown][] }) {
  const items = props.items.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!items.length) return <p class="muted">Not recorded.</p>;
  return (
    <dl class="meta">
      {items.map(([k, v]) => (
        <>
          <dt>{k}</dt>
          <dd>{v as any}</dd>
        </>
      ))}
    </dl>
  );
}

function CopyButton(props: { target: string; what: string }) {
  return (
    <button class="copy" type="button" data-copy={props.target} aria-label={`Copy ${props.what}`}>
      <svg class="i-copy" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="6.5" y="6.5" width="10" height="11" rx="1.5" />
        <path d="M13.5 6.5V4a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4v8A1.5 1.5 0 0 0 5 13.5h1.5" />
      </svg>
      <svg class="i-done" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 10.5l4 4 8-9" />
      </svg>
      <span class="copy-label" role="status">Copy</span>
    </button>
  );
}

/** Stored edges typeset as "Fe L<sub>2,3</sub>". */
function EdgeList(props: { b: SpectrumBundle }) {
  if (!props.b.edges.length) return null;
  return (
    <span class="formula">
      {props.b.edges.map((e, i) => {
        const [, shell, sub] = String(e.edge).match(/^([A-Z])(.*)$/) ?? [, e.edge, ""];
        return <>{i > 0 && ", "}{e.element} {shell}{sub && <sub>{sub}</sub>}</>;
      })}
    </span>
  );
}

function bibKey(s: Row) {
  const first = String(s.author_display ?? "eelsdb").split(" ").pop()!.replace(/[^A-Za-z]/g, "");
  return `${first}${String(s.published_at ?? "").slice(0, 4)}eelsdb${s.id}`;
}

export function spectrumCitation(b: SpectrumBundle) {
  const s = b.spectrum;
  const year = String(s.published_at ?? "").slice(0, 4);
  const url = `${SITE}/spectra/${encodeURIComponent(s.slug)}/`;
  const ref = referenceText(b.reference);
  const text = [
    `${s.author_display}. ${s.title}${s.formula ? ` (${s.formula})` : ""}. EELS Data Base, spectrum ${s.id}${year ? `, ${year}` : ""}. ${url}`,
    ref,
    EELSDB_CITATION,
  ].filter(Boolean).join("\n\n");

  const r = b.reference;
  const bib = [
    `@misc{${bibKey(s)},
  author = {${s.author_display}},
  title = {${s.title}},
  howpublished = {EELS Data Base, spectrum ${s.id}},
  year = {${year}},
  url = {${url}}
}`,
    r && (r.doi || r.title) &&
      `@article{${bibKey(s)}ref,
  author = {${r.authors ?? ""}},
  title = {${stripTags(r.title)}},
  journal = {${r.journal ?? ""}},
  volume = {${r.volume ?? ""}},
  number = {${r.issue ?? ""}},
  pages = {${String(r.page ?? "").replace("-", "--")}},
  year = {${r.year ?? ""}},
  doi = {${r.doi ?? ""}}
}`,
    EELSDB_BIBTEX,
  ].filter(Boolean).join("\n\n");
  return { text, bib };
}

/** The spectrum's id if this viewer may see it: published, or pending and theirs (or they moderate). */
export async function visibleSpectrumId(c: Context<AppEnv>, slug: string): Promise<number | null> {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT id, status, owner_id FROM spectra WHERE slug = ?").bind(slug).first<any>();
  const visible = row && (row.status === "published" || (row.status === "pending" && user && (row.owner_id === user.id || isModerator(user))));
  return visible ? row.id : null;
}

/** Masked, for migrated owners only: tells the uploader which address to add to take their spectra over. */
async function unclaimedUploaderEmail(db: D1Database, ownerId: number | null): Promise<string | null> {
  const email = await db.prepare(
    `SELECT trim(legacy_email) AS email FROM users u WHERE id = ? AND trim(COALESCE(legacy_email, '')) != ''
     AND NOT EXISTS (SELECT 1 FROM identities i WHERE i.user_id = u.id)`,
  ).bind(ownerId).first<string>("email");
  return email ? maskEmail(email) : null;
}

const maskEmail = (email: string) => email.replace(/^(.)[^@]*@/, "$1•••@");

export async function spectrumPage(c: Context<AppEnv>) {
  const slug = c.req.param("slug")!;
  const user = c.get("user");
  const id = await visibleSpectrumId(c, slug);
  const b = id === null ? null : await loadBundle(c.env.DB, id);
  if (!b) return c.notFound();
  const favourite = user
    ? await c.env.DB.prepare("SELECT 1 FROM favourites WHERE user_id = ? AND spectrum_id = ?").bind(user.id, id).first()
    : null;

  const s = b.spectrum;
  const a = b.acquisition ?? {};
  const t = b.treatment ?? {};
  const r = b.reference;
  const fileUrl = b.legacyFile ? `/${b.legacyFile.split("/").map(encodeURIComponent).join("/")}` : null;
  const fileName = b.legacyFile?.split("/").pop();
  const base = `/spectra/${encodeURIComponent(s.slug)}/download`;
  const original = b.files.find((f) => f.role === "original" || f.role === "legacy");
  const hspy = b.files.find((f) => f.role === "hspy");
  const downloads = [
    ...(fileName && PLOTTABLE.test(fileName)
      ? [
          { id: "msa", label: "MSA", hint: "EMSA/MAS text with the EELS header fields. Opens in HyperSpy, DigitalMicrograph and most EELS software.", href: `${base}/msa`, name: `${s.slug}.msa` },
          { id: "csv", label: "CSV", hint: "Two columns, energy in eV and intensity, for spreadsheets, Python or MATLAB.", href: `${base}/csv`, name: `${s.slug}.csv` },
          { id: "json", label: "JSON", hint: "The data with all the metadata on this page, as in API v2.", href: `${base}/json`, name: `${s.slug}.json` },
        ]
      : []),
    ...(hspy ? [{ id: "hspy", label: "HyperSpy", hint: "HDF5 for HyperSpy, with the beam energy, angles and DOI in its metadata.", href: `${base}/hspy`, name: `${s.slug}.hspy` }] : []),
    ...(original ? [{ id: "original", label: "Original file", hint: <>As the contributor uploaded it: <code>{original.filename}</code></>, href: href(original.r2_key), name: original.filename }] : []),
  ];
  const variants = b.files.filter((f) => f.role === "variant");
  const metadataFile = b.files.find((f) => f.role === "metadata");
  const axisLabel = (units: string) => (units === "counts" ? (s.type === "xrayabs" ? "Intensity" : "Counts") : UNIT_LABELS[units] ?? units);
  const versions = fileUrl
    ? [
        { label: "Main spectrum", src: fileUrl, axis: axisLabel(s.intensity_units) },
        ...variants
          .filter((f) => PLOTTABLE.test(f.filename))
          .map((f) => ({ label: VARIANTS[f.variant] ?? f.variant, src: href(f.r2_key), axis: axisLabel(variantUnits(f.variant) ?? s.intensity_units) })),
      ]
    : [];
  const cite = spectrumCitation(b);
  const licence = licenceOf(s.licence);
  const deconv = [
    Number(t.deconv_fourier_log) && "Fourier-log",
    Number(t.deconv_fourier_ratio) && "Fourier-ratio",
    Number(t.deconv_stephens) && "Stephens",
    Number(t.deconv_richardson_lucy) && "Richardson-Lucy",
    Number(t.deconv_maximum_entropy) && "Maximum entropy",
    t.deconv_other,
  ].filter(Boolean).join(", ");
  const canEdit = !!user && (s.owner_id === user.id || isModerator(user));
  const published = s.status === "published";
  if (published) c.set("spectrumId", s.id);
  const orcid = published ? ((await creatorOrcids(c.env.DB, [s.id])).get(s.id) ?? null) : null;
  const [owner, history, { results: usage }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT avatar_key, use_gravatar,
              ${GRAVATAR_EMAIL_SQL} AS email
       FROM users u WHERE id = ?`,
    ).bind(s.owner_id).first<any>(),
    published ? spectrumHistory(c.env.DB, s) : [],
    c.env.DB.prepare("SELECT surface, SUM(n) AS n FROM usage_daily WHERE dimension = 'spectrum' AND surface IN ('view', 'download') AND value = ? GROUP BY surface")
      .bind(String(s.id))
      .all<{ surface: string; n: number }>(),
  ]);
  const viewCount = usage.find((u) => u.surface === "view")?.n ?? 0;
  const downloadCount = usage.find((u) => u.surface === "download")?.n ?? 0;
  const plural = (n: number, word: string) => `${n.toLocaleString("en")} ${word}${n === 1 ? "" : "s"}`;
  const details = <>{" · "}<a href={`/spectra/${encodeURIComponent(s.slug)}/usage/`} data-open="usage-dialog">Details</a></>;
  const avatar = owner ? await avatarUrl(owner.avatar_key, owner.email, owner.use_gravatar) : null;
  const uploaderEmail = published ? await unclaimedUploaderEmail(c.env.DB, s.owner_id) : null;

  return c.html(
    <Layout user={c.get("user")}
      title={s.title}
      path="/spectra/"
      card={`spectra/${encodeURIComponent(s.slug)}`}
      description={`${s.title}${s.formula ? ` (${s.formula})` : ""}: ${(TYPE_NAMES[s.type] ?? s.type).toLowerCase()} spectrum in the EELS Data Base.`}
      head={
        <>
          <link rel="stylesheet" href="/vendor/uPlot.min.css" />
          {published && (
            <>
              <link rel="alternate" type="text/markdown" href={`/spectra/${encodeURIComponent(s.slug)}.md`} />
              <link rel="alternate" type="application/json" href={`${API_HOST}/v2/spectra/${s.id}`} />
              <link rel="alternate" type="application/ld+json" href={`${API_HOST}/dcat/spectra/${s.id}.jsonld`} />
              <script type="application/ld+json">{raw(jsonLdScript(schemaOrg(toRecord(b, orcid))))}</script>
            </>
          )}
        </>
      }
    >
      <p class="small back-link">
        <a href="/spectra/">← All spectra</a>
      </p>
      {b.spectrum.status !== "published" && (
        <p class="notice" role="status">Not published yet: this spectrum is waiting for a moderator. Only you and the moderators can see this page.</p>
      )}
      <div class="spectrum-head">
        <div>
          <h1>{s.title}</h1>
          <p class="byline">
            <TypeBadge type={s.type} boxed /> <Formula formula={s.formula} />
          </p>
        </div>
        <div class="head-actions">
        {canEdit && (
          <a class="button secondary" href={`/spectra/${encodeURIComponent(s.slug)}/edit/`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16z" />
            </svg>
            Edit
          </a>
        )}
        {user ? (
          <form method="post" action={`/favourites/${s.id}/`}>
            <button class="button secondary" type="submit" aria-pressed={favourite ? "true" : "false"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={favourite ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
              </svg>
              {favourite ? "Favourited" : "Favourite"}
            </button>
          </form>
        ) : (
          <a class="button secondary" href={`/login/?next=${encodeURIComponent(`/spectra/${s.slug}/`)}`}>Sign in to favourite</a>
        )}
        {fileUrl && (
          <>
            <button class="button secondary" type="button" popovertarget="save-plot">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="M21 16l-5-5-9 9" />
              </svg>
              Export
            </button>
            <div id="save-plot" class="save-plot" popover="auto" role="dialog" aria-labelledby="save-plot-title">
              <h2 id="save-plot-title">Export the plot</h2>
              <p class="muted small">An image of the plot as it is now, with any compared spectra.</p>
              <div class="save-grid">
                {(["png", "svg"] as const).map((f) => (
                  <>
                    <strong>{f.toUpperCase()}</strong>
                    {(["light", "dark"] as const).map((t) => (
                      <button type="button" class="button secondary" data-save-plot={`${f}-${t}`} aria-label={`Save as ${f.toUpperCase()}, ${t} theme`}>
                        {t === "light" ? "Light" : "Dark"}
                      </button>
                    ))}
                  </>
                ))}
              </div>
              <div class="dialog-actions">
                <button class="button secondary" type="button" popovertarget="save-plot" popovertargetaction="hide">Close</button>
              </div>
            </div>
          </>
        )}
        {fileUrl && (
          <button class="button" type="button" data-open="download-dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
            </svg>
            Download
          </button>
        )}
        </div>
      </div>

      {s.description && <p class="spectrum-comments">{s.description}</p>}

      <div class="plot-panel">
        <div
          id="plot"
          class="plot"
          data-src={fileUrl ?? ""}
          data-elements={JSON.stringify(b.elements)}
          data-edges={JSON.stringify(b.edges.map((e) => `${e.element}_${e.edge}`))}
          data-type={s.type}
          data-versions={JSON.stringify(versions)}
        >
          <p class="plot-message">{fileUrl ? "Loading spectrum…" : "No data file for this spectrum."}</p>
        </div>
        {fileUrl && <div class="plot-drop" id="plot-drop" hidden>Drop spectrum files to compare them with this one</div>}
        <div class="plot-tools">
          {versions.length > 1 && (
            <label>
              Show{" "}
              <select id="plot-version">
                {versions.map((v, i) => <option value={i}>{v.label}</option>)}
              </select>
            </label>
          )}
          <label><input type="checkbox" id="show-edges" checked /> Edge onsets (exSpy)</label>
          <label><input type="checkbox" id="show-minor" /> Minor edges</label>
          <span class="plot-hint">Drag a box to zoom, double-click to reset</span>
        </div>
      </div>

      <div class="spectrum-intro">
        <div>
          {fileUrl && (
            <div class="tool-box compare" id="compare" hidden>
              <h2 class="tool-box-head">Compare spectra</h2>
              <div class="tool-panel compare-body">
                <div class="compare-empty">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M2 21.5h20" stroke="var(--line)" />
                    <path d="M2 18l5-1 2-10 2 5 2-2 3 3 6 1" stroke="var(--plot)" />
                    <path d="M2 19.5l6-.5 2-8 2 3.5 2-1.5 3 2.5 5 .5" stroke="var(--compare-1)" />
                  </svg>
                  <p><strong>Check your data against this reference.</strong> Overlay spectra from your computer or from EELSdb on the plot, each in its own colour.</p>
                </div>
                <label class="button secondary compare-pick">
                  <input type="file" id="compare-file" multiple accept=".msa,.emsa,.txt,.csv,.dm3,.dm4,.emd,.hspy,.xdi" />
                  Compare with your spectra
                </label>
                <div class="picker compare-search">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="5.5" />
                    <path d="M12.6 12.6 17 17" />
                  </svg>
                  <input type="search" id="compare-search" data-slug={s.slug} autocomplete="off" placeholder="Or an EELSdb spectrum" aria-label="Compare with an EELSdb spectrum"
                    role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="compare-options" />
                  <ul class="picker-list" id="compare-options" role="listbox" aria-label="Spectra to compare" hidden></ul>
                </div>
                <div class="compare-empty">
                  <p>You can also drag files onto the plot. MSA, CSV, text, DM3/DM4, EMD, HSPY and XDI files are read in your browser and never uploaded.</p>
                </div>
                <span class="hint" id="compare-status" aria-live="polite"></span>
                <ul class="compare-list" id="compare-list" aria-label="Compared spectra" hidden></ul>
              </div>
            </div>
          )}
        </div>
        {fileName && PLOTTABLE.test(fileName) && (
          <div class="tool-box tool-tabs" id="process" hidden>
            <div class="tool-tab-bar" role="radiogroup" aria-label="Spectrum tools">
              <label><input type="radio" name="tool-tab" value="process" checked /><span>Adjust the plot</span></label>
              {s.status === "published" && <label><input type="radio" name="tool-tab" value="snippet" /><span>Use in HyperSpy</span></label>}
            </div>
            <div class="tool-panel process-panel">
              <div class="process-controls">
                {s.type === "coreloss" && (
                  <div class="bg-row">
                    <label>
                      Background{" "}
                      <select id="bg-mode">
                        <option value="">Off</option>
                        <option value="fit">Show power-law fit</option>
                        <option value="subtract">Subtract power law</option>
                      </select>
                    </label>
                    <span class="fit-window">
                      <span class="fit-range">
                        <input type="range" id="bg-from" step="0.1" aria-label="Fit window start (eV)" />
                        <input type="range" id="bg-to" step="0.1" aria-label="Fit window end (eV)" />
                      </span>
                      <span class="fit-text">
                        <input type="number" class="inline-num" id="bg-from-text" step="any" aria-label="Fit window start (eV)" /> to <input type="number" class="inline-num" id="bg-to-text" step="any" aria-label="Fit window end (eV)" /> eV
                      </span>
                      <button type="button" class="icon-button" id="bg-reset" title="Reset the fit window" aria-label="Reset the fit window">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      </button>
                    </span>
                  </div>
                )}
                <label>
                  Smoothing <input type="range" id="smooth" min="0" max="25" value="0" /> <span><input type="number" class="inline-num" id="smooth-text" min="0" step="2" placeholder="Off" aria-label="Smoothing window (points)" /><span> points</span></span>
                </label>
                <label>
                  Normalise intensity{" "}
                  <select id="normalise">
                    <option value="">Off</option>
                    <option value="max">To maximum</option>
                    <option value="area">To area</option>
                  </select>
                </label>
                <label><input type="checkbox" id="log-y" /> Log intensity scale</label>
                <div class="peaks-row">
                  <label><input type="checkbox" id="find-peaks" /> Label peaks</label>
                  <label class="peak-level">
                    Sensitivity <input type="range" id="peak-level" min="1" max="30" value="10" aria-describedby="peaks-status" />
                  </label>
                  <span class="hint" id="peaks-status" aria-live="polite"></span>
                </div>
                <div class="scale-row" hidden>
                  <label><input type="checkbox" id="compare-scale" checked aria-describedby="scale-note" /> Independent y axes</label>
                  <p class="hint" id="scale-note">Gives each compared spectrum its own axis on the right. Drag the top or bottom half of an axis to move its maximum or minimum, and double-click it to reset.</p>
                </div>
              </div>
              <p class="hint" id="process-status" aria-live="polite">Applies to compared spectra too. Only the view changes: downloads are the original data.</p>
            </div>
            {s.status === "published" && (
              <div class="tool-panel snippet-panel">
                {hspy ? (
                  <HyperSpySnippet url={`${SITE}/spectra/${s.slug}/download/hspy`} file="spectrum.hspy" live />
                ) : (
                  <HyperSpySnippet url={`${SITE}/spectra/${s.slug}/download/msa`} file="spectrum.msa" signalType={s.technique === "eels" ? "EELS" : undefined} live />
                )}
                <p class="hint">{hspy ? "The HyperSpy file loads with its metadata filled in." : "The MSA file has the beam energy and angles."} More in the <a href="/docs/use/python/">Python guide</a>.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div class="spectrum-cols">
        <section>
          <h2>Specimen</h2>
          <MetaList
            items={[
              ["Formula", s.formula && <Formula formula={s.formula} />],
              ["Elements", b.elements.join(", ")],
              ["Edges", b.edges.length ? <EdgeList b={b} /> : null],
              ["Source and purity", s.source_purity],
              ["Energy range", s.min_energy_ev !== null && s.max_energy_ev !== null ? `${Number(s.min_energy_ev.toFixed(2))} – ${Number(s.max_energy_ev.toFixed(2))} eV` : null],
              ["Step", fmt(s.step_ev, "eV", 4)],
              ["Phase", s.phase !== "solid" ? s.phase : null],
              ["Intensity", s.intensity_units !== "counts" ? s.intensity_units.replace("_", " ") : null],
              [
                "Submitter",
                <a class="by" href={`/author/${s.author_slug}/`}>
                  <Avatar name={s.author_display ?? ""} seed={s.author_slug ?? ""} src={avatar} />
                  <span class="by-name">{s.author_display}</span>
                </a>,
              ],
              [
                "Published",
                published && (
                  <>
                    <time datetime={String(s.published_at).replace(" ", "T")}>{String(s.published_at).slice(0, 10)}</time>
                    {" · "}
                    <a href={`/spectra/${encodeURIComponent(s.slug)}/history/`} data-open="history-dialog">History</a>
                  </>
                ),
              ],
              ["Usage", viewCount || downloadCount ? <>{plural(viewCount, "view")} · {plural(downloadCount, "download")}{details}</> : null],
            ]}
          />
          {uploaderEmail && (
            <p class="uploader-hint">
              Uploaded with the address {uploaderEmail}. Claim by adding this email to your profile under <a href="/account/settings/emails/">Settings → Email addresses</a>.
            </p>
          )}
          {b.keywords.length > 0 && (
            <>
              <h3>Keywords</h3>
              <ul class="tags">
                {b.keywords.map((k) => (
                  <li><a class="chip" href={`/spectra/?keyword=${encodeURIComponent(k)}`} title={`Spectra with the keyword "${k}"`}>{k}</a></li>
                ))}
              </ul>
            </>
          )}
          <h2>Treatment</h2>
          <MetaList
            items={[
              ["Dark current corrected", yesNo(t.dark_current)],
              ["Gain variation corrected", yesNo(t.gain_variation)],
              ["Calibration", t.calibration],
              ["Thickness", t.thickness_t_lambda && `${t.thickness_t_lambda} t/λ`],
              ["Deconvolution", deconv],
            ]}
          />
        </section>
        <section>
          {b.xas && (
            <>
              <h2>X-ray absorption</h2>
              <MetaList
                items={[
                  ["Facility", b.xas.facility],
                  ["Beamline", b.xas.beamline],
                  ["Source", b.xas.source_type],
                  ["Monochromator", b.xas.monochromator],
                  ["Resolving power", b.xas.resolving_power],
                  ["Detection", b.xas.detection_mode],
                  ["Polarisation", [b.xas.polarisation, b.xas.polarisation_angle_deg != null && `${b.xas.polarisation_angle_deg}°`].filter(Boolean).join(", ")],
                  ["Calibration reference", b.xas.calibration_reference],
                  ["I0 normalisation", b.xas.i0_normalisation],
                ]}
              />
            </>
          )}
          <h2>Acquisition</h2>
          <MetaList
            items={[
              [s.type === "xrayabs" ? "Beamline" : "Microscope", a.microscope],
              ["Gun", a.gun_type],
              ["Beam energy", measured(a.beam_energy_kv, "kV", a.beam_energy_source, a.beam_energy_uncertainty)],
              ["Convergence semi-angle", measured(a.convergence_mrad, "mrad", a.convergence_source, a.convergence_uncertainty)],
              ["Collection semi-angle", measured(a.collection_mrad, "mrad", a.collection_source, a.collection_uncertainty)],
              ["Instrument profile", a.instrument_profile_id && (
                <a href={`/instruments/${a.instrument_profile_id}/?version=${a.instrument_profile_version}`}>version {a.instrument_profile_version}</a>
              )],
              ["Resolution", fmt(a.resolution_ev, "eV", 3)],
              ["Monochromated", yesNo(a.monochromated)],
              ["Mode", a.acquisition_mode],
              ["Detector", a.detector],
              ["Probe size", fmt(a.probe_size_nm2, "nm²")],
              ["Beam current", a.beam_current],
              ["Integration time", fmt(a.integration_time_s, "s", 3)],
              ["Readouts", a.readouts],
            ]}
          />
          {r && (
            <>
              <h2>Reference</h2>
              <p>
                {referenceText({ ...r, doi: null })}
                {r.doi && (
                  <>
                    {referenceText({ ...r, doi: null }) && ". "}
                    <a href={`https://doi.org/${r.doi}`}>doi:{r.doi}</a>
                  </>
                )}
                {!r.doi && r.url && /^https?:\/\//.test(r.url) && (
                  <>
                    {" "}
                    <a href={r.url}>Link</a>
                  </>
                )}
              </p>
            </>
          )}
          {b.links.length > 0 && (
            <>
              <h2>Associated spectra</h2>
              <ul class="plain-list">
                {b.links.map((l) => (
                  <li>
                    <a href={`/spectra/${encodeURIComponent(l.slug)}/`}>{l.title}</a> <TypeBadge type={l.type} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {b.otherUrls.length > 0 && (
            <>
              <h2>Other links</h2>
              <ul class="plain-list">
                {b.otherUrls.map((u) => (
                  <li><a href={u.url}>{u.title || u.url}</a></li>
                ))}
              </ul>
            </>
          )}
          {metadataFile && (
            <details class="file-metadata" data-src={href(metadataFile.r2_key)}>
              <summary>Metadata from the file</summary>
              <p class="hint">
                Every tag in the uploaded file, read automatically when it was reviewed. Not checked by a person: some, such as the
                beam energy in DigitalMicrograph files, are typed in by hand and may be out of date.
              </p>
              <input type="search" class="metadata-filter" placeholder="Filter" aria-label="Filter the metadata" hidden />
              <div class="table-scroll"><table class="metadata-table"></table></div>
              <p class="small"><a href={href(metadataFile.r2_key)} download={metadataFile.filename}>Download as JSON</a></p>
            </details>
          )}
        </section>
      </div>

      {fileUrl && (
        <dialog id="download-dialog" aria-labelledby="download-title">
          <h2 id="download-title">Cite this spectrum</h2>
          <p class="muted small">
            If you use this spectrum, cite the contributor{r ? "'s paper" : ""} and the EELS Data Base. Licence:{" "}
            <a href={licence.url}>{licence.name}</a>.
          </p>
          <div class="cite-block">
            <div id="cite-text" class="cite-text">{cite.text}</div>
            <CopyButton target="cite-text" what="citation" />
          </div>
          <details class="cite-bib">
            <summary>BibTeX</summary>
            <div class="cite-block">
              <pre id="cite-bib">{cite.bib}</pre>
              <CopyButton target="cite-bib" what="BibTeX" />
            </div>
          </details>
          <fieldset class="download-formats">
            <legend>Format</legend>
            {downloads.map((d, i) => (
              <label>
                <input type="radio" name="download-format" value={d.href} data-name={d.name} checked={i === 0} />
                <span><strong>{d.label}</strong> <span class="muted small">{d.hint}</span></span>
              </label>
            ))}
          </fieldset>
          {variants.length > 0 && (
            <>
              <h3>Processed versions</h3>
              <ul class="plain-list small">
                {variants.map((f) => (
                  <li><a href={href(f.r2_key)} download={f.filename}>{VARIANTS[f.variant] ?? f.variant}</a> <span class="muted">({f.filename})</span></li>
                ))}
              </ul>
            </>
          )}
          <div class="dialog-actions">
            <button class="button secondary" type="button" data-close>Close</button>
            <a class="button" id="download-link" href={downloads[0]?.href ?? fileUrl} download={downloads[0]?.name ?? fileName} autofocus>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
              </svg>
              <span class="dl-name">Download {downloads[0]?.name ?? fileName}</span>
            </a>
          </div>
        </dialog>
      )}
      {(viewCount > 0 || downloadCount > 0) && (
        <dialog id="usage-dialog" aria-labelledby="usage-title">
          <h2 id="usage-title">Page views and downloads</h2>
          <div id="usage-body" aria-live="polite"><p class="muted">Loading…</p></div>
          <div class="dialog-actions">
            <button class="button secondary" type="button" data-close autofocus>Close</button>
          </div>
        </dialog>
      )}
      {published && (
        <dialog id="history-dialog" aria-labelledby="history-title">
          <h2 id="history-title">History</h2>
          <HistoryTimeline events={history} />
          <div class="dialog-actions">
            <button class="button secondary" type="button" data-close autofocus>Close</button>
          </div>
        </dialog>
      )}
      <script src="/vendor/uPlot.iife.min.js" defer></script>
      <script type="module" src="/spectrum.js"></script>
    </Layout>,
  );
}
