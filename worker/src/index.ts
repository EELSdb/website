import { api } from "./api/index";
import { pages } from "./pages/index";
import { deleteOldMessages } from "./contact";
import { deleteOldDrafts } from "./submit/drafts";
import { deleteUnusedNewsImages } from "./news";
import { deleteExpiredPasswordChanges } from "./pages/settings";
import { rollupUsage } from "./usage";
import { runDigest } from "./digest/send";
import { IS_PRODUCTION, apiPath } from "./site";

// No full Content-Security-Policy yet: Pyodide (wasm) and Turnstile need careful allowances.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = apiPath(url);
    if (path) {
      url.pathname = path;
      req = new Request(url, req);
    }
    const app = path || url.hostname.startsWith("api.") || url.hostname.startsWith("www.api.") ? api : pages;
    const res = await app.fetch(req, env, ctx);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
    if (!IS_PRODUCTION) out.headers.set("X-Robots-Tag", "noindex");
    return out;
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(deleteOldDrafts(env));
    ctx.waitUntil(deleteOldMessages(env));
    ctx.waitUntil(deleteExpiredPasswordChanges(env));
    ctx.waitUntil(deleteUnusedNewsImages(env, controller.scheduledTime));
    // Each kind must outlast the longest window counted over it.
    ctx.waitUntil(env.DB.prepare("DELETE FROM rate_events WHERE at < datetime('now', CASE kind WHEN 'email_sent' THEN '-30 days' ELSE '-1 day' END)").run());
    ctx.waitUntil(rollupUsage(env, controller.scheduledTime));
    ctx.waitUntil(runDigest(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
