---
title: "0037. Usage analytics"
description: "Workers Logs, an Analytics Engine count of page loads, API calls, downloads and requests for the files for AI agents, a daily copy into D1 for the public statistics page, and Cloudflare Web Analytics for visitors. No IP addresses, full User-Agents, full referrers or cookies."
adr:
  date: 2026-11-04
  implemented: partly
---

## Context

- We can retire API v1 only when we know who still calls it, and how often ([ADR 0008](/docs/adr/0008-api-v1-frozen-contract/)). The old site kept no usage data.
- API v2, OAI-PMH and DCAT are new ([ADR 0009](/docs/adr/0009-api-v2/), [ADR 0026](/docs/adr/0026-metadata-harvesting/)). We want to know if clients and harvesters use them.
- Contributors and funders ask how often the spectra are used. The old site showed no counts.
- Web traffic is one of the most important numbers for the project. A large part of it comes from bots and AI crawlers, and we want to see that part too, apart from the people.
- EELSdb has files made for AI agents ([ADR 0028](/docs/adr/0028-agent-facing-surface/)). We want to know if agents use them.
- Errors in the Worker must be visible after they happen. `wrangler tail` shows live requests only.
- Usage data must not hold personal data. Some User-Agents contain an email address, because the API docs ask scripts to name a contact. A full referrer address can hold search words or a private path.
- EELSdb must work without an outside service ([ADR 0006](/docs/adr/0006-no-hard-external-dependencies/)).

## Decision

EELSdb uses three Cloudflare features. None adds a vendor or a cookie.

- **Workers Logs.** `"observability": { "enabled": true }` in `worker/wrangler.jsonc` keeps the log of each invocation and its `console` output. `env.dev` inherits the setting.
- **Analytics Engine for the API.** The middleware of the `api` app in `worker/src/api/index.ts` writes one data point for each request to the API host. API v1, API v2, OAI-PMH and DCAT all pass through it. The binding is `API_USAGE`. The dataset is `eelsdb_api`, and `eelsdb_dev_api` for `env.dev`. Cloudflare creates a dataset on its first write.
- **Analytics Engine for downloads.** Spectrum files are on the main host, so the API middleware does not see them. The download handlers write the same kind of data point, with the surface `download`: the MSA, CSV and JSON downloads (`worker/src/pages/download.ts`) and the R2 file routes `/files/*`, `/wp-content/uploads/*` and `/submissions/*` (`serveFile` in `worker/src/files.ts`). The `download_link` of API v1, which exSpy uses, points at `/wp-content/uploads/*`, so exSpy downloads count too. The file routes find the spectrum and the file's role through the `files` table. A file with no spectrum still counts in the site total. Each download also records its format and where it started (see the fields below).
- **The site's own fetches of files.** The site's pages also fetch files: to plot a spectrum and its processed versions, to compare spectra, to show the metadata from the file, and in the edit form. These fetches add `?preview` to the address (`worker/public/spectrum.js`, `worker/public/submit.js`). A request with `?preview` is not a download. Every other request is a download, whatever the browser sends. The marker also gives these fetches their own entries in the browser cache, so a download never comes from a copy that a plot fetched.
- **Analytics Engine for pages.** A middleware on the main host (`recordPage` in `worker/src/usage.ts`, used in `worker/src/pages/index.tsx`) runs after each handler. It writes one data point for each `GET` with a 2xx or 304 response:
  - Surface `view`: a public HTML page, by any client. Docs pages count, because `/docs/*` runs the Worker first. Private pages do not count: `/account/`, `/admin/`, `/login/`, `/auth/`, `/submit-data/`, `/instruments/new/` and pages that end in `/edit/`.
  - Surface `agent`: a file for AI agents ([ADR 0028](/docs/adr/0028-agent-facing-surface/)). These are `/llms.txt`, `/docs/llms.txt`, `/docs/llms-full.txt` and `/docs/llms-small.txt` (resource `llms.txt`), the Markdown versions of pages, at `.md` addresses (`markdown`), the agent skill under `/docs/skills/` (`skill`), and `/api/openapi-v1.json` and `/api/openapi-v2.json` (`openapi`). All of them already reach the Worker.
  - A request with `Sec-Fetch-Site: same-origin` that is not a navigation is a fetch by the site's own script. Examples are the browse filters, the link prefetch of the docs and the usage dialog. It does not count.
  - A 304 counts: the browser shows its cached copy, which is still a page load. Docs pages ask the browser to check again on every visit, so most repeat visits to the docs are 304s.
  - A spectrum page sets `spectrumId` (only when the spectrum is published), and the data point records it.
- **Kinds of client.** `requestKind` in `worker/src/usage.ts` sorts each request for a page or an agent file into one kind. It reads the full User-Agent but stores only the kind and, for a named bot, the name.
  1. `ai`, `ai-user` or `search`: the User-Agent contains a name from the fixed list `BOTS`. `ai` is an AI crawler (GPTBot, ClaudeBot, CCBot, ...). `ai-user` is an AI agent that fetches a page for a person, at that moment (ChatGPT-User, Claude-User, ...). `search` is a search engine (Googlebot, bingbot, ...). The first match wins, so `Applebot-Extended` is found before `Applebot`.
  2. `bot`: any other User-Agent that contains `bot`, `crawl`, `spider`, `scrap`, `slurp` or `headless`.
  3. `browser`: `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document` and no `Sec-Purpose` header. Browsers send these when a person loads a page. Most bots and scripts do not.
  4. `other`: everything else, such as scripts, `curl` and prefetches.
  - For a `browser` request, `platform` in `worker/src/usage.ts` also stores the family of the operating system (`Windows`, `macOS`, `Linux`, `iOS`, `Android` or `Other`) and of the browser (`Chrome`, `Safari`, `Firefox`, `Edge`, `Opera`, `Samsung Internet` or `Other`). It never stores a version or a device model. The order of the checks matters: an iPhone also says "Mac OS X", Android also says "Linux", Edge, Opera and Samsung Internet also say "Chrome", and Chrome also says "Safari".
  - Only `browser` requests are **page views**. The website numbers on the statistics page and the numbers on a spectrum page count page views only.
- **A daily copy into D1.** The daily cron (`rollupUsage` in `worker/src/usage.ts`) sends one query to the Analytics Engine SQL API. It gets the counts of the last 7 complete days (UTC), grouped by all the fields below. It replaces those 7 days in the D1 table `usage_daily` in one transaction. So a missed run leaves no gap, and a run again gives the same rows. D1 keeps the rows for good, after Analytics Engine has dropped the data points.
- **A public statistics page.** `/stats/` (`worker/src/pages/stats.tsx`, in the About menu) reads only D1, so a visit never calls the Cloudflare API. A table of contents is beside the page, or above it on narrow screens, and marks the section on screen. The page starts with four totals: page views, API requests, downloads and published spectra. Each section has one chart across the page, then lists and tables.
  - **Website:** page views per day, stacked by operating system. A "Show bot traffic" checkbox above the chart stacks the other requests for pages on top, as AI crawlers and agents, search engine crawlers, and other bots and scripts. The label gives their share of all requests for pages. Then the browsers, the most visited sections, the most viewed spectra, the referring sites, and the AI crawlers and agents and the search engine crawlers by name.
  - **For AI agents:** requests for the agent files per day, stacked by resource, the kinds of client that fetch them, and the AI crawlers and agents by name.
  - **API:** requests per day by API, one table of the endpoints of all APIs, with a column for the API, and the clients, with a column for each API, so the users of v1 are easy to see.
  - **Downloads:** downloads per day, stacked by format, the most downloaded spectra, and from the website or direct.
  - **Countries:** page views, API requests and downloads by country.
  - **Spectra:** spectra per type and per element, and the published spectra over time.
  - **How we count:** what each number counts and what is kept.
  - uPlot draws the charts (`worker/public/stats.js`). A stacked chart draws running totals, and each band fills down to the series below it. With the cursor off a chart, the legend shows the dates and each series' total for all of them. A stacked chart also has a "Total" entry. With the cursor on a day, the legend shows that day.
- **Counts on the spectrum page.** The spectrum page shows "Page views" and "Downloads" for that spectrum, as numbers, and hides a row while its number is 0. The last row ends with "Details". It opens a dialog, like "History". The dialog fetches `/spectra/{slug}/usage/` when it first opens and shows that page's content. So the spectrum page itself runs only one more small query. The same page works without JavaScript. It shows the totals, the downloads over time stacked by format, and the page views over time. It uses one point per day, or one point per week when the counts cover more than 90 days. Weeks end on the last counted day, so only the first week can be partial.
- **Cloudflare Web Analytics for visitors.** An admin turns it on in the Cloudflare dashboard (automatic setup) after DNS for `eelsdb.eu` moves to Cloudflare ([ADR 0010](/docs/adr/0010-migrating-public-data/#cut-over-human-tasks)). It needs no code. It adds visitor numbers, which the page views above cannot give. This part is not done yet.

Each data point has these fields. A field that does not apply to a surface is empty.

| Field | Value |
|---|---|
| `index1` | The surface: `v1`, `v2`, `oai`, `dcat`, `download`, `view` or `agent`. |
| `blob1` | The surface. |
| `blob2` | The matched route, for example `/spectra/:slug/` or `/wp-content/uploads/*`. Never the raw path. |
| `blob3` | The HTTP method. |
| `blob4` | The client: the first product token of the User-Agent, for example `exSpy/0.4` or `python-requests/2.32`, at most 64 characters. It is empty when the User-Agent does not start with a product token, for example when it starts with an email address. |
| `blob5` | The country code from Cloudflare (`request.cf.country`). |
| `blob6` | `download` and `view`: the spectrum id. Empty for a file with no spectrum and for other pages. |
| `blob7` | `download`: the format. `msa`, `csv` or `json` for the converted downloads. For a stored file, its role in the `files` table: `original`, `legacy` (the original file from the old site), `lowloss`, `companion`, `variant`, `msa`, `hspy` or `metadata`. A stored MSA file and a converted MSA download are both `msa`. Empty when the file is not in `files`. |
| `blob8` | `download`: `site` when the download started on a page of this site, and `direct` otherwise (a script, a link on another site, a typed address). It is `site` when the browser sends `Sec-Fetch-Site: same-origin` or a `Referer` on this site. Safari sends no `Sec-Fetch` headers on a download, only the `Referer`. |
| `blob9` | `view`: the host of the `Referer` when it is another site, for example `www.google.com`. Empty for this site or no referrer. Never the full address. |
| `blob10` | `view` and `agent`: the kind of client: `browser`, `ai`, `ai-user`, `search`, `bot` or `other`. |
| `blob11` | `view` and `agent`: the bot's name from `BOTS`, for the kinds `ai`, `ai-user` and `search`. |
| `blob12` | `agent`: the resource: `llms.txt`, `markdown`, `skill` or `openapi`. |
| `blob13` | `view`, page views only: the family of the operating system. |
| `blob14` | `view`, page views only: the family of the browser. |
| `double1` | The response status. |

- The Worker never stores IP addresses, full User-Agents, full referrers or query strings in Analytics Engine. The API sets no cookies.
- A missing binding or an error from `writeDataPoint` never changes the response.
- `worker/test/api-usage.test.ts` fails if an API request, a download, a page view or a request for an agent file stops writing its data point, or writes the wrong fields. It also checks that the full User-Agent and the full referrer are never written. `worker/test/stats.test.ts` tests the copy into D1, the statistics page and the spectrum usage page.

### The D1 table

`usage_daily` (`worker/migrations/0022_usage_daily.sql`) has one row for each day, surface, dimension and value, with the count `n`. The table has no list of allowed dimensions, so a new dimension needs no migration.

| `dimension` | Surfaces | `value` |
|---|---|---|
| `total` | all | Empty. The count of all requests of the surface on that day, by every kind of client. |
| `client` | API, `download` | The client, or `other`. |
| `country` | API, `download`, `view` | The country code, or `other`. For `view`, page views only. |
| `endpoint` | API | The route. |
| `format` | `download` | The format, or `unknown` for downloads recorded before the format was. |
| `via` | `download` | `site`, `direct`, or `unknown` for downloads recorded before it was. |
| `spectrum` | `download`, `view` | The spectrum id. For `view`, page views only. |
| `spectrum_format` | `download` | The spectrum id and the format, as `22236:msa`. The usage page finds a spectrum's rows with `value GLOB '22236:*'`, which can use the primary key. |
| `section` | `view` | The route of the page, for example `/`, `/spectra/:slug/` or `/docs/*`. Page views only. |
| `referrer` | `view` | The other site's host, or `other`. Page views only. |
| `kind` | `view`, `agent` | The kind of client. |
| `bot` | `view`, `agent` | The bot's name. |
| `resource` | `agent` | The resource. |
| `os` | `view` | The family of the operating system, or `unknown` for page views recorded before it was. Page views only. |
| `browser` | `view` | The family of the browser, or `unknown`. Page views only. |

Only aggregates go into D1, never a single request. Requests by bots and scripts get no `country`, `referrer`, `section`, `spectrum`, `os` or `browser` rows, and `view` and `agent` get no `client` rows: browsers all send `Mozilla/5.0`.

### Rare clients, countries and referring sites

A custom User-Agent such as `someones-script/1.0` can point to one person, and so can a country with one lab or a small site that links to EELSdb. A client, country or referring site with fewer than 20 requests is therefore shown as "Other" (`MIN_COUNT` in `worker/src/usage.ts`). This happens twice:

- In the copy: a value with fewer than 20 requests in the 7 days of that run goes into D1 as `other`. A rare value never reaches D1. Clients are counted over the API and downloads, countries over the API, downloads and page views, and referring sites over page views.
- On the page: a value with fewer than 20 requests in the period shown (all the days in D1) is shown as "Other", and so is everything after the top 15.

20 is about three requests a day for a week. It hides one-off scripts and tests, and still names every client that is used often. It cannot hide a single person who sends many requests: no count can, without IP addresses.

These are not personal data, so the threshold does not apply to them: endpoints, formats, `via`, sections, kinds, bot names, resources, and the counts per spectrum.

For one spectrum, the page shows no clients and no countries. They could point to one person, for example the author who downloads their own spectrum.

### Settings

- `ANALYTICS_ACCOUNT_ID`: the Cloudflare account ID.
- `ANALYTICS_API_TOKEN`: an API token with only the `Account Analytics Read` permission.
- `API_USAGE_DATASET` (a var in `worker/wrangler.jsonc`, per environment): the dataset that the query reads. It must name the dataset of the `API_USAGE` binding.

The account ID and the token are secrets, never in the repo ([ADR 0010](/docs/adr/0010-migrating-public-data/#cut-over-human-tasks) lists them for the cut-over). Without the token, the cron skips the copy. Local development and the tests run without it.

This query, sent by hand, lists the API v1 clients of the last 30 days. Analytics Engine samples at high volume, so count with `_sample_interval`.

```sql
SELECT blob4 AS client, blob2 AS route, SUM(_sample_interval) AS requests
FROM eelsdb_api
WHERE index1 = 'v1' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY client, route
ORDER BY requests DESC
```

Send it to `https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql` with an API token that has the `Account Analytics Read` permission.

## Consequences

- exSpy sends a desktop Chrome User-Agent ([ADR 0008](/docs/adr/0008-api-v1-frozen-contract/)), so its client is `Mozilla/5.0`, the same as a browser. exSpy asks for `/spectra` without a trailing slash. v1 rows with client `Mozilla/5.0` and route `/spectra` are therefore almost all exSpy.
- Analytics Engine keeps data for three months. D1 keeps the daily counts for good. The first run copies only the last 7 days, so the counts start on the first day that run covers. Page views and agent files start later than API requests and downloads, and the spectrum usage dialog says so.
- Downloads before the new site went live are not counted.
- Downloads recorded before the format and `via` were have the value `unknown` ("Not recorded"). Days that were copied into D1 before this change, and are older than the 7 days of the next copy, have a `spectrum` row but no `spectrum_format` row. Their downloads are in the count on the spectrum page, but not in its chart.
- The D1 table holds no client name, country or referring site with fewer than 20 requests in a week. A question about rare values needs the SQL API within three months.
- A page view is a page load, not a visitor. A person who opens five pages, or one page five times, makes five page views. Cloudflare Web Analytics gives visitor numbers after the domain switch.
- A bot can send the headers of a browser, and then it counts as a page view. Bots that do not name themselves and send no `Sec-Fetch` headers count as `other`.
- The bot list is short and fixed. A new AI crawler counts as `bot` (or as `browser` or `other`, if it does not say it is a bot) until someone adds its name to `BOTS`.
- A page that the browser prerenders, for example from the address bar, sends `Sec-Purpose` and counts as `other`, even when the person then looks at it. A prefetch by another site counts as `other` too.
- Search engines and other bots that follow download links count as downloads. Most of them send a `Mozilla/5.0` User-Agent, like browsers.
- Workers Logs keep the request URL and other request details for 7 days. Only people with access to the Cloudflare account can read them.
- `env.dev` runs on workers.dev, which has no `api.` host. `eelsdb_dev_api` gets no API requests until the dev deployment moves to `dev.eelsdb.eu`. It does get downloads, page views and agent files.
- Web Analytics injects its script into HTML at the edge. After the domain switch, check that a page loads `static.cloudflareinsights.com/beacon.min.js`. A response with `Cache-Control: no-transform` gets no script.

## Alternatives considered

- **Read Analytics Engine when the page loads.** Each visit would call the Cloudflare API with the token, the page would be slower, and it could show three months at most.
- **Upsert each row without the delete.** A value can fall below the threshold in a later run. Its old row would stay beside the new `other` row and count twice.
- **Tell the site's own fetches of files apart by their `Sec-Fetch-*` headers.** This was the first rule: `Sec-Fetch-Site: same-origin` and a `Sec-Fetch-Mode` other than `navigate` did not count. It worked for a click on a download link in Chromium and WebKit. But it depends on how each browser marks a download, for example "Save link as", a browser we did not test, or a download that a page starts from a script. The `?preview` marker does not depend on the browser.
- **Mark the site's fetches with a header instead of `?preview`.** A header does not change the cache key, so a download could still come from the copy that the plot fetched.
- **A column for the spectrum in `usage_daily`.** It needs a migration, and every other dimension would leave it empty. A value such as `22236:msa` works in the generic table.
- **A JSON route for the usage dialog.** The browser would have to build the charts and the labels again in JavaScript. The HTML page reuses the components of the statistics page and also works without JavaScript.
- **Show the page views as a line on the downloads chart.** There are many more page views than downloads, so the download bands would be too thin to read on the same axis.
- **Count only page views by browsers.** Bots and AI crawlers are a large and growing part of the traffic. We keep them as kinds and show them apart.
- **A list of bots from a package.** It adds a dependency for a list of about twenty names.
- **Cloudflare's bot fields.** `request.cf.botManagement` needs Enterprise Bot Management, and the verified bot category is a field of firewall rules only, not of `request.cf`.
- **A D1 table of requests.** Every request would cost a D1 write, and we would need our own clean-up and query code. Analytics Engine is made for this.
- **Store the full User-Agent, the full referrer or the IP address.** These can identify a person, and some User-Agents hold an email address. The first product token, the kind and the bot's name answer "which client" without them. The referrer's host answers "which site".
- **Google Analytics, Plausible or Matomo.** These add a vendor ([ADR 0006](/docs/adr/0006-no-hard-external-dependencies/)), and some need cookies and a consent banner.
- **Workers Logs only.** They keep 7 days, so they cannot show a trend over months. Counting clients from raw logs also means more personal data than we need.

## Research

Cloudflare documentation, November 2026:

- Analytics Engine keeps data for three months. A data point has up to 20 blobs (16 KB in total), up to 20 doubles and one index of at most 96 bytes. One invocation can write at most 250 data points.
- Workers Paid includes 10 million Analytics Engine data points and 1 million read queries a month. Each further million costs $0.25 (writes) or $1.00 (queries).
- Workers Logs keep 7 days on Workers Paid. 20 million log events a month are included, then $0.60 per million.
- Wrangler 4.151 treats `observability` as inheritable, so `env.dev` gets it from the top level. `analytics_engine_datasets` is a binding and is not inherited.
- The SQL API takes the query as the body of a `POST`, with the token as a bearer token. `FORMAT JSON` returns `meta`, `data` and `rows`. The code reads each count with `Number()`, because large integers may come as strings.
- D1 allows 100 bound parameters in a statement. The copy sends all rows as one JSON parameter and inserts them with `json_each`.
- Web Analytics automatic setup works only on hostnames that Cloudflare proxies. Cloudflare states that Web Analytics does not collect visitors' personal data.
- `request.cf` in Workers has `botManagement` (with `verifiedBot` and a score) only with Bot Management. It has no verified bot category.

Browser tests, November 2026, with Playwright 1.64 against a test server that logged the request headers. A page fetched a file, then a person clicked `<a download>` links to the same file and to another file:

- Chromium: the fetch sent `Sec-Fetch-Mode: cors`. Each download click sent `Sec-Fetch-Site: same-origin`, `Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: empty`, and reached the server, also for the file the page had just fetched.
- WebKit: the fetch sent `Sec-Fetch` headers, but the download clicks sent none, only the `Referer`. Each click reached the server.
- Firefox could not run in the test sandbox and was not tested.
- Docs pages are served with `Cache-Control: public, max-age=0, must-revalidate`, so a repeat visit is a conditional request that gets a 304.
