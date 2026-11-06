import { Hono } from "hono";
import { loadUser, type AppEnv } from "../auth";
import { AuthPage } from "../pages/account";
import { setDigest, userForDigestToken } from "./subscription";

/**
 * Mounted before `csrf()` in pages/index.tsx: mail clients send RFC 8058 one-click unsubscribes as a POST with no Origin
 * header, which the CSRF check would reject. The token in the address is the only credential, and the action only turns mail off.
 */
export const unsubscribe = new Hono<AppEnv>();
unsubscribe.use(loadUser);

unsubscribe.get("/:token/", (c) =>
  c.html(
    <AuthPage title="Stop the monthly digest?" user={c.get("user") ?? undefined}>
      <h1>Stop the monthly digest?</h1>
      <p class="auth-lede">You will not get the monthly email of new spectra and news from EELSdb any more.</p>
      <form method="post" action={`/digest/unsubscribe/${encodeURIComponent(c.req.param("token"))}/`}>
        <button class="button auth-wide" type="submit">Stop the digest</button>
      </form>
    </AuthPage>,
  ),
);

unsubscribe.post("/:token/", async (c) => {
  const found = await userForDigestToken(c.env.DB, c.req.param("token"));
  if (found) await setDigest(c.env.DB, found.id, false);
  return c.html(
    <AuthPage title="Digest stopped" user={c.get("user") ?? undefined}>
      <h1>The monthly digest has stopped</h1>
      <p class="auth-lede">You will not get it again. You can turn it back on at any time in your settings.</p>
      <a class="button secondary auth-wide" href="/account/settings/emails/#digest">Email settings</a>
    </AuthPage>,
  );
});
