// The news editor (ADR 0038): Tiptap with our own toolbar, reading and writing the Markdown in the form's textarea.
// src/news-render.ts renders the same syntax for readers: keep the two in step.
import * as T from "/vendor/tiptap.mjs";

const $ = (s, r = document) => r.querySelector(s);
const form = $("#news-form");
const area = $("#f-body");
const data = JSON.parse($("#news-data").textContent);
const msg = $("#ne-msg");
const msgDefault = msg.textContent;
let msgTimer;
function say(t) {
  msg.textContent = t;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (msg.textContent = msgDefault), 6000);
}

const svg = (d) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons = {
  bold: svg('<path d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z" stroke-width="2"/>'),
  italic: svg('<path d="M9 4h6M5 16h6M12 4 8 16"/>'),
  sup: '<span aria-hidden="true">x<sup>2</sup></span>',
  sub: '<span aria-hidden="true">x<sub>2</sub></span>',
  link: svg('<path d="M8.6 11.4a3.4 3.4 0 0 0 4.8 0l2.6-2.6a3.4 3.4 0 0 0-4.8-4.8l-1 1"/><path d="M11.4 8.6a3.4 3.4 0 0 0-4.8 0L4 11.2A3.4 3.4 0 0 0 8.8 16l1-1"/>'),
  ul: svg('<path d="M8 5.5h9M8 10h9M8 14.5h9"/><circle cx="4" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="14.5" r="1" fill="currentColor" stroke="none"/>'),
  ol: svg('<path d="M8.5 5.5H17M8.5 10H17M8.5 14.5H17"/><path d="M3.4 4.4 4.6 3.6v4" stroke-width="1.3"/><path d="M3.2 12.4c.4-.7 2-.7 2 .3 0 .8-2 1.9-2 2.7h2.1" stroke-width="1.3"/>'),
  quote: svg('<path d="M4.5 4v12"/><path d="M8 6.5h8M8 10h8M8 13.5h5"/>'),
  image: svg('<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.5" cy="8.3" r="1.3"/><path d="m3.5 14.5 4-4 3 3 2-2 4 4"/>'),
  video: svg('<rect x="2.5" y="4.5" width="15" height="11" rx="3"/><path d="m8.5 7.8 4 2.2-4 2.2z" fill="currentColor"/>'),
  callout: svg('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M10 7.3v3.6M10 13.1v.01"/>'),
  card: svg('<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M5.5 8.5h5.5M5.5 11.5h3.5M12.8 10h2M14 8.6l1.2 1.4L14 11.4"/>'),
  hr: svg('<path d="M3 10h14"/><path d="M6 5.5h8M6 14.5h8" opacity=".4"/>'),
  math: svg('<path d="M2.5 11h2.5l2.5 5 4-12h6"/><path d="m11.5 9.5 4 4M15.5 9.5l-4 4" stroke-width="1.4"/>'),
  undo: svg('<path d="M7 4.5 3.5 8 7 11.5"/><path d="M4 8h8a4.5 4.5 0 0 1 0 9H9"/>'),
  redo: svg('<path d="M13 4.5 16.5 8 13 11.5"/><path d="M16 8H8a4.5 4.5 0 0 0 0 9h3"/>'),
};

// ---- Markdown syntax beyond CommonMark --------------------------------------------------------

const CALLOUTS = { note: "Note", tip: "Tip", caution: "Caution", danger: "Danger" };
const SIZES = { "33%": "Small", "50%": "Medium", "75%": "Large" };
const YOUTUBE_ID = /^[\w-]{11}$/;
const KATEX = { output: "mathml", throwOnError: false };
// Values escape " and \ with a backslash, so a link card's title can hold quotes and braces.
const parseAttrs = (s = "") => Object.fromEntries([...s.matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)].map(([, k, v]) => [k, v.replace(/\\(.)/g, "$1")]));
const attrMd = (k, v) => `${k}="${v.replace(/[\\"]/g, "\\$&")}"`;
const safeUrl = (u) => (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u) ? u : null);
const cleanLayout = (a = {}) => ({ width: SIZES[a.width] ? a.width : null, float: ["left", "right"].includes(a.float) ? a.float : null });
const layoutMd = (a) => [a.width && `width="${a.width}"`, a.float && `float="${a.float}"`].filter(Boolean).join(" ");
const layoutAttributes = () => ({
  width: { default: null, parseHTML: (el) => el.dataset.width ?? null, renderHTML: (a) => (a.width ? { "data-width": a.width } : {}) },
  float: { default: null, parseHTML: (el) => el.dataset.float ?? null, renderHTML: (a) => (a.float ? { "data-float": a.float } : {}) },
});
const ytId = (s) => s.trim().match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:\S*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)?.[1] ?? null;

const blockTokens = (lexer, src) => {
  const tokens = lexer.blockTokens(src);
  for (const t of tokens) if (t.text && !t.tokens?.length) t.tokens = lexer.inlineTokens(t.text);
  return tokens;
};

// Image layout: ![alt](src){width="50%" float="right"}
const SizedImage = T.Image.extend({
  addAttributes() { return { ...this.parent?.(), ...layoutAttributes() }; },
  markdownTokenizer: {
    name: "image",
    level: "inline",
    start: (src) => src.indexOf("!["),
    tokenize(src) {
      const m = src.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\{([^}]*)\}/);
      if (m) return { type: "image", raw: m[0], text: m[1], href: m[2], title: m[3] ?? null, layout: parseAttrs(m[4]) };
    },
  },
  parseMarkdown: (token, h) => h.createNode("image", { src: token.href, alt: token.text, title: token.title, ...cleanLayout(token.layout) }),
  renderMarkdown: (node) => {
    const a = node.attrs ?? {}, l = layoutMd(a);
    return `![${a.alt ?? ""}](${a.src ?? ""}${a.title ? ` "${a.title}"` : ""})${l ? `{${l}}` : ""}`;
  },
});

// Note boxes: :::note … :::
const Callout = T.Node.create({
  name: "callout",
  group: "block",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  addAttributes: () => ({ kind: { default: "note", parseHTML: (el) => el.dataset.kind, renderHTML: () => ({}) } }),
  parseHTML: () => [{ tag: "aside.callout" }],
  renderHTML: ({ node, HTMLAttributes }) => ["aside", T.mergeAttributes(HTMLAttributes, { class: "callout", "data-kind": node.attrs.kind, "data-label": CALLOUTS[node.attrs.kind] }), 0],
  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src) => src.search(/^:::(?:note|tip|caution|danger)\b/m),
    tokenize(src, _tokens, lexer) {
      const m = src.match(/^:::(note|tip|caution|danger)[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n+|$)/);
      if (m) return { type: "callout", raw: m[0], kind: m[1], tokens: blockTokens(lexer, m[2]) };
    },
  },
  parseMarkdown: (token, h) => h.createNode("callout", { kind: token.kind }, h.parseChildren(token.tokens)),
  renderMarkdown: (node, h) => `:::${node.attrs?.kind ?? "note"}\n${h.renderChildren(node.content ?? [], "\n\n")}\n:::`,
});

// Videos: ::youtube{id="…" width="50%" float="right"}. Moderators see the thumbnail straight from YouTube.
const YouTube = T.Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null, parseHTML: (el) => el.dataset.youtube, renderHTML: () => ({}) }, ...layoutAttributes() }),
  parseHTML: () => [{ tag: "div[data-youtube]" }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const id = YOUTUBE_ID.test(node.attrs.id ?? "") ? node.attrs.id : "";
    return ["div", T.mergeAttributes(HTMLAttributes, { class: "yt", "data-youtube": id, style: id ? `--thumb: url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")` : null }),
      ["span", { class: "yt-play", "aria-hidden": "true" }],
      ["span", { class: "yt-text" }, ["strong", {}, "YouTube video"], ["span", {}, `youtube.com/watch?v=${id}`]]];
  },
  markdownTokenizer: {
    name: "youtube",
    level: "block",
    start: (src) => src.search(/^::youtube\{/m),
    tokenize(src) {
      const m = src.match(/^::youtube\{([^}]*)\}[ \t]*(?:\n+|$)/);
      const a = m && parseAttrs(m[1]);
      if (a && YOUTUBE_ID.test(a.id ?? "")) return { type: "youtube", raw: m[0], id: a.id, layout: a };
    },
  },
  parseMarkdown: (token, h) => h.createNode("youtube", { id: token.id, ...cleanLayout(token.layout) }),
  renderMarkdown: (node) => { const l = layoutMd(node.attrs); return `::youtube{id="${node.attrs.id}"${l ? ` ${l}` : ""}}`; },
});

// Link cards: ::link{href="…" title="…" description="…"}. The editor shows a div, so a click selects the card instead of following it.
const SVG_NS = "http://www.w3.org/2000/svg";
const dataAttr = (k) => ({ default: null, parseHTML: (el) => el.dataset[k] ?? null, renderHTML: (a) => (a[k] ? { [`data-${k}`]: a[k] } : {}) });
const LinkCard = T.Node.create({
  name: "linkCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ href: dataAttr("href"), title: dataAttr("title"), description: dataAttr("description") }),
  parseHTML: () => [{ tag: "div.link-card[data-href]" }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const { href, title, description } = node.attrs;
    return ["div", T.mergeAttributes(HTMLAttributes, { class: "link-card" }),
      ["span", { class: "link-card-text" }, ["span", { class: "link-card-title" }, title || href || ""], ...(description ? [["span", { class: "link-card-desc" }, description]] : [])],
      [`${SVG_NS} svg`, { class: "link-card-arrow", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, [`${SVG_NS} path`, { d: "M4 10h12M11 5l5 5-5 5" }]]];
  },
  markdownTokenizer: {
    name: "linkCard",
    level: "block",
    start: (src) => src.search(/^::link\{/m),
    tokenize(src) {
      const m = src.match(/^::link\{((?:"(?:[^"\\\n]|\\.)*"|[^"}\n])*)\}[ \t]*(?:\n+|$)/);
      const a = m && parseAttrs(m[1]);
      if (a && safeUrl(a.href ?? "")) return { type: "linkCard", raw: m[0], attrs: a };
    },
  },
  parseMarkdown: (token, h) => h.createNode("linkCard", { href: token.attrs.href, title: token.attrs.title || null, description: token.attrs.description || null }),
  renderMarkdown: (node) => `::link{${["href", "title", "description"].filter((k) => node.attrs[k]).map((k) => attrMd(k, node.attrs[k])).join(" ")}}`,
});

// Superscript ^th^ and subscript ~2~, as in Pandoc, with no spaces inside.
const scriptMark = (Ext, name, ch, re) => Ext.extend({
  markdownTokenizer: {
    name,
    level: "inline",
    start: (src) => src.indexOf(ch),
    tokenize(src, _tokens, lexer) {
      const m = src.match(re);
      if (m) return { type: name, raw: m[0], tokens: lexer.inlineTokens(m[1]) };
    },
  },
  parseMarkdown: (token, h) => h.applyMark(name, h.parseInline(token.tokens || [])),
  renderMarkdown: (node, h) => `${ch}${h.renderChildren(node)}${ch}`,
});

// Pandoc's rule for inline maths, so "$5 and $10" stays text.
const InlineMath = T.InlineMath.extend({
  markdownTokenizer: {
    name: "inlineMath",
    level: "inline",
    start: (src) => src.indexOf("$"),
    tokenize(src) {
      const m = src.match(/^\$(?!\s)([^$\n]*?[^\s$\\])\$(?!\d)/);
      if (m) return { type: "inlineMath", raw: m[0], latex: m[1] };
    },
  },
});

// ---- Images ------------------------------------------------------------------------------------

const MAX_WIDTH = 1600;
const MAX_BYTES = 2 * 1024 * 1024;
const altFrom = (name) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

/** Shrinks a photo to MAX_WIDTH and re-encodes it if it is still too big. GIFs keep their animation. */
async function shrink(file) {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  if (bitmap.width <= MAX_WIDTH && file.size <= MAX_BYTES) return file;
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let blob = await canvas.convertToBlob({ type: file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg", quality: 0.85 });
  if (blob.size > MAX_BYTES) blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return new File([blob], file.name, { type: blob.type });
}

async function upload(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    say("Use a PNG, JPEG, WebP or GIF image.");
    return null;
  }
  say(`Uploading ${file.name}…`);
  const body = new FormData();
  body.append("file", await shrink(file));
  try {
    const res = await fetch("/admin/news/images/", { method: "POST", body });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    say(`Added ${file.name}.`);
    return out.url;
  } catch (err) {
    say(err.message || "The image could not be uploaded. Check your connection and try again.");
    return null;
  }
}

function pickImage() {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "image/png,image/jpeg,image/webp,image/gif";
    i.onchange = () => resolve(i.files[0] ?? null);
    i.click();
  });
}
const imageFiles = (dt) => [...(dt?.files ?? [])].filter((f) => f.type.startsWith("image/"));

// ---- The editor --------------------------------------------------------------------------------

// Text, not url: a path on the site is a valid card link but not a valid URL, and would block the form's submit.
const cardFields = `<label>Link to <input type="text" inputmode="url" data-f="href" spellcheck="false" autocomplete="off" placeholder="https://… or /news/…" /></label>
  <label>Title <input type="text" data-f="title" autocomplete="off" /></label>
  <label>Description <input type="text" data-f="description" autocomplete="off" placeholder="Optional, one line" /></label>`;
const ed = document.createElement("div");
ed.className = "ed";
ed.innerHTML = `
  <div class="tb-sticky">
    <div class="tb" role="toolbar" aria-label="Formatting">
      <select data-style aria-label="Text style"><option value="p">Paragraph</option><option value="2">Heading</option><option value="3">Subheading</option></select>
      <span class="sep"></span>
      <button type="button" class="tb-btn" data-cmd="bold" title="Bold (Ctrl+B)" aria-pressed="false">${icons.bold}</button>
      <button type="button" class="tb-btn" data-cmd="italic" title="Italic (Ctrl+I)" aria-pressed="false">${icons.italic}</button>
      <button type="button" class="tb-btn" data-cmd="sup" title="Superscript (Ctrl+.)" aria-pressed="false">${icons.sup}</button>
      <button type="button" class="tb-btn" data-cmd="sub" title="Subscript (Ctrl+,)" aria-pressed="false">${icons.sub}</button>
      <button type="button" class="tb-btn" data-cmd="link" title="Link (Ctrl+K)" aria-pressed="false">${icons.link}</button>
      <span class="sep"></span>
      <button type="button" class="tb-btn" data-cmd="ul" title="Bulleted list" aria-pressed="false">${icons.ul}</button>
      <button type="button" class="tb-btn" data-cmd="ol" title="Numbered list" aria-pressed="false">${icons.ol}</button>
      <button type="button" class="tb-btn" data-cmd="quote" title="Quote" aria-pressed="false">${icons.quote}</button>
      <span class="sep"></span>
      <button type="button" class="tb-btn" data-cmd="image" title="Add image">${icons.image}</button>
      <button type="button" class="tb-btn" data-cmd="video" title="Add YouTube video">${icons.video}</button>
      <button type="button" class="tb-btn" data-cmd="card" title="Add link card">${icons.card}</button>
      <button type="button" class="tb-btn" data-cmd="callout" title="Note box" aria-pressed="false">${icons.callout}</button>
      <button type="button" class="tb-btn" data-cmd="hr" title="Divider">${icons.hr}</button>
      <button type="button" class="tb-btn" data-cmd="math" title="Equation">${icons.math}</button>
      <span class="sep"></span>
      <button type="button" class="tb-btn" data-cmd="undo" title="Undo (Ctrl+Z)">${icons.undo}</button>
      <button type="button" class="tb-btn" data-cmd="redo" title="Redo (Ctrl+Shift+Z)">${icons.redo}</button>
      <span class="fill"></span>
      <div class="seg" role="group" aria-label="Editing view"><button type="button" data-view="visual" aria-pressed="true">Visual</button><button type="button" data-view="md" aria-pressed="false">Markdown</button></div>
    </div>
    <div class="tb-pops">
      <div class="tb-pop" data-pop="link" hidden>
        <label>Link to <input type="url" placeholder="https://…" /></label>
        <button class="button" type="button" data-link="apply">Apply</button>
        <button class="button secondary" type="button" data-link="remove">Remove link</button>
      </div>
      <div class="tb-pop media-pop" data-pop="media" hidden>
        <label data-alt>Describe this image <input type="text" placeholder="For people who can't see it, e.g. 'Carbon K edge of graphite'" /></label>
        <label data-yt>YouTube link <input type="url" spellcheck="false" placeholder="https://www.youtube.com/watch?v=…" /></label>
        <span class="pop-k">Size</span>
        <div class="seg" role="group" aria-label="Size">${[["33%", "Small"], ["50%", "Medium"], ["75%", "Large"], ["", "Full width"]].map(([v, l]) => `<button type="button" data-size="${v}" aria-pressed="false">${l}</button>`).join("")}</div>
        <span class="pop-k">Position</span>
        <div class="seg" role="group" aria-label="Position">${[["left", "Left", "Text wraps on the right"], ["", "Centre", "No text beside it"], ["right", "Right", "Text wraps on the left"]].map(([v, l, t]) => `<button type="button" data-pos="${v}" title="${t}" aria-pressed="false">${l}</button>`).join("")}</div>
      </div>
      <div class="tb-pop" data-pop="video" hidden>
        <label>YouTube link <input type="url" placeholder="https://www.youtube.com/watch?v=…" /></label>
        <button class="button" type="button" data-video="add">Add video</button>
      </div>
      <div class="tb-pop card-pop" data-pop="card" hidden>
        ${cardFields}
        <button class="button" type="button" data-card="add">Add link card</button>
      </div>
      <div class="tb-pop card-pop" data-pop="card-edit" hidden>${cardFields}</div>
      <div class="tb-pop math-pop" data-pop="math" hidden>
        <label>Equation <input type="text" spellcheck="false" autocomplete="off" placeholder="t/\\lambda = \\ln(I_t/I_0)" /></label>
        <div class="seg" role="group" aria-label="Placement"><button type="button" data-mplace="inline" aria-pressed="true">In the text</button><button type="button" data-mplace="block" aria-pressed="false">On its own line</button></div>
        <button class="button" type="button" data-math="ok">Insert</button>
        <button class="button secondary" type="button" data-math="remove" hidden>Remove</button>
        <output class="math-preview" aria-live="polite"></output>
        <p class="hint">Written in LaTeX, for example <code>E_0 = 200\\,\\mathrm{keV}</code> or <code>\\frac{I_1}{I_0}</code>. Click an equation in the article to change it.</p>
      </div>
      <div class="tb-pop" data-pop="callout" hidden>
        <label>Box style <select>${Object.entries(CALLOUTS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <button class="button secondary" type="button" data-callout="remove">Remove box</button>
      </div>
    </div>
  </div>
  <div class="ed-body-host"></div>`;
area.before(ed);
ed.append(area);
area.hidden = true;
area.setAttribute("aria-label", "Article text in Markdown");

// Enter in an option bar applies the option; it must never submit the whole form.
ed.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".tb-pop input")) e.preventDefault(); });
const tb = $(".tb", ed);
const pop = (name) => $(`[data-pop="${name}"]`, ed);
const linkPop = pop("link"), mediaPop = pop("media"), videoPop = pop("video"), mathPop = pop("math"), calloutPop = pop("callout"), cardPop = pop("card"), cardEditPop = pop("card-edit");
const linkIn = $("input", linkPop), altLabel = $("[data-alt]", mediaPop), altIn = $("input", altLabel), ytLabel = $("[data-yt]", mediaPop), ytIn = $("input", ytLabel);
const videoIn = $("input", videoPop), mathIn = $("input", mathPop), mathOut = $("output", mathPop), calloutSel = $("select", calloutPop), styleSel = $("[data-style]", ed);
const cardFieldsIn = (p) => Object.fromEntries([...p.querySelectorAll("input")].map((i) => [i.dataset.f, i]));
const cardIn = cardFieldsIn(cardPop), cardEd = cardFieldsIn(cardEditPop);
let mdMode = false;
let dirty = false;

async function insertFiles(files, pos) {
  for (const f of files) {
    const url = await upload(f);
    if (!url) continue;
    const node = { type: "image", attrs: { src: url, alt: altFrom(f.name) } };
    const ch = editor.chain().focus();
    (pos == null ? ch.insertContent(node) : ch.insertContentAt(pos, node)).run();
  }
}

const editor = new T.Editor({
  element: $(".ed-body-host", ed),
  extensions: [
    T.StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false, underline: false, link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
    SizedImage,
    T.Markdown,
    T.Placeholder.configure({ placeholder: "Write your article. Drag images in, or use the image button." }),
    Callout,
    YouTube,
    LinkCard,
    scriptMark(T.Superscript, "superscript", "^", /^\^([^\s^]+)\^/),
    scriptMark(T.Subscript, "subscript", "~", /^~([^\s~]+)~(?!~)/),
    InlineMath.configure({ katexOptions: KATEX, onClick: (node, pos) => openMath(node, pos) }),
    T.BlockMath.configure({ katexOptions: { ...KATEX, displayMode: true }, onClick: (node, pos) => openMath(node, pos) }),
  ],
  content: area.value,
  contentType: "markdown",
  editorProps: {
    attributes: { class: "ed-body prose", "aria-labelledby": "f-body-label" },
    handleDrop: (view, e) => {
      const fs = imageFiles(e.dataTransfer);
      if (!fs.length) return false;
      e.preventDefault();
      insertFiles(fs, view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos);
      return true;
    },
    handlePaste: (view, e) => {
      const fs = imageFiles(e.clipboardData);
      if (fs.length) { insertFiles(fs); return true; }
      const t = e.clipboardData.getData("text/plain").trim();
      const id = !/\s/.test(t) && ytId(t);
      if (!id) return false;
      editor.chain().focus().insertContent({ type: "youtube", attrs: { id } }).run();
      return true;
    },
    handleKeyDown: (view, e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); openLink(); return true; }
      return false;
    },
  },
  onUpdate: () => (dirty = true),
  onTransaction: () => sync(),
});
$('label[for="f-body"]').id = "f-body-label";

const active = { bold: "bold", italic: "italic", sup: "superscript", sub: "subscript", link: "link", ul: "bulletList", ol: "orderedList", quote: "blockquote", callout: "callout" };
function sync() {
  for (const b of tb.querySelectorAll("[data-cmd]")) {
    const a = active[b.dataset.cmd];
    if (a) b.setAttribute("aria-pressed", editor.isActive(a));
  }
  $('[data-cmd="undo"]', tb).disabled = mdMode || !editor.can().undo();
  $('[data-cmd="redo"]', tb).disabled = mdMode || !editor.can().redo();
  styleSel.value = editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : "p";
  const inCallout = !mdMode && editor.isActive("callout");
  calloutPop.hidden = !inCallout;
  if (inCallout) calloutSel.value = editor.getAttributes("callout").kind ?? "note";
  const node = editor.state.selection.node;
  const card = !mdMode && node?.type.name === "linkCard" ? node : null;
  cardEditPop.hidden = !card;
  if (card) for (const [k, i] of Object.entries(cardEd)) if (document.activeElement !== i) i.value = card.attrs[k] ?? "";
  const media = !mdMode && ["image", "youtube"].includes(node?.type.name) ? node : null;
  mediaPop.hidden = !media;
  if (!media) return;
  altLabel.hidden = media.type.name !== "image";
  if (document.activeElement !== altIn) altIn.value = media.attrs.alt ?? "";
  ytLabel.hidden = media.type.name !== "youtube";
  if (!ytLabel.hidden && document.activeElement !== ytIn) ytIn.value = `https://www.youtube.com/watch?v=${media.attrs.id}`;
  mediaPop.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-pressed", (media.attrs.width ?? "") === b.dataset.size));
  mediaPop.querySelectorAll("[data-pos]").forEach((b) => b.setAttribute("aria-pressed", (media.attrs.float ?? "") === b.dataset.pos));
}

function openLink() {
  linkIn.value = editor.getAttributes("link").href ?? "";
  videoPop.hidden = mathPop.hidden = cardPop.hidden = true;
  linkPop.hidden = false;
  $('[data-link="remove"]', linkPop).hidden = !editor.isActive("link");
  linkIn.focus();
}
function applyLink() {
  const href = linkIn.value.trim();
  linkPop.hidden = true;
  if (!href) return editor.chain().focus().extendMarkRange("link").unsetLink().run();
  if (editor.state.selection.empty && !editor.isActive("link")) {
    editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
  } else {
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }
}
$('[data-link="apply"]', linkPop).addEventListener("click", applyLink);
$('[data-link="remove"]', linkPop).addEventListener("click", () => { linkPop.hidden = true; editor.chain().focus().extendMarkRange("link").unsetLink().run(); });
linkIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); applyLink(); }
  if (e.key === "Escape") { linkPop.hidden = true; editor.commands.focus(); }
});

altIn.addEventListener("input", () => editor.chain().updateAttributes("image", { alt: altIn.value }).run());
const setVideo = () => {
  const { node, from } = editor.state.selection;
  if (node?.type.name !== "youtube") return;
  const id = ytId(ytIn.value);
  if (!id) return say("That doesn't look like a YouTube link.");
  if (id !== node.attrs.id) editor.chain().updateAttributes("youtube", { id }).setNodeSelection(from).run();
};
ytIn.addEventListener("change", setVideo);
ytIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); setVideo(); } });
mediaPop.addEventListener("click", (e) => {
  const b = e.target.closest("[data-size], [data-pos]");
  const { node, from } = editor.state.selection;
  if (!b || !node) return;
  const a = { width: node.attrs.width, float: node.attrs.float };
  if ("size" in b.dataset) { a.width = b.dataset.size || null; if (!a.width) a.float = null; }
  else { a.float = b.dataset.pos || null; if (a.float && !a.width) a.width = "50%"; }
  editor.chain().updateAttributes(node.type.name, a).setNodeSelection(from).run();
});

function addVideo() {
  const id = ytId(videoIn.value);
  if (!id) { say("That doesn't look like a YouTube link."); return videoIn.focus(); }
  videoPop.hidden = true;
  videoIn.value = "";
  editor.chain().focus().insertContent({ type: "youtube", attrs: { id } }).run();
}
$('[data-video="add"]', videoPop).addEventListener("click", addVideo);
videoIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addVideo(); }
  if (e.key === "Escape") { videoPop.hidden = true; editor.commands.focus(); }
});

// A bare host gets https://; other schemes, such as javascript:, stay refused.
const cardHref = (v) => (v ? safeUrl(/^[a-z][\w+.-]*:|^\//i.test(v) ? v : `https://${v}`) : null);
const badHref = () => say("Link to a web address (https://…) or a page on EELSdb (/…).");
function addCard() {
  const href = cardHref(cardIn.href.value.trim()), title = cardIn.title.value.trim();
  if (!href) { badHref(); return cardIn.href.focus(); }
  if (!title) { say("Give the card a title."); return cardIn.title.focus(); }
  cardPop.hidden = true;
  editor.chain().focus().insertContent({ type: "linkCard", attrs: { href, title, description: cardIn.description.value.trim() || null } }).run();
  for (const i of Object.values(cardIn)) i.value = "";
}
$('[data-card="add"]', cardPop).addEventListener("click", addCard);
for (const i of Object.values(cardIn)) i.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addCard();
  if (e.key === "Escape") { cardPop.hidden = true; editor.commands.focus(); }
});
const setCard = (k) => {
  const { node, from } = editor.state.selection;
  if (node?.type.name !== "linkCard") return;
  let v = cardEd[k].value.trim();
  if (k === "href" && !(v = cardHref(v))) return badHref();
  if (v !== (node.attrs[k] ?? "")) editor.chain().updateAttributes("linkCard", { [k]: v || null }).setNodeSelection(from).run();
};
for (const [k, i] of Object.entries(cardEd)) {
  i.addEventListener(k === "href" ? "change" : "input", () => setCard(k));
  i.addEventListener("keydown", (e) => { if (e.key === "Enter") setCard(k); });
}

calloutSel.addEventListener("change", () => editor.chain().focus().updateAttributes("callout", { kind: calloutSel.value }).run());
$('[data-callout="remove"]', calloutPop).addEventListener("click", () => editor.chain().focus().lift("callout").run());

const mathOk = $('[data-math="ok"]', mathPop), mathRemove = $('[data-math="remove"]', mathPop);
let mathEdit = null, mathPlace = "inline";
const previewMath = () => {
  const v = mathIn.value.trim();
  mathOut.innerHTML = v ? T.katex.renderToString(v, { ...KATEX, displayMode: mathPlace === "block" }) : "";
};
const setPlace = (p) => {
  mathPlace = p;
  mathPop.querySelectorAll("[data-mplace]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mplace === p));
  previewMath();
};
function openMath(node, pos) {
  mathEdit = node ? { type: node.type.name, pos } : null;
  const { from, to, empty } = editor.state.selection;
  mathIn.value = node ? node.attrs.latex : empty ? "" : editor.state.doc.textBetween(from, to);
  setPlace(node?.type.name === "blockMath" ? "block" : "inline");
  mathOk.textContent = node ? "Update" : "Insert";
  mathRemove.hidden = !node;
  linkPop.hidden = videoPop.hidden = cardPop.hidden = true;
  mathPop.hidden = false;
  mathIn.focus();
}
const closeMath = () => { mathPop.hidden = true; mathEdit = null; };
function applyMath() {
  const latex = mathIn.value.trim();
  if (!latex) return mathIn.focus();
  const block = mathPlace === "block";
  let ch = editor.chain().focus();
  if (mathEdit && (mathEdit.type === "blockMath") === block) {
    ch = block ? ch.updateBlockMath({ latex, pos: mathEdit.pos }) : ch.updateInlineMath({ latex, pos: mathEdit.pos });
  } else {
    if (mathEdit) ch = mathEdit.type === "blockMath" ? ch.deleteBlockMath({ pos: mathEdit.pos }) : ch.deleteInlineMath({ pos: mathEdit.pos });
    else if (!editor.state.selection.empty) ch = ch.deleteSelection();
    ch = block ? ch.insertBlockMath({ latex }) : ch.insertInlineMath({ latex });
  }
  ch.run();
  closeMath();
}
mathIn.addEventListener("input", previewMath);
mathIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); applyMath(); }
  if (e.key === "Escape") { closeMath(); editor.commands.focus(); }
});
mathPop.querySelectorAll("[data-mplace]").forEach((b) => b.addEventListener("click", () => setPlace(b.dataset.mplace)));
mathOk.addEventListener("click", applyMath);
mathRemove.addEventListener("click", () => {
  const { type, pos } = mathEdit;
  (type === "blockMath" ? editor.chain().focus().deleteBlockMath({ pos }) : editor.chain().focus().deleteInlineMath({ pos })).run();
  closeMath();
});

const run = {
  bold: (c) => c.toggleBold(), italic: (c) => c.toggleItalic(), sup: (c) => c.toggleSuperscript(), sub: (c) => c.toggleSubscript(),
  ul: (c) => c.toggleBulletList(), ol: (c) => c.toggleOrderedList(), quote: (c) => c.toggleBlockquote(),
  callout: (c) => (editor.isActive("callout") ? c.lift("callout") : c.wrapIn("callout", { kind: "note" })),
  hr: (c) => c.setHorizontalRule(),
  undo: (c) => c.undo(), redo: (c) => c.redo(),
};
tb.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-cmd]");
  if (!b || b.disabled) return;
  const c = b.dataset.cmd;
  if (c === "link") return openLink();
  if (c === "video") { linkPop.hidden = mathPop.hidden = cardPop.hidden = true; videoPop.hidden = false; return videoIn.focus(); }
  if (c === "card") { linkPop.hidden = videoPop.hidden = mathPop.hidden = true; cardPop.hidden = false; return cardIn.href.focus(); }
  if (c === "math") return openMath();
  if (c === "image") { const f = await pickImage(); if (f) insertFiles([f]); return; }
  run[c](editor.chain().focus()).run();
});
styleSel.addEventListener("change", () => {
  const ch = editor.chain().focus();
  (styleSel.value === "p" ? ch.setParagraph() : ch.setHeading({ level: +styleSel.value })).run();
});

// Visual or Markdown: the Markdown view is the form's own textarea.
ed.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
  const toMd = b.dataset.view === "md";
  if (toMd === mdMode) return;
  if (toMd) area.value = editor.getMarkdown();
  else editor.commands.setContent(area.value, { contentType: "markdown" });
  mdMode = toMd;
  ed.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  editor.view.dom.hidden = mdMode;
  area.hidden = !mdMode;
  linkPop.hidden = videoPop.hidden = mathPop.hidden = cardPop.hidden = true;
  tb.querySelectorAll("[data-cmd], [data-style]").forEach((x) => (x.disabled = mdMode));
  sync();
  (mdMode ? area : editor.view.dom).focus();
}));
sync();
const header = $(".site-header");
const setHeader = () => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
addEventListener("resize", setHeader);
setHeader();

// ---- Authors ----------------------------------------------------------------------------------

const authorsIn = $("#f-authors");
const picker = $("#au-picker");
picker.insertAdjacentHTML("beforeend", `<input type="text" id="au-input" role="combobox" autocomplete="off" spellcheck="false" placeholder="Add an author"
  aria-autocomplete="list" aria-expanded="false" aria-controls="au-list" aria-describedby="au-hint au-byline">
  <ul class="picker-list" id="au-list" role="listbox" aria-label="Matching people" hidden></ul>`);
const auIn = $("#au-input"), auList = $("#au-list"), auChips = $(".picker-chips", picker);
const people = new Map(data.people.map((p) => [p.id, p]));
let authors = JSON.parse(authorsIn.value || "[]").map((a) => (a.id && people.get(a.id)) || a);
let auOpts = [], auAct = -1;

function avatarEl(p) {
  const s = document.createElement("span");
  s.className = `av ${p.hue ?? "av-none"}`;
  s.setAttribute("aria-hidden", "true");
  s.textContent = p.initials ?? p.name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return s;
}
function renderAuthors() {
  auChips.replaceChildren(...authors.map((p) => {
    const li = document.createElement("li");
    li.innerHTML = '<button type="button" class="chip"><span class="v"></span> <span aria-hidden="true">×</span></button>';
    const b = li.firstChild;
    b.prepend(avatarEl(p));
    b.setAttribute("aria-label", `Remove ${p.name}`);
    $(".v", li).textContent = p.name;
    b.addEventListener("click", () => { authors = authors.filter((x) => x !== p); renderAuthors(); auIn.focus(); });
    return li;
  }));
  auChips.hidden = !authors.length;
  authorsIn.value = JSON.stringify(authors.map((a) => (a.id ? { id: a.id } : { name: a.name })));
  $("#au-byline").textContent = authors.length ? `Byline: ${new Intl.ListFormat("en-GB").format(authors.map((a) => a.name))}` : "Add at least one author.";
}
function auSetAct(i) {
  auAct = i;
  auList.querySelectorAll("[role=option]").forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
  if (i < 0) return auIn.removeAttribute("aria-activedescendant");
  auIn.setAttribute("aria-activedescendant", `au-opt-${i}`);
  auList.children[i].scrollIntoView({ block: "nearest" });
}
function auClose() { auList.hidden = true; auIn.setAttribute("aria-expanded", "false"); auSetAct(-1); }
function auOpen() {
  const q = auIn.value.trim(), ql = q.toLowerCase();
  const taken = new Set(authors.map((a) => a.name.toLowerCase()));
  auOpts = data.people.filter((p) => !taken.has(p.name.toLowerCase()) && (!ql || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(ql)) || p.name.toLowerCase().startsWith(ql))).slice(0, 12);
  if (q && !taken.has(ql) && !data.people.some((p) => p.name.toLowerCase() === ql)) auOpts.push({ name: q, free: true });
  auList.replaceChildren(...(auOpts.length
    ? auOpts.map((p, i) => {
        const li = document.createElement("li");
        li.id = `au-opt-${i}`;
        li.setAttribute("role", "option");
        li.innerHTML = p.free ? '<span>Add “<span class="v"></span>” without an account</span>' : '<span class="v"></span><span class="n"></span>';
        li.prepend(avatarEl(p));
        $(".v", li).textContent = p.name;
        if (!p.free) $(".n", li).textContent = p.role;
        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", () => auPick(i));
        return li;
      })
    : [Object.assign(document.createElement("li"), { className: "none", textContent: "Type a name to add someone" })]));
  auList.hidden = false;
  auIn.setAttribute("aria-expanded", "true");
  auSetAct(auOpts.length ? 0 : -1);
}
function auPick(i) {
  const p = auOpts[i];
  authors.push(p.free ? { name: p.name } : p);
  auIn.value = "";
  dirty = true;
  renderAuthors();
  auClose();
}
auIn.addEventListener("input", auOpen);
auIn.addEventListener("focus", auOpen);
auIn.addEventListener("blur", auClose);
auIn.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (auList.hidden) return auOpen();
    const n = auOpts.length;
    if (n) auSetAct((auAct + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (!auList.hidden && auAct >= 0) auPick(auAct);
  } else if (e.key === "Escape") auClose();
  else if (e.key === "Backspace" && !auIn.value && authors.length) { authors.pop(); dirty = true; renderAuthors(); }
});
renderAuthors();

// ---- Web address and saving ---------------------------------------------------------------------

const slugIn = $("#f-slug");
let slugTouched = !data.isNew || slugIn.value !== "";
slugIn.addEventListener("input", () => (slugTouched = true));
$("#f-title").addEventListener("input", (e) => {
  if (!slugTouched) slugIn.value = e.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
});
form.addEventListener("input", () => (dirty = true));
form.addEventListener("submit", () => {
  if (!mdMode) area.value = editor.getMarkdown();
  dirty = false;
});
addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });
