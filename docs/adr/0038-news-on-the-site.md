---
title: "0038. News written on the site"
description: "Moderators write news in the browser with Tiptap. The site stores articles as Markdown, with directives for notes and videos."
adr:
  date: 2026-11-06
---

## Context

- The site shows the old site's nine news posts as an archive of simple HTML ([ADR 0010](/docs/adr/0010-migrating-public-data/)). Nobody can add or edit news.
- EELSdb needs news for announcements, such as new features, meetings, papers and changes to the database.
- Moderators write the news. Many of them do not use Markdown, Git or a terminal. Writing must therefore work in a web page, and the page should look like the published article.
- Each news page has a Markdown version for AI agents ([ADR 0028](/docs/adr/0028-agent-facing-surface/)). The stored format should make this version easy to produce.
- Workers do not run code that is made from strings (`eval`, `new Function`).
- The site keeps its dependencies few, and it vendors its browser libraries ([ADR 0004](/docs/adr/0004-server-rendered-hono/)).

## Decision

### Writing

- Moderators and admins write and edit news at `/admin/news/`, under **News** in the staff menu. The page lists drafts first, then published articles, newest first.
- The editor is Tiptap, with StarterKit, Image, Superscript, Subscript, Mathematics and the Markdown extension. esbuild bundles it into `worker/public/vendor/`, like `@simplewebauthn/browser`. Only the editor page loads it.
- The toolbar is our own and uses the site's style. The editing area uses the published article's styles, so the moderator sees the article as readers will see it.
- A Visual/Markdown switch shows the same article as Markdown, for people who prefer to type Markdown.
- The editor allows only the formatting below. Text pasted from Word or Google Docs is reduced to this formatting:
  - paragraphs, headings and subheadings (levels 2 and 3, because the title is level 1)
  - bold, italic, superscript, subscript and links
  - equations in LaTeX, in the text or on their own line
  - bulleted lists, numbered lists and quotes
  - images, each with a description (alt text)
  - notes, of four kinds: note, tip, caution and danger
  - YouTube videos
  - dividers (horizontal rules).
- Images and videos have a size (small, medium, large or full width: 33%, 50%, 75% or 100% of the text column) and a position (centred, or floated left or right with text wrapping beside them). Floating a full-width item makes it medium. On narrow screens, floated items go full width.
- An article has a title, a summary, a web address, a date and one or more authors. The summary is one or two sentences. The news list, the share card ([ADR 0036](/docs/adr/0036-share-cards/)) and the page description use it.

### Storage and display

- The site stores the article body as Markdown. Notes and videos use Markdown directives, the size and position of images and videos use an attribute block, superscript and subscript use carets and tildes as in Pandoc, and equations use dollar signs:

  ```markdown
  :::note
  Text of the note.
  :::

  ::youtube{id="aBcDeFgHiJk" width="50%" float="right"}

  ![Carbon K edge of graphite](/media/news/2026/c-k-edge.png){width="33%" float="left"}

  ---

  The 15^th^ meeting, the Ti L~2,3~ edge of TiO~2~, and $t/\lambda = \ln(I_t/I_0)$.

  $$
  E_0 = 200\,\mathrm{keV}
  $$
  ```

- Superscript and subscript hold no spaces, as in Pandoc. A single tilde is subscript, not strikethrough, which the editor does not offer.
- Inline maths follows Pandoc's rule, so that prices stay text ("$5 and $10"): no space just inside the dollar signs, and no digit straight after the closing one.

- The renderer accepts only the listed sizes (`33%`, `50%`, `75%`) and floats (`left`, `right`). It ignores any other value and shows the item centred at full width.

- The four kinds of note are the kinds of aside that the docs use ([ADR 0005](/docs/adr/0005-docs-astro-starlight/)), so news and docs share one syntax.
- The Worker renders the Markdown with `marked`, plus small extensions for the directives, the attribute blocks, superscript, subscript and maths. KaTeX turns each equation into MathML on the server. Browsers draw MathML themselves, so public pages need no maths script, stylesheet or fonts. The editor uses KaTeX's MathML output too, so it shows equations as readers will see them. The renderer follows these rules ([ADR 0032](/docs/adr/0032-security-baseline/)):
  - It escapes raw HTML in the Markdown and does not render it.
  - A link or image address must match `^https?://` or be a path on the site. The renderer shows any other address as text.
  - A YouTube id must match `^[A-Za-z0-9_-]{11}$`.
- The `.md` version of a news page serves the stored Markdown, with the title, date and authors at the top.
- Tiptap reads and writes the directives and superscript through hooks of its Markdown extension. The editor and the Worker must agree on the syntax. Keep the two in step by hand, as for the edge-label regex ([ADR 0004](/docs/adr/0004-server-rendered-hono/)). A Worker test renders a sample article that uses every element.

### Authors

- An article has one or more authors, in byline order. An author is either an account or a plain name, so that the byline can credit people without an account.
- The byline shows each author's avatar and name, like the credits on spectrum pages. An author with an author page ([ADR 0031](/docs/adr/0031-public-profiles-and-privacy/)) is linked to it and shows their picture; any other author shows initials only. An archived post's author is found by the old profile address (`/author/{slug}/`), also after a rename. A news byline does not create an author page, but the author page lists the person's published articles.
- The author field looks and works like the browse page's author picker, with avatars, and adds names without an account. It suggests staff and accounts that have an author page. Anyone else is added by name, so the editor does not list private accounts.

### Drafts, publishing and edits

- An article is a draft until a moderator publishes it. Only published articles are public: in the news list, on the page, in the `.md` version, on the share card and in the sitemap. Moderators can preview a draft at its address. A draft can be deleted; a published article cannot.
- A published article has no draft. When a moderator saves it, the public page changes at once.
- The web address is set before publishing. It cannot change after publishing, so that links keep working.
- Each save of a published article keeps the previous version in a history table, with the person who saved it and the time. Any moderator can restore an earlier version from the editor, and the version it replaces is kept too.
- News lives at `/news/{slug}/`. The archive's addresses at the site root (`/{slug}/`) redirect there with a 301.

### Images and videos

- Images go to R2 under `news/`. They follow the rules for avatars ([ADR 0031](/docs/adr/0031-public-profiles-and-privacy/)):
  - The browser shrinks each image to at most 1600 px wide before upload.
  - The server accepts PNG, JPEG, WebP and GIF, checks the magic bytes and refuses SVG.
  - The server refuses an image over 2 MB after shrinking, because EELSdb does not store large files ([ADR 0014](/docs/adr/0014-extracted-spectra-only/)).
  - The Content-Type comes from the checked type, never from the client ([ADR 0032](/docs/adr/0032-security-baseline/)).
- A YouTube video shows as a thumbnail with a play button. The page loads the player from `youtube-nocookie.com` only when the reader clicks. The Worker copies the thumbnail to R2 when the article is saved. A reader's browser therefore contacts YouTube only after a click ([ADR 0006](/docs/adr/0006-no-hard-external-dependencies/)).
- The editor shows each video's thumbnail straight from YouTube (`i.ytimg.com`), so moderators see which video they added. Only moderators open the editor.
- When a video is selected, the editor shows its link, and pasting a new link swaps the video and keeps its size and position.
- A daily job deletes uploaded images and video thumbnails that no article, draft or earlier version uses. It deletes them only 7 days after upload, so an image in an article that is not saved yet stays.

### The archive and API v1

- Archived articles keep `body_html`. When a moderator first edits an archived article, the editor opens it converted to Markdown by `htmlToMarkdown` (`worker/src/pages/markdown.ts`). The save stores the Markdown and leaves `body_html` as it is. The page shows the Markdown when it exists. To restore the archived version, delete the Markdown.
- Archived articles keep their recorded summary and author in `legacy_v1`. The pages use them while `summary` and the authors table are empty, and the first save in the editor fills both in. The migration copies nothing, because the seed loads after the migrations.
- API v1 is frozen ([ADR 0008](/docs/adr/0008-api-v1-frozen-contract/)). Its news routes return only the archived articles, from `legacy_v1`, exactly as recorded, also after an edit. New articles are not in API v1. API v2 has no news routes.

### Schema

- `news` gets new columns: `body_md`, `summary`, `status` (`draft` or `published`), `created_by` and `updated_at`. Archived articles keep their WordPress post ID as `id`.
- `news_authors` holds `news_id`, `position`, `user_id` (empty for a plain name) and `name`.
- `news_history` holds `news_id`, `user_id`, the time, and the previous title, summary and Markdown.

## Consequences

- News is no longer a frozen archive. `PRODUCT.md` lists it as a moderator task.
- The editor page loads about 224 KB of Tiptap and KaTeX (gzip). Public pages load nothing new, except a small script that turns a video thumbnail into a player.
- The Worker gets two new dependencies: `marked` (46 KB minified, 14 KB gzip) and `katex` (273 KB minified, 76 KB gzip).
- We maintain the toolbar and the extensions for directives and superscript, in the editor and in the renderer. A new kind of block needs changes in the editor, the renderer and the `.md` version.
- Markdown viewers that do not know directives show `:::note` and `::youtube{…}` as plain text, and show an image's attribute block (`{width="50%" float="right"}`) after the image. This includes AI agents that read the `.md` pages. The text stays readable.
- Moderators can name anyone as an author. The byline shows the account's display name, which is already public on any page that credits the account.

## Alternatives considered

- **Other editors.** A mockup tried five editors on the same article. The Research section gives the sizes.
  - A plain text box with a Markdown toolbar and a preview tab: the smallest, but moderators see the Markdown symbols and must preview to check.
  - EasyMDE: Markdown that is styled as you type, but still Markdown. It is built on CodeMirror 5, which is legacy and awkward on phones.
  - Milkdown (Crepe): a polished visual editor with no toolbar to write, but the largest, with its own look. Its image blocks write the image size where the description belongs (`![1.00](…)`), so descriptions are lost.
  - Trix: the smallest visual editor, but it saves HTML with `<div>` and `<br>` in place of paragraphs, and it has one heading level.
  - OverType: a lighter EasyMDE, first released in 2025, with one main maintainer.
  - Toast UI Editor: Markdown and visual tabs in one editor, but no release since February 2023.
  - Quill 2: stores HTML or its own Delta format, embeds images as base64 unless we replace that, and releases slowly.
  - CKEditor 5 and TinyMCE: GPL or a paid licence with a licence key, and much more than news needs.
  - Lexical, BlockNote and Editor.js: React-first, or block JSON that needs its own renderer.
- **Storing HTML.** Visual editors produce HTML, but the server would have to clean it with an allow-list, and the `.md` version would need a step from HTML to Markdown.
- **MDX.** MDX gives named components with settings, but it lost for these reasons:
  - MDX is code. `@mdx-js/mdx` runs the compiled article with `new Function`, which Workers block. A safe renderer would have to walk the MDX tree itself.
  - A stray `<` or `{` is a syntax error, and scientists write "< 1 eV" and "{001} planes".
  - The compiler brings 63 packages.
  - The `.md` version would show raw JSX.
- **GitHub alerts (`> [!NOTE]`) for notes.** Any Markdown viewer shows them as a quote. But they differ from the docs' `:::` asides, and the same syntax cannot carry a video.
- **A draft of a published article.** News edits are usually small fixes. A second version would add screens and a choice about which version wins. The history table makes each save reversible.
- **Loading KaTeX in the editor only when an article has maths.** Tiptap fixes its node types when the editor starts, so this needs our own equation nodes or a restart of the editor on first use. KaTeX adds 78 KB (gzip) to a page that only moderators open and that their browser caches. Readers never load KaTeX either way.
- **KaTeX's HTML output for equations.** It looks the same in every browser, but each page with an equation would need KaTeX's stylesheet and some of its 1.1 MB of fonts. MathML needs neither.
- **Resizing images by dragging.** Tiptap's Image extension can resize by dragging a corner, to any width in pixels. Pixel widths do not adapt to the screen, and free sizes make articles look different from each other. Four preset sizes are enough for news.
- **Embedding the YouTube player directly.** Each reader's browser would contact Google when the page loads, also with `youtube-nocookie.com`.
- **News at the site root.** The archive's root addresses (`/{slug}/`) share their space with every top-level route. A new route could hide an article, and an article could hide a route.
- **Archived articles stay read-only.** This is simpler, but nobody could then fix a mistake or a dead link in an archived article.

## Research: editor bundle sizes (2026-11-06)

The mockup's bundles, built with esbuild, minified and gzipped. Each version was at least two weeks old.

| Editor | Version | Saves | Size (gzip) |
|---|---|---|---|
| Text box with `@github/markdown-toolbar-element` and `marked` | 2.2.3, 18.1.1 | Markdown | 17 KB |
| EasyMDE (JS and CSS) | 2.21.0 | Markdown | 110 KB |
| Tiptap (StarterKit, Image, Markdown, Placeholder) | 3.32.0 | Markdown | 146 KB |
| Tiptap as above, plus Superscript, Subscript, Mathematics and KaTeX 0.16.47 | 3.32.0 | Markdown | 224 KB |
| Milkdown Crepe, only the features we need (JS and CSS) | 7.22.3 | Markdown | 233 KB |
| Milkdown Crepe, all features (JS) | 7.22.3 | Markdown | 925 KB |
| Trix (JS and CSS) | 2.1.19 | HTML | 56 KB |
| OverType | 2.6.1 | Markdown | 40 KB |

- The Tiptap StarterKit bundle includes `marked`, which the Markdown extension uses. A bundle with only the extensions we use would be smaller.
- In Tiptap 3.32, the Image, Blockquote, horizontal rule and Mathematics extensions read and write Markdown. The YouTube, Details, Superscript and Subscript extensions do not, so they need our own Markdown hooks.
- Tiptap's built-in rule for inline maths (`$…$`) reads "$5 and $10" as an equation, so the editor replaces it with the Pandoc rule above.
