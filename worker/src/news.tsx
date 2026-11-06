// News written on the site (ADR 0038): the public pages, and the moderators' editor mounted by admin.tsx behind its guard.
import { Hono, type Context } from "hono";
import { raw } from "hono/html";
import type { AppEnv, User } from "./auth";
import { AVATAR_TYPES } from "./account-edit";
import { isModerator } from "./instruments";
import { AccountLayout, Avatar, Layout, avatarHue, initials } from "./pages/layout";
import { HAS_PAGE_SQL } from "./pages/profile";
import { decodeEntities } from "./pages/entities";
import { htmlToMarkdown, listAnd, markdownHeaders, newsAuthors, newsMarkdown, type NewsAuthor } from "./pages/markdown";
import { leadImage, renderNews, youtubeIds, youtubeThumbKey } from "./news-render";

type C = Context<AppEnv>;
type Row = Record<string, any>;

export const news = new Hono<AppEnv>();
export const newsAdmin = new Hono<AppEnv>();

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BODY = 100_000;
const MAX_AUTHORS = 10;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES: typeof AVATAR_TYPES = [...AVATAR_TYPES, ["gif", "image/gif", (b) => String.fromCharCode(...b.slice(0, 4)) === "GIF8"]];

const legacySummary = (post: Row) => (post.legacy_v1 ? decodeEntities(JSON.parse(post.legacy_v1).description ?? "") : "");

const Byline = (props: { authors: NewsAuthor[] }) => (
  <>
    {props.authors.map((a, i) => {
      const face = <><Avatar name={a.name} seed={a.slug ?? a.name} src={a.avatar} /><span class="by-name">{a.name}</span></>;
      return (
        <>
          {i ? (i === props.authors.length - 1 ? " and " : ", ") : ""}
          {a.slug ? <a class="by" href={`/author/${a.slug}/`}>{face}</a> : <span class="by">{face}</span>}
        </>
      );
    })}
  </>
);

// ---- Public pages ------------------------------------------------------------------------------

news.get("/news/", async (c) => {
  const db = c.env.DB;
  const [{ results: posts }, { results: names }] = await db.batch<Row>([
    db.prepare("SELECT id, slug, title, published_at, summary, body_md, legacy_v1 FROM news WHERE status = 'published' ORDER BY published_at DESC, id DESC"),
    db.prepare(
      `SELECT a.news_id, COALESCE(u.display_name, a.name) AS name FROM news_authors a JOIN news n ON n.id = a.news_id AND n.status = 'published'
       LEFT JOIN users u ON u.id = a.user_id ORDER BY a.news_id, a.position`,
    ),
  ]);
  const authors = Map.groupBy(names, (a) => a.news_id as number);
  const years = Map.groupBy(posts, (p) => String(p.published_at).slice(0, 4));
  const user = c.get("user");
  return c.html(
    <Layout user={user} title="News" path="/news/" card="page/news">
      <div class="news-index">
        <div class="page-head">
          <h1>News</h1>
          {isModerator(user) && <a class="button secondary" href="/admin/news/">Write or edit news</a>}
        </div>
        <p class="lede">News from the EELS Data Base.</p>
        {posts.length === 0 && <p class="muted">No news yet.</p>}
        {[...years].map(([year, list]) => (
          <section class="news-year" aria-labelledby={`y${year}`}>
            <h2 id={`y${year}`}>{year}</h2>
            <div class="news-list">
              {list.map((p) => {
                const summary = p.summary ?? legacySummary(p);
                const legacyAuthor = p.legacy_v1 && JSON.parse(p.legacy_v1).author?.name;
                const by = listAnd(authors.get(p.id)?.map((a) => a.name) ?? (legacyAuthor ? [legacyAuthor] : []));
                const img = p.body_md && leadImage(p.body_md);
                const date = new Date(String(p.published_at).replace(" ", "T") + "Z");
                return (
                  <article class={img ? "has-img" : undefined}>
                    <h3><a href={`/news/${p.slug}/`}>{p.title}</a></h3>
                    {summary && <p class="news-summary">{summary}</p>}
                    <p class="news-meta">
                      <time datetime={date.toISOString().slice(0, 10)}>{date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}</time>
                      {by && <> · {by}</>}
                    </p>
                    {img && <img src={img} alt="" width="160" height="100" loading="lazy" />}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Layout>,
  );
});

// Before the route that adds a missing trailing slash, which would catch "slug.md".
news.get("/news/:file{.+\\.md}", async (c) => {
  const body = await newsMarkdown(c.env.DB, c.req.param("file").slice(0, -3));
  return body ? c.body(body, 200, markdownHeaders) : c.notFound();
});
news.get("/news/:slug", (c) => c.redirect(`/news/${c.req.param("slug")}/`, 301));

news.get("/news/:slug/", async (c) => {
  const post = await c.env.DB.prepare("SELECT id, slug, title, published_at, status, summary, body_md, body_html, legacy_v1 FROM news WHERE slug = ?")
    .bind(c.req.param("slug"))
    .first<Row>();
  const user = c.get("user");
  if (!post || (post.status !== "published" && !isModerator(user))) return c.notFound();
  const authors = await newsAuthors(c.env.DB, post as any);
  // Archived posts were recorded from the old site and reduced to simple tags by python/record_news.py.
  const body: string = post.body_md !== null ? renderNews(post.body_md) : post.body_html ?? "";
  return c.html(
    <Layout
      user={user}
      title={post.title}
      description={(post.summary ?? legacySummary(post)) || undefined}
      path="/news/"
      card={`news/${encodeURIComponent(post.slug)}`}
      head={<link rel="alternate" type="text/markdown" href={`/news/${post.slug}.md`} />}
    >
      <article class="prose news-article">
        <p class="small back-link"><a href="/news/">← News</a></p>
        {post.status !== "published" && <p class="notice" role="status">This is a draft. Only moderators can see it until it is published.</p>}
        <h1>{post.title}</h1>
        <p class="muted news-byline">
          {String(post.published_at).slice(0, 10)}
          {authors.length > 0 && <> · <Byline authors={authors} /></>}
          {isModerator(user) && <> · <a href={`/admin/news/${post.id}/`}>Edit</a></>}
        </p>
        <div class="news-body">{raw(body)}</div>
      </article>
      {body.includes('class="yt-link"') && <script src="/news.js" defer></script>}
    </Layout>,
  );
});

news.get("/media/news/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!/^(?:youtube\/[\w-]{11}\.jpg|[0-9a-f]{16}\.(?:png|jpg|webp|gif))$/.test(key)) return c.notFound();
  const object = await c.env.FILES.get(`news/${key}`);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
});

// ---- Moderators' editor ------------------------------------------------------------------------

type Values = { title: string; summary: string; slug: string; date: string; body: string; authors: Author[] };
type Author = { id?: number; name: string };
type Person = { id: number; name: string; role: string; hue: string; initials: string };

const STATUS_LABELS: Record<string, string> = { new: "Not saved", draft: "Draft", published: "Published" };
const NOTICES: Record<string, string> = {
  saved: "Draft saved.",
  published: "Published. The article is now on the news page.",
  updated: "Saved. The changes are on the site.",
  restored: "Earlier version restored. The one it replaced is in the list of earlier versions.",
  deleted: "Draft deleted.",
};

/** People who can be picked as authors: accounts with a public author page, and staff. Others can be added by name. */
async function people(db: D1Database): Promise<Person[]> {
  const { results } = await db.prepare(
    `SELECT u.id, u.display_name AS name, u.role, u.slug FROM users u WHERE u.role IN ('moderator', 'admin') OR ${HAS_PAGE_SQL} ORDER BY u.display_name`,
  ).all<Row>();
  return results.map((u) => ({ id: u.id, name: u.name, role: u.role === "user" ? "Contributor" : u.role === "admin" ? "Administrator" : "Moderator", hue: avatarHue(u.slug ?? u.name), initials: initials(u.name) }));
}

const storedAuthors = async (db: D1Database, post: Row): Promise<Author[]> =>
  (await newsAuthors(db, post as any)).map((a) => (a.id ? { id: a.id, name: a.name } : { name: a.name }));

const json = (data: unknown) => raw(JSON.stringify(data).replace(/</g, "\\u003c"));

function Field(props: { id: string; label: string; error?: string; hint?: string; children: any }) {
  return (
    <div class={`field${props.error ? " has-error" : ""}`}>
      <label for={props.id}>{props.label}</label>
      {props.children}
      {props.hint && <p class="hint">{props.hint}</p>}
      {props.error && <p class="error">{props.error}</p>}
    </div>
  );
}

function EditorPage(p: { user: User; post: Row | null; v: Values; errors: Record<string, string>; notice?: string; people: Person[]; history: Row[] }) {
  const status: string = p.post?.status ?? "new";
  const published = status === "published";
  const action = p.post ? `/admin/news/${p.post.id}/` : "/admin/news/new/";
  const title = p.post ? (published ? "Edit article" : "Edit draft") : "New article";
  return (
    <Layout title={title} path="/admin/news/" user={p.user} head={<script type="module" src="/news-editor.js"></script>}>
      <p class="small back-link"><a href="/admin/news/">← News</a></p>
      <div class="ne-head">
        <h1>{title}</h1>
        <span class={`ne-status ne-status-${status}`}>{STATUS_LABELS[status]}</span>
        {p.post && <a class="small" href={`/news/${p.post.slug}/`}>{published ? "View on the site" : "Preview"}</a>}
      </div>
      {p.notice && <p class="notice" role="status">{p.notice}</p>}
      {Object.keys(p.errors).length > 0 && <p class="notice error-summary" role="alert">Some fields need attention. Nothing was saved.</p>}
      <form method="post" action={action} class="ne-grid" id="news-form" data-status={status}>
        <div class="ne-main">
          <Field id="f-title" label="Title" error={p.errors.title}>
            <input type="text" id="f-title" name="title" class="ne-title" value={p.v.title} maxlength={200} autocomplete="off" placeholder="A short, plain title" />
          </Field>
          <Field id="f-body" label="Article" error={p.errors.body} hint="Drag images in, paste them, or use the image button. Images are shrunk to 1600 pixels wide before they are uploaded.">
            <textarea id="f-body" name="body" rows={24} class="md-text">{p.v.body}</textarea>
          </Field>
        </div>
        <aside class="ne-side" aria-label="Publishing">
          <div class="ne-actions">
            {published ? (
              <button class="button" type="submit" name="action" value="update">Save changes</button>
            ) : (
              <>
                <button class="button" type="submit" name="action" value="publish">Publish</button>
                <button class="button secondary" type="submit" name="action" value="draft">Save draft</button>
              </>
            )}
          </div>
          <p class="hint" id="ne-msg" role="status">{published ? "Changes appear on the site as soon as you save." : ""}</p>
          <Field id="f-summary" label="Summary" error={p.errors.summary} hint="One or two sentences. Shown in the news list and when someone shares the link.">
            <textarea id="f-summary" name="summary" rows={3} maxlength={400}>{p.v.summary}</textarea>
          </Field>
          <div class={`field authors${p.errors.authors ? " has-error" : ""}`}>
            <label for="au-input">Authors</label>
            <input type="hidden" name="authors" id="f-authors" value={JSON.stringify(p.v.authors)} />
            <div class="picker" id="au-picker">
              <ul class="picker-chips" aria-label="Authors, in byline order">
                {p.v.authors.map((a) => <li><span class="chip">{a.name}</span></li>)}
              </ul>
            </div>
            <p class="hint" id="au-hint">Search people with an EELSdb account, or type any name.</p>
            <p class="hint" id="au-byline"></p>
            {p.errors.authors && <p class="error">{p.errors.authors}</p>}
          </div>
          <Field id="f-slug" label="Web address" error={p.errors.slug} hint={published ? "Fixed once the article is published, so links to it keep working." : undefined}>
            <div class="ne-slug">
              <span>eelsdb.eu/news/</span>
              <input type="text" id="f-slug" name="slug" value={p.v.slug} readonly={published} maxlength={80} autocomplete="off" placeholder="made-from-the-title" />
            </div>
          </Field>
          <Field id="f-date" label="Date" error={p.errors.date}>
            <input type="date" id="f-date" name="date" value={p.v.date} />
          </Field>
        </aside>
      </form>
      {status === "draft" && (
        <form method="post" action={`/admin/news/${p.post!.id}/delete/`} class="ne-delete" onsubmit="return confirm('Delete this draft? This cannot be undone.')">
          <button class="button secondary" type="submit">Delete draft</button>
        </form>
      )}
      {p.history.length > 0 && (
        <section class="ne-history" aria-labelledby="h-history">
          <h2 id="h-history">Earlier versions</h2>
          <p class="hint">Each save of the published article keeps the version it replaced. Restoring one keeps the current version here too.</p>
          <ul>
            {p.history.map((h) => (
              <li>
                <span>{String(h.saved_at).slice(0, 16)} UTC{h.who ? `, replaced by ${h.who}` : ""}: “{h.title}”{h.body_md === null ? " (archived version)" : ""}</span>
                <form method="post" action={`/admin/news/${p.post!.id}/history/${h.id}/restore/`}>
                  <button class="button secondary" type="submit">Restore</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      <script type="application/json" id="news-data">{json({ people: p.people, isNew: !p.post })}</script>
    </Layout>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function editorPage(c: C, post: Row | null, v: Values, errors: Record<string, string> = {}, status: 200 | 400 = 200) {
  const db = c.env.DB;
  const history = post
    ? (await db.prepare("SELECT h.id, h.saved_at, h.title, h.body_md, u.display_name AS who FROM news_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.news_id = ? ORDER BY h.id DESC LIMIT 50")
        .bind(post.id).all<Row>()).results
    : [];
  const notice = NOTICES[c.req.query("notice") ?? ""];
  return c.html(<EditorPage user={c.get("user")!} post={post} v={v} errors={errors} notice={status === 200 ? notice : undefined} people={await people(db)} history={history} />, status);
}

newsAdmin.get("/admin/news/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, slug, title, status, published_at, updated_at FROM news ORDER BY status = 'published', published_at DESC, id DESC",
  ).all<Row>();
  const notice = NOTICES[c.req.query("notice") ?? ""];
  return c.html(
    <AccountLayout title="News" current="/admin/news/" user={c.get("user")!}>
      <h1>News</h1>
      {notice && <p class="notice" role="status">{notice}</p>}
      <p><a class="button" href="/admin/news/new/">Write an article</a></p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Title</th><th>Status</th><th class="num">Date</th><th class="num">Last edited</th></tr></thead>
          <tbody>
            {results.map((n) => (
              <tr>
                <td><a href={`/admin/news/${n.id}/`}>{n.title}</a></td>
                <td>{n.status === "draft" ? "Draft" : "Published"}</td>
                <td class="num">{String(n.published_at).slice(0, 10)}</td>
                <td class="num">{n.updated_at ? String(n.updated_at).slice(0, 10) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AccountLayout>,
  );
});

newsAdmin.get("/admin/news/new/", async (c) => {
  const me = c.get("user")!;
  return editorPage(c, null, { title: "", summary: "", slug: "", date: today(), body: "", authors: [{ id: me.id, name: me.display_name }] });
});

const loadPost = (c: C) => {
  const id = Number(c.req.param("id"));
  return Number.isInteger(id) ? c.env.DB.prepare("SELECT * FROM news WHERE id = ?").bind(id).first<Row>() : Promise.resolve(null);
};

newsAdmin.get("/admin/news/:id{\\d+}/", async (c) => {
  const post = await loadPost(c);
  if (!post) return c.notFound();
  return editorPage(c, post, {
    title: post.title,
    summary: post.summary ?? legacySummary(post),
    slug: post.slug,
    date: String(post.published_at).slice(0, 10),
    body: post.body_md ?? htmlToMarkdown(post.body_html ?? ""),
    authors: await storedAuthors(c.env.DB, post),
  });
});

async function parseAuthors(db: D1Database, value: unknown): Promise<Author[] | null> {
  let list: unknown;
  try {
    list = JSON.parse(typeof value === "string" ? value : "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length > MAX_AUTHORS) return null;
  const out: Author[] = [];
  for (const a of list) {
    if (a && Number.isInteger(a.id)) {
      const u = await db.prepare("SELECT id, display_name FROM users WHERE id = ?").bind(a.id).first<Row>();
      if (!u) return null;
      out.push({ id: u.id, name: u.display_name });
    } else if (a && typeof a.name === "string" && a.name.trim()) out.push({ name: a.name.trim().slice(0, 100) });
    else return null;
  }
  return out;
}

async function save(c: C, post: Row | null) {
  const db = c.env.DB;
  const me = c.get("user")!;
  const b = await c.req.parseBody();
  const published = post?.status === "published";
  const authors = await parseAuthors(db, b.authors);
  const v: Values = {
    title: text(b.title, 200),
    summary: text(b.summary, 400),
    slug: published ? post!.slug : text(b.slug, 80).toLowerCase(),
    date: text(b.date, 10),
    body: typeof b.body === "string" ? b.body.replace(/\r\n?/g, "\n").trim() : "",
    authors: authors ?? [],
  };
  const action = published ? "update" : b.action === "publish" ? "publish" : "draft";
  const errors: Record<string, string> = {};
  if (!v.title) errors.title = "Give the article a title.";
  if (!SLUG.test(v.slug)) errors.slug = "Use lowercase letters, numbers and hyphens, for example new-website.";
  else if (await db.prepare("SELECT 1 FROM news WHERE slug = ? AND id != ?").bind(v.slug, post?.id ?? 0).first()) errors.slug = "Another article already uses this address.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || Number.isNaN(Date.parse(v.date))) errors.date = "Choose a date.";
  if (v.body.length > MAX_BODY) errors.body = "The article is too long. Split it into two articles.";
  else if (action !== "draft" && !v.body) errors.body = "Write the article before publishing it.";
  if (!authors) errors.authors = "One of the authors could not be found. Remove them and add them again.";
  else if (action !== "draft" && !authors.length) errors.authors = "Add at least one author.";
  if (Object.keys(errors).length) return editorPage(c, post, v, errors, 400);

  // Keep the time of day when the date is unchanged, so articles on the same day keep their order.
  const publishedAt = post && String(post.published_at).slice(0, 10) === v.date ? post.published_at : v.date === today() ? new Date().toISOString().slice(0, 19).replace("T", " ") : `${v.date} 00:00:00`;
  const status = action === "draft" ? "draft" : "published";
  const statements: D1PreparedStatement[] = [];
  if (published && (post!.title !== v.title || (post!.summary ?? legacySummary(post!)) !== v.summary || post!.body_md !== v.body)) {
    statements.push(db.prepare("INSERT INTO news_history (news_id, user_id, title, summary, body_md) SELECT id, ?, title, summary, body_md FROM news WHERE id = ?").bind(me.id, post!.id));
  }
  if (post) {
    statements.push(
      db.prepare("UPDATE news SET title = ?, summary = ?, slug = ?, published_at = ?, body_md = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(v.title, v.summary || null, v.slug, publishedAt, v.body, status, post.id),
      db.prepare("DELETE FROM news_authors WHERE news_id = ?").bind(post.id),
    );
  } else {
    statements.push(
      db.prepare("INSERT INTO news (slug, title, published_at, body_md, summary, status, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))")
        .bind(v.slug, v.title, publishedAt, v.body, v.summary || null, status, me.id),
    );
  }
  v.authors.forEach((a, i) =>
    statements.push(
      db.prepare("INSERT INTO news_authors (news_id, position, user_id, name) SELECT id, ?, ?, ? FROM news WHERE slug = ?").bind(i, a.id ?? null, a.name, v.slug),
    ),
  );
  await db.batch(statements);
  const id = post?.id ?? (await db.prepare("SELECT id FROM news WHERE slug = ?").bind(v.slug).first<number>("id"));
  c.executionCtx.waitUntil(copyThumbnails(c.env.FILES, youtubeIds(v.body)));
  return c.redirect(`/admin/news/${id}/?notice=${action === "draft" ? "saved" : action === "publish" ? "published" : "updated"}`, 303);
}

/** Readers see a copy of each video's thumbnail, so their browser contacts YouTube only when they press play. */
async function copyThumbnails(files: R2Bucket, ids: string[]) {
  for (const id of ids) {
    try {
      if (await files.head(youtubeThumbKey(id))) continue;
      const res = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok && res.headers.get("Content-Type")?.startsWith("image/jpeg")) {
        await files.put(youtubeThumbKey(id), await res.arrayBuffer(), { httpMetadata: { contentType: "image/jpeg" } });
      }
    } catch {
      // The page shows the play button on a plain background until a later save copies the thumbnail.
    }
  }
}

/** Run daily by the cron trigger: deletes images and video thumbnails that no article, draft or earlier version uses. */
export async function deleteUnusedNewsImages(env: Env, now: number) {
  const { results } = await env.DB.prepare("SELECT body_md FROM news WHERE body_md IS NOT NULL UNION SELECT body_md FROM news_history WHERE body_md IS NOT NULL").all<{ body_md: string }>();
  const text = results.map((r) => r.body_md).join("\n");
  const used = new Set([...[...text.matchAll(/\/media\/(news\/[\w/-]+\.\w+)/g)].map((m) => m[1]), ...youtubeIds(text).map(youtubeThumbKey)]);
  // An editor can hold an uploaded image that has not been saved yet.
  const cutoff = now - 7 * 86_400_000;
  let cursor: string | undefined;
  do {
    const page = await env.FILES.list({ prefix: "news/", cursor });
    const unused = page.objects.filter((o) => !used.has(o.key) && o.uploaded.getTime() < cutoff).map((o) => o.key);
    if (unused.length) await env.FILES.delete(unused);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

newsAdmin.post("/admin/news/new/", (c) => save(c, null));
newsAdmin.post("/admin/news/:id{\\d+}/", async (c) => {
  const post = await loadPost(c);
  return post ? save(c, post) : c.notFound();
});

newsAdmin.post("/admin/news/:id{\\d+}/delete/", async (c) => {
  await c.env.DB.prepare("DELETE FROM news WHERE id = ? AND status = 'draft'").bind(Number(c.req.param("id"))).run();
  return c.redirect("/admin/news/?notice=deleted", 303);
});

newsAdmin.post("/admin/news/:id{\\d+}/history/:hid{\\d+}/restore/", async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param("id"));
  const old = await db.prepare("SELECT title, summary, body_md FROM news_history WHERE id = ? AND news_id = ?").bind(Number(c.req.param("hid")), id).first<Row>();
  if (!old) return c.notFound();
  await db.batch([
    db.prepare("INSERT INTO news_history (news_id, user_id, title, summary, body_md) SELECT id, ?, title, summary, body_md FROM news WHERE id = ?").bind(c.get("user")!.id, id),
    db.prepare("UPDATE news SET title = ?, summary = ?, body_md = ?, updated_at = datetime('now') WHERE id = ?").bind(old.title, old.summary, old.body_md, id),
  ]);
  return c.redirect(`/admin/news/${id}/?notice=restored`, 303);
});

newsAdmin.post("/admin/news/images/", async (c) => {
  const file = (await c.req.parseBody()).file;
  if (!(file instanceof File) || !file.size) return c.json({ error: "Choose an image to upload." }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: "The image is over 2 MB, even after shrinking. Try a smaller one." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = IMAGE_TYPES.find(([, , magic]) => magic(bytes));
  if (!kind) return c.json({ error: "Use a PNG, JPEG, WebP or GIF image." }, 400);
  const key = `${[...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("")}.${kind[0]}`;
  await c.env.FILES.put(`news/${key}`, bytes, { httpMetadata: { contentType: kind[1] } });
  return c.json({ url: `/media/news/${key}` });
});
