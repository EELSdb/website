// Markdown of a news article to HTML. The editor (public/news-editor.js) reads and writes the same syntax: keep the two in
// step, and extend the test in test/news.test.ts that renders every element.
import { Marked, type Tokens } from "marked";
import katex from "katex";

export const CALLOUTS = { note: "Note", tip: "Tip", caution: "Caution", danger: "Danger" } as const;
export const YOUTUBE_ID = /^[\w-]{11}$/;
const SIZES = new Set(["33%", "50%", "75%"]);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const parseAttrs = (s = ""): Record<string, string> => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
const layout = (a: Record<string, string>) =>
  (SIZES.has(a.width) ? ` data-width="${a.width}"` : "") + (a.float === "left" || a.float === "right" ? ` data-float="${a.float}"` : "");
// http(s) or a path on this site; anything else (javascript:, data:) shows as text.
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u) ? u : null);
// MathML, so pages need no maths script, stylesheet or fonts; trust stays off, so \href and friends are refused.
const math = (latex: string, displayMode: boolean) => katex.renderToString(latex, { output: "mathml", throwOnError: false, displayMode });

/** The YouTube ids in an article, for copying their thumbnails. */
export const youtubeIds = (md: string) =>
  [...md.matchAll(/^::youtube\{([^}]*)\}/gm)].map((m) => parseAttrs(m[1]).id).filter((id): id is string => YOUTUBE_ID.test(id ?? ""));

export const youtubeThumbKey = (id: string) => `news/youtube/${id}.jpg`;

/** The first uploaded image or video thumbnail in an article, for the news list. */
export const leadImage = (md: string) => {
  const m = md.match(/!\[[^\]]*\]\((\/media\/news\/[0-9a-f]{16}\.(?:png|jpg|webp|gif))[\s)]|^::youtube\{[^}]*\bid="([\w-]{11})"/m);
  return m ? (m[1] ?? `/media/${youtubeThumbKey(m[2])}`) : null;
};

function img(src: string, alt: string, title: string | null, attrs = "") {
  const url = safeUrl(src);
  if (!url) return esc(alt);
  return `<img src="${esc(url)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ""}${attrs} loading="lazy">`;
}

const marked = new Marked({
  gfm: true,
  extensions: [
    {
      name: "callout",
      level: "block",
      start: (src) => src.match(/^:::(?:note|tip|caution|danger)\b/m)?.index,
      tokenizer(src) {
        const m = /^:::(note|tip|caution|danger)[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n+|$)/.exec(src);
        if (m) return { type: "callout", raw: m[0], kind: m[1], tokens: this.lexer.blockTokens(m[2], []) };
      },
      renderer(t) {
        return `<aside class="callout" data-kind="${t.kind}"><p class="callout-label">${CALLOUTS[t.kind as keyof typeof CALLOUTS]}</p>${this.parser.parse(t.tokens!)}</aside>\n`;
      },
    },
    {
      name: "youtube",
      level: "block",
      start: (src) => src.match(/^::youtube\{/m)?.index,
      tokenizer(src) {
        const m = /^::youtube\{([^}]*)\}[ \t]*(?:\n+|$)/.exec(src);
        const a = m && parseAttrs(m[1]);
        if (a && YOUTUBE_ID.test(a.id ?? "")) return { type: "youtube", raw: m![0], id: a.id, attrs: a };
      },
      renderer(t) {
        return `<figure class="yt"${layout(t.attrs)}><a class="yt-link" href="https://www.youtube.com/watch?v=${t.id}" data-youtube="${t.id}" aria-label="Play the video"><img src="/media/${youtubeThumbKey(t.id)}" alt="" loading="lazy"><span class="yt-play" aria-hidden="true"></span></a></figure>\n`;
      },
    },
    {
      name: "blockMath",
      level: "block",
      start: (src) => src.match(/^\$\$/m)?.index,
      tokenizer(src) {
        const m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
        if (m) return { type: "blockMath", raw: m[0], latex: m[1].trim() };
      },
      renderer: (t) => `<div class="math-block">${math(t.latex, true)}</div>\n`,
    },
    {
      // Pandoc's rule, so "$5 and $10" stays text: no space just inside the dollar signs, no digit after the closing one.
      name: "inlineMath",
      level: "inline",
      start: (src) => src.indexOf("$"),
      tokenizer(src) {
        const m = /^\$(?!\s)([^$\n]*?[^\s$\\])\$(?!\d)/.exec(src);
        if (m) return { type: "inlineMath", raw: m[0], latex: m[1] };
      },
      renderer: (t) => math(t.latex, false),
    },
    {
      name: "imageAttrs",
      level: "inline",
      start: (src) => src.indexOf("!["),
      tokenizer(src) {
        const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\{([^}]*)\}/.exec(src);
        if (m) return { type: "imageAttrs", raw: m[0], alt: m[1], src: m[2], title: m[3] ?? null, attrs: parseAttrs(m[4]) };
      },
      renderer: (t) => img(t.src, t.alt, t.title, layout(t.attrs)),
    },
    // Superscript ^th^ and subscript ~2~ as in Pandoc, with no spaces inside. A single tilde is subscript, not strikethrough.
    {
      name: "sup",
      level: "inline",
      start: (src) => src.indexOf("^"),
      tokenizer(src) {
        const m = /^\^([^\s^]+)\^/.exec(src);
        if (m) return { type: "sup", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(t) {
        return `<sup>${this.parser.parseInline(t.tokens!)}</sup>`;
      },
    },
    {
      name: "sub",
      level: "inline",
      start: (src) => src.indexOf("~"),
      tokenizer(src) {
        const m = /^~([^\s~]+)~(?!~)/.exec(src);
        if (m) return { type: "sub", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(t) {
        return `<sub>${this.parser.parseInline(t.tokens!)}</sub>`;
      },
    },
  ],
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => esc(text),
    heading({ tokens, depth }: Tokens.Heading) {
      const level = Math.min(Math.max(depth, 2), 3);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      const url = safeUrl(href);
      return url ? `<a href="${esc(url)}"${title ? ` title="${esc(title)}"` : ""}>${text}</a>` : text;
    },
    image: ({ href, title, text }: Tokens.Image) => img(href, text, title),
  },
});

export const renderNews = (md: string) => marked.parse(md, { async: false }) as string;
