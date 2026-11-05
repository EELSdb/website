import { env } from "cloudflare:workers";

const PRODUCTION = "https://eelsdb.eu";

/** Public address of this deployment (SITE_URL). */
export const SITE = (env.SITE_URL || PRODUCTION).replace(/\/+$/, "");
/** Public address of the API (API_URL). By default the site's host with "api." in front. */
export const API_HOST = apiUrl(SITE, env.API_URL);
export const SITE_HOST = new URL(SITE).host;
export const IS_PRODUCTION = SITE === PRODUCTION;
/** ENVIRONMENT=development: every page says so in a red banner, so nobody mistakes it for the live site. */
export const IS_DEVELOPMENT = env.ENVIRONMENT === "development";

function apiUrl(site: string, setting?: string) {
  return (setting || site.replace("://", "://api.")).replace(/\/+$/, "");
}

/** Points production links in prebuilt text (the docs, llms.txt) at another deployment. */
export const localise = (text: string) => rehost(text, SITE, API_HOST);

export function rehost(text: string, site: string, api = apiUrl(site)) {
  if (site === PRODUCTION) return text;
  return text.replaceAll(apiUrl(PRODUCTION), api).replaceAll(PRODUCTION, site);
}

/** The API path of a request when API_URL serves the API under a path of the site's host (workers.dev has no
 * "api." host), otherwise null. */
export function apiPath(url: URL, api = API_HOST) {
  const prefix = new URL(api).pathname.replace(/\/+$/, "");
  if (!prefix || (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))) return null;
  return url.pathname.slice(prefix.length) || "/";
}
