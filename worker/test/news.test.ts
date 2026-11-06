import { env, exports } from "cloudflare:workers";
import { afterAll, describe, expect, it } from "vitest";
import { deleteUnusedNewsImages } from "../src/news";
import { leadImage, renderNews, youtubeIds } from "../src/news-render";
import { sessionFor } from "./helpers/session";

const SITE = "https://eelsdb.eu";
const page = (path: string, cookie?: string) => exports.default.fetch(`${SITE}${path}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
const form = (path: string, cookie: string, body: Record<string, string>) =>
  exports.default.fetch(`${SITE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookie, Origin: SITE, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
const upload = (cookie: string, file: File) => {
  const body = new FormData();
  body.append("file", file);
  return exports.default.fetch(`${SITE}/admin/news/images/`, { method: "POST", headers: { Cookie: cookie, Origin: SITE }, body });
};

const MOD = { id: 9910101, display_name: "News Moderator", role: "moderator" };
const USER = { id: 9910102, display_name: "Plain User" };
const WRITER = 9910103;
const CHRIS = 9910104;
const article = (over: Record<string, string> = {}) => ({
  title: "A test article",
  summary: "One sentence about it.",
  slug: "test-article",
  date: "2026-11-06",
  body: "Hello **world**.",
  authors: JSON.stringify([{ id: MOD.id }, { name: "Guest Writer" }]),
  action: "draft",
  ...over,
});
const idOf = (res: Response) => Number(res.headers.get("location")!.match(/\/admin\/news\/(\d+)\//)![1]);

afterAll(async () => {
  const ids = [MOD.id, USER.id, WRITER, CHRIS];
  await env.DB.batch([
    env.DB.prepare("DELETE FROM news WHERE created_by IN (?, ?, ?, ?)").bind(...ids),
    ...["sessions", "user_totp", "user_emails", "user_slug_history"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id IN (?, ?, ?, ?)`).bind(...ids)),
    env.DB.prepare("DELETE FROM users WHERE id IN (?, ?, ?, ?)").bind(...ids),
  ]);
});

describe("news Markdown", () => {
  it("renders every element the editor can write", () => {
    const html = renderNews(
      [
        "## Heading",
        "### Subheading",
        "**bold**, *italic*, 15^th^, TiO~2~, [a link](https://eelsdb.eu/) and $t/\\lambda$.",
        "- one\n- two",
        "1. first\n2. second",
        "> A quote",
        "![Carbon K edge](/media/news/0123456789abcdef.png)",
        '![Floated](/media/news/0123456789abcdef.png){width="50%" float="right"}',
        ":::caution\nMind the **gap**.\n:::",
        '::youtube{id="G_yqv0Vj3ug" width="33%" float="left"}',
        '::link{href="/docs/" title="The docs"}',
        "---",
        "$$\nE_0 = 200\\,\\mathrm{keV}\n$$",
      ].join("\n\n"),
    );
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<h3>Subheading</h3>");
    expect(html).toContain("<strong>bold</strong>, <em>italic</em>, 15<sup>th</sup>, TiO<sub>2</sub>");
    expect(html).toContain('<a href="https://eelsdb.eu/">a link</a>');
    expect(html).toMatch(/<math[^>]*><semantics><mrow><mi>t<\/mi>/);
    expect(html).toContain("<ul>\n<li>one</li>");
    expect(html).toContain("<ol>\n<li>first</li>");
    expect(html).toContain("<blockquote>\n<p>A quote</p>");
    expect(html).toContain('<img src="/media/news/0123456789abcdef.png" alt="Carbon K edge" loading="lazy">');
    expect(html).toContain('<img src="/media/news/0123456789abcdef.png" alt="Floated" data-width="50%" data-float="right" loading="lazy">');
    expect(html).toContain('<aside class="callout" data-kind="caution"><p class="callout-label">Caution</p><p>Mind the <strong>gap</strong>.</p>');
    expect(html).toContain('<figure class="yt" data-width="33%" data-float="left"><a class="yt-link" href="https://www.youtube.com/watch?v=G_yqv0Vj3ug" data-youtube="G_yqv0Vj3ug"');
    expect(html).toContain('<img src="/media/news/youtube/G_yqv0Vj3ug.jpg"');
    expect(html).toContain('<a class="link-card" href="/docs/"><span class="link-card-text"><span class="link-card-title">The docs</span></span>');
    expect(html).toContain("<hr>");
    expect(html).toMatch(/<div class="math-block"><span class="katex"><math[^>]*display="block"/);
  });

  it("shows unsafe input as text", () => {
    const html = renderNews('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![y](data:image/png;base64,AA) $\\href{javascript:alert(1)}{z}$\n\n![big](/a.png){width="99%" float="middle"}');
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/href="javascript|src="data:/);
    expect(html).not.toMatch(/<a[^>]+javascript/);
    expect(html).toContain('<img src="/a.png" alt="big" loading="lazy">');
  });

  it("keeps prices, strikethrough and bad video ids out of the extensions", () => {
    expect(renderNews("It costs $5 and $10.")).toBe("<p>It costs $5 and $10.</p>\n");
    expect(renderNews("~~gone~~")).toContain("<del>gone</del>");
    expect(renderNews('::youtube{id="nope"}')).not.toContain("yt-link");
    expect(youtubeIds('::youtube{id="G_yqv0Vj3ug"}\n\n::youtube{id="bad"}')).toEqual(["G_yqv0Vj3ug"]);
  });

  it("renders link cards, with escaped values and an optional description", () => {
    const arrow = '<svg class="link-card-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>';
    expect(renderNews('::link{href="https://eelsdb.eu/docs/" title="Read the docs" description="How to use <EELSdb>."}')).toBe(
      `<a class="link-card" href="https://eelsdb.eu/docs/"><span class="link-card-text"><span class="link-card-title">Read the docs</span><span class="link-card-desc">How to use &lt;EELSdb&gt;.</span></span>${arrow}</a>\n`,
    );
    expect(renderNews('::link{href="/news/" title="News"}')).toBe(`<a class="link-card" href="/news/"><span class="link-card-text"><span class="link-card-title">News</span></span>${arrow}</a>\n`);
    expect(renderNews('::link{href="/x/" title="The \\"{001}\\" planes } & more" description="a \\\\ b"}')).toContain(
      '<span class="link-card-title">The &quot;{001}&quot; planes } &amp; more</span><span class="link-card-desc">a \\ b</span>',
    );
    const bad = renderNews('::link{href="javascript:alert(1)" title="Click"}');
    expect(bad).not.toContain("link-card");
    expect(bad).not.toMatch(/href="javascript/);
    expect(bad).toContain("::link{");
  });

  it("finds the lead image for the news list", () => {
    const img = "![A plot](/media/news/b987fbc2ceafc7c1.png){width=\"33%\"}";
    const video = '::youtube{id="G_yqv0Vj3ug"}';
    expect(leadImage(`Text.\n\n${img}\n\n${video}`)).toBe("/media/news/b987fbc2ceafc7c1.png");
    expect(leadImage(`${video}\n\n${img}`)).toBe("/media/news/youtube/G_yqv0Vj3ug.jpg");
    expect(leadImage("![x](https://example.com/a.png) and `::youtube{id=\"G_yqv0Vj3ug\"}` inline")).toBeNull();
  });
});

describe("news pages", () => {
  it("moves the archive under /news/ and redirects the old addresses", async () => {
    const list = await (await page("/news/")).text();
    expect(list).toContain('href="/news/hyperspy/"');
    expect((await page("/hyperspy/")).headers.get("location")).toBe("/news/hyperspy/");
    expect((await page("/hyperspy.md")).headers.get("location")).toBe("/news/hyperspy.md");
    const post = await page("/news/hyperspy/");
    expect(post.status).toBe(200);
    expect(await post.text()).toContain('<link rel="alternate" type="text/markdown" href="/news/hyperspy.md"/>');
    const md = await (await page("/news/hyperspy.md")).text();
    expect(md).toMatch(/^# Hyperspy\n\n2020-05-18, .+\. https:\/\/eelsdb\.eu\/news\/hyperspy\/\n/);
    expect((await page("/not-a-post/")).status).toBe(404);
  });

  it("links the archive's recorded author to their account, also after a rename", async () => {
    const byline = async () => (await (await page("/news/hyperspy/")).text()).match(/<p class="muted news-byline">.*?<\/p>/)![0];
    expect(await byline()).toMatch(/<span class="by"><span class="av av-[a-e]" aria-hidden="true">CE<\/span><span class="by-name">Chris Ewels<\/span><\/span>/);
    await env.DB.prepare("INSERT INTO users (id, display_name, slug, show_details) VALUES (?, 'Chris Ewels', 'chris-ewels', 1)").bind(CHRIS).run();
    expect(await byline()).toMatch(/<a class="by" href="\/author\/chris-ewels\/"><span class="av av-[a-e]" aria-hidden="true">CE<\/span><span class="by-name">Chris Ewels<\/span><\/a>/);
    expect(await (await page("/author/chris-ewels/")).text()).toContain('href="/news/hyperspy/"');
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET slug = 'chris-renamed' WHERE id = ?").bind(CHRIS),
      env.DB.prepare("INSERT INTO user_slug_history (slug, user_id) VALUES ('chris-ewels', ?)").bind(CHRIS),
    ]);
    expect(await byline()).toContain('<a class="by" href="/author/chris-renamed/">');
    expect(await (await page("/author/chris-renamed/")).text()).toContain('href="/news/hyperspy/"');
  });
});

describe("writing news", () => {
  it("is for moderators only", async () => {
    const user = await sessionFor(USER);
    expect((await page("/admin/news/", user)).status).toBe(403);
    expect((await form("/admin/news/new/", user, article())).status).toBe(403);
    expect((await page("/admin/news/")).status).toBe(302);
  });

  it("keeps drafts private, publishes, fixes the address and keeps history", async () => {
    const mod = await sessionFor(MOD);
    const created = await form("/admin/news/new/", mod, article());
    expect(created.status).toBe(303);
    const id = idOf(created);

    expect((await page("/news/test-article/")).status).toBe(404);
    expect((await page("/news/test-article.md")).status).toBe(404);
    expect(await (await page("/news/")).text()).not.toContain("test-article");
    const preview = await (await page("/news/test-article/", mod)).text();
    expect(preview).toContain("This is a draft");
    expect(preview).toContain(`<a class="button secondary" href="/admin/news/${id}/">Edit</a>`);

    const bad = await form(`/admin/news/${id}/`, mod, article({ slug: "Not OK", action: "publish" }));
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Use lowercase letters, numbers and hyphens");

    expect((await form(`/admin/news/${id}/`, mod, article({ action: "publish" }))).headers.get("location")).toBe(`/admin/news/${id}/?notice=published`);
    const live = await (await page("/news/test-article/")).text();
    expect(live).toContain("<p>Hello <strong>world</strong>.</p>");
    expect(live).not.toContain(`/admin/news/${id}/`);
    expect(live).toMatch(/2026-11-06 · <span class="by">.*?News Moderator<\/span><\/span> and <span class="by">.*?Guest Writer<\/span><\/span>/);
    expect(await (await page("/news/")).text()).toContain('href="/news/test-article/"');
    expect(await (await page("/sitemap.xml")).text()).toContain("https://eelsdb.eu/news/test-article/");
    expect(await (await page("/news/test-article.md")).text()).toContain("2026-11-06, News Moderator and Guest Writer. https://eelsdb.eu/news/test-article/\n\nHello **world**.");

    // Published: no draft, and the address no longer changes.
    const editor = await (await page(`/admin/news/${id}/`, mod)).text();
    expect(editor).toContain('value="update">Save changes</button>');
    expect(editor).not.toContain("Save draft");
    await form(`/admin/news/${id}/`, mod, article({ slug: "other-address", body: "Changed." }));
    const row = await env.DB.prepare("SELECT slug, body_md, status FROM news WHERE id = ?").bind(id).first<any>();
    expect(row).toEqual({ slug: "test-article", body_md: "Changed.", status: "published" });

    const history = await env.DB.prepare("SELECT id, body_md FROM news_history WHERE news_id = ?").bind(id).all<any>();
    expect(history.results.map((h) => h.body_md)).toEqual(["Hello **world**."]);
    await form(`/admin/news/${id}/history/${history.results[0].id}/restore/`, mod, {});
    expect(await env.DB.prepare("SELECT body_md FROM news WHERE id = ?").bind(id).first("body_md")).toBe("Hello **world**.");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM news_history WHERE news_id = ?").bind(id).first("n")).toBe(2);

    // A published article cannot be deleted as a draft.
    await form(`/admin/news/${id}/delete/`, mod, {});
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM news WHERE id = ?").bind(id).first("n")).toBe(1);
  });

  it("credits authors with avatars and lists published articles on author pages", async () => {
    const mod = await sessionFor(MOD);
    await sessionFor(USER, { email: true });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, display_name, slug, show_details, avatar_key) VALUES (?, 'News Writer', 'news-writer', 1, '9910103/face.webp')").bind(WRITER),
      env.DB.prepare("UPDATE users SET use_gravatar = 1 WHERE id = ?").bind(USER.id),
    ]);
    await form("/admin/news/new/", mod, article({ title: "Byline article", slug: "byline-article", action: "publish", authors: JSON.stringify([{ id: WRITER }, { id: USER.id }, { name: "Guest Writer" }]) }));
    await form("/admin/news/new/", mod, article({ title: "Writer draft", slug: "writer-draft", authors: JSON.stringify([{ id: WRITER }]) }));

    const html = await (await page("/news/byline-article/")).text();
    expect(html).toMatch(/<a class="by" href="\/author\/news-writer\/"><span class="av av-[a-e]" aria-hidden="true">NW<img src="\/avatars\/9910103\/face.webp"/);
    // No author page: the name and initials only, not their Gravatar.
    expect(html).toMatch(/, <span class="by"><span class="av av-[a-e]" aria-hidden="true">PU<\/span><span class="by-name">Plain User<\/span><\/span> and <span class="by">/);
    expect(html).not.toContain("gravatar.com");

    const author = await (await page("/author/news-writer/")).text();
    expect(author).toContain("<h2>News</h2>");
    expect(author).toContain('href="/news/byline-article/"');
    expect(author).not.toContain("writer-draft");
    expect(await (await page("/author/news-writer.md")).text()).toContain("## News (1)\n\n- [Byline article](https://eelsdb.eu/news/byline-article.md): 2026-11-06\n");
  });

  it("edits an archived post as Markdown and can restore the archived version", async () => {
    const mod = await sessionFor(MOD);
    const old = await env.DB.prepare("SELECT id, body_html FROM news WHERE slug = 'hyperspy'").first<any>();
    const editor = await (await page(`/admin/news/${old.id}/`, mod)).text();
    expect(editor).toContain("Thanks to the nice guys developing Hyperspy");
    await form(`/admin/news/${old.id}/`, mod, article({ title: "Hyperspy", slug: "hyperspy", body: "Thanks to the HyperSpy developers." }));
    expect(await (await page("/news/hyperspy/")).text()).toContain("<p>Thanks to the HyperSpy developers.</p>");
    const h = await env.DB.prepare("SELECT id FROM news_history WHERE news_id = ? AND body_md IS NULL").bind(old.id).first<number>("id");
    await form(`/admin/news/${old.id}/history/${h}/restore/`, mod, {});
    expect(await (await page("/news/hyperspy/")).text()).toContain("Thanks to the nice guys developing Hyperspy");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM news_history WHERE news_id = ?").bind(old.id),
      env.DB.prepare("DELETE FROM news_authors WHERE news_id = ?").bind(old.id),
      env.DB.prepare("UPDATE news SET summary = NULL, updated_at = NULL, body_md = NULL WHERE id = ?").bind(old.id),
    ]);
  });

  it("keeps API v1 to the recorded archive", async () => {
    const mod = await sessionFor(MOD);
    await form("/admin/news/new/", mod, article({ slug: "not-in-api", action: "publish" }));
    const list = await (await exports.default.fetch("https://api.eelsdb.eu/news/")).json<any[]>();
    expect(list.map((n) => n.slug ?? n.post_slug ?? JSON.stringify(n))).not.toContain("not-in-api");
    expect((await exports.default.fetch("https://api.eelsdb.eu/not-in-api/")).status).toBe(404);
    expect((await exports.default.fetch("https://api.eelsdb.eu/hyperspy/")).status).toBe(200);
  });

  it("accepts images by their content, up to 2 MB, and serves them safely", async () => {
    const mod = await sessionFor(MOD);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const ok = await upload(mod, new File([png], "figure.png", { type: "image/png" }));
    const { url } = await ok.json<{ url: string }>();
    expect(url).toMatch(/^\/media\/news\/[0-9a-f]{16}\.png$/);
    const served = await page(url);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    await env.FILES.delete(`news/${url.split("/").at(-1)}`);

    const svg = await upload(mod, new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "x.svg", { type: "image/svg+xml" }));
    expect(svg.status).toBe(400);
    const big = await upload(mod, new File([png, new Uint8Array(2 * 1024 * 1024)], "big.png", { type: "image/png" }));
    expect(big.status).toBe(400);
    expect((await upload(await sessionFor(USER), new File([png], "figure.png", { type: "image/png" }))).status).toBe(403);
    expect((await page("/media/news/../avatars/x.png")).status).toBe(404);
  });
});

describe("unused news images", () => {
  it("deletes images and thumbnails that no article or earlier version uses, a week after upload", async () => {
    const keys = {
      article: "news/00000000000000a1.png",
      history: "news/00000000000000b2.jpg",
      unused: "news/00000000000000c3.webp",
      video: "news/youtube/keepVideo01.jpg",
      unusedVideo: "news/youtube/dropVideo01.jpg",
    };
    await Promise.all(Object.values(keys).map((k) => env.FILES.put(k, "x")));
    const id = await env.DB.prepare("INSERT INTO news (slug, title, published_at, body_md, status) VALUES ('image-cleanup', 'Images', '2026-11-06', ?, 'draft') RETURNING id")
      .bind(`![A](/media/${keys.article}){width="50%" float="right"}\n\n::youtube{id="keepVideo01"}`)
      .first<number>("id");
    await env.DB.prepare("INSERT INTO news_history (news_id, title, body_md) VALUES (?, 'Images', ?)").bind(id, `![B](/media/${keys.history})`).run();
    const present = async () => (await Promise.all(Object.entries(keys).map(async ([name, k]) => ((await env.FILES.head(k)) ? name : null)))).filter(Boolean);
    try {
      await deleteUnusedNewsImages(env, Date.now());
      expect(await present()).toEqual(Object.keys(keys));
      await deleteUnusedNewsImages(env, Date.now() + 8 * 86_400_000);
      expect(await present()).toEqual(["article", "history", "video"]);
    } finally {
      await env.DB.prepare("DELETE FROM news WHERE id = ?").bind(id).run();
      await env.FILES.delete(Object.values(keys));
    }
  });
});
