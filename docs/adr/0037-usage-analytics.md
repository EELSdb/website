---
title: "0037. Usage analytics"
description: "Workers Logs, an Analytics Engine count of API calls and downloads, a daily copy into D1 for the public statistics page, and Cloudflare Web Analytics for the pages. No IP addresses, full User-Agents or cookies."
adr:
  date: 2026-11-04
  implemented: partly
---

## Context

- We can retire API v1 only when we know who still calls it, and how often ([ADR 0008](/docs/adr/0008-api-v1-frozen-contract/)). The old site kept no usage data.
- API v2, OAI-PMH and DCAT are new ([ADR 0009](/docs/adr/0009-api-v2/), [ADR 0026](/docs/adr/0026-metadata-harvesting/)). We want to know if clients and harvesters use them.
- Contributors and funders ask how often the spectra are used. The old site showed no counts.
- Errors in the Worker must be visible after they happen. `wrangler tail` shows live requests only.
- Usage data must not hold personal data. Some User-Agents contain an email address, because the API docs ask scripts to name a contact.
- EELSdb must work without an outside service ([ADR 0006](/docs/adr/0006-no-hard-external-dependencies/)).

## Decision

EELSdb uses three Cloudflare features. None adds a vendor or a cookie.

- **Workers Logs.** `"observability": { "enabled": true }` in `worker/wrangler.jsonc` keeps the log of each invocation and its `console` output. `env.dev` inherits the setting.
- **Analytics Engine for the API.** The middleware of the `api` app in `worker/src/api/index.ts` writes one data point for each request to the API host. API v1, API v2, OAI-PMH and DCAT all pass through it. The binding is `API_USAGE`. The dataset is `eelsdb_api`, and `eelsdb_dev_api` for `env.dev`. Cloudflare creates a dataset on its first write.
- **Analytics Engine for downloads.** Spectrum files are on the main host, so the API middleware does not see them. The download handlers write the same kind of data point, with the surface `download`: the MSA, CSV and JSON downloads (`worker/src/pages/download.ts`) and the R2 file routes `/files/*`, `/wp-content/uploads/*` and `/submissions/*` (`serveFile` in `worker/src/files.ts`). The `download_link` of API v1, which exSpy uses, points at `/wp-content/uploads/*`, so exSpy downloads count too. The file routes find the spectrum through the `files` table. A file with no spectrum still counts in the site total. The site's own pages fetch files to plot them. A request with `Sec-Fetch-Site: same-origin` and a `Sec-Fetch-Mode` other than `navigate` is such a fetch and does not count. A click on a download link is a navigation, so it counts.
- **A daily copy into D1.** The daily cron (`rollupUsage` in `worker/src/usage.ts`) sends one query to the Analytics Engine SQL API. It gets the counts of the last 7 complete days (UTC), by day, surface, client, country and spectrum. It replaces those 7 days in the D1 table `usage_daily` in one transaction. So a missed run leaves no gap, and a run again gives the same rows. D1 keeps the rows for good, after Analytics Engine has dropped the data points.
- **A public statistics page.** `/stats/` (`worker/src/pages/stats.tsx`, in the About menu) reads only D1, so a visit never calls the Cloudflare API. It shows API requests per day by API, downloads per day, the top clients and countries, the spectra per type and per element, and the published spectra over time. It says what is counted, what is never stored and the first day of the counts. uPlot draws the charts (`worker/public/stats.js`). The spectrum page shows the downloads of that spectrum, for example "123 since 2026-11-05", and nothing while it has none.
- **Cloudflare Web Analytics for the pages.** An admin turns it on in the Cloudflare dashboard (automatic setup) after DNS for `eelsdb.eu` moves to Cloudflare ([ADR 0010](/docs/adr/0010-migrating-public-data/#cut-over-human-tasks)). It needs no code. This part is not done yet.

Each data point has these fields:

| Field | Value |
|---|---|
| `index1` | The surface: `v1`, `v2`, `oai`, `dcat` or `download`. |
| `blob1` | The surface. |
| `blob2` | The matched route, for example `/spectra/:slug/` or `/wp-content/uploads/*`. Never the raw path. |
| `blob3` | The HTTP method. |
| `blob4` | The client: the first product token of the User-Agent, for example `exSpy/0.4` or `python-requests/2.32`, at most 64 characters. It is empty when the User-Agent does not start with a product token, for example when it starts with an email address. |
| `blob5` | The country code from Cloudflare (`request.cf.country`). |
| `blob6` | Downloads only: the spectrum id, or empty for a file with no spectrum. |
| `double1` | The response status. |

- The Worker never stores IP addresses, full User-Agents or query strings in Analytics Engine. The API sets no cookies.
- A missing binding or an error from `writeDataPoint` never changes the response.
- `worker/test/api-usage.test.ts` fails if a v1 request or a download stops writing its data point. `worker/test/stats.test.ts` tests the copy into D1 and the page.

### The D1 table

`usage_daily` (`worker/migrations/0022_usage_daily.sql`) has one row for each day, surface, dimension and value, with the count `n`:

| `dimension` | `value` |
|---|---|
| `total` | Empty. The count of all requests of the surface on that day. |
| `client` | The client, or `other`. |
| `country` | The country code, or `other`. |
| `spectrum` | The spectrum id. Downloads only. |

Only aggregates go into D1, never a single request.

### Rare clients and countries

A custom User-Agent such as `someones-script/1.0` can point to one person, and so can a country with one lab. A client or country with fewer than 20 requests is therefore shown as "Other" (`MIN_COUNT` in `worker/src/usage.ts`). This happens twice:

- In the copy: a value with fewer than 20 requests in the 7 days of that run goes into D1 as `other`. A rare value never reaches D1.
- On the page: a value with fewer than 20 requests in the period shown (all the days in D1) is shown as "Other", and so is everything after the top 15.

20 is about three requests a day for a week. It hides one-off scripts and tests, and still names every client that is used often. It cannot hide a single person who sends many requests: no count can, without IP addresses. Downloads per spectrum are not personal data, so the threshold does not apply to them.

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
- Analytics Engine keeps data for three months. D1 keeps the daily counts for good. The first run copies only the last 7 days, so the counts start on the first day that run covers.
- Downloads before the new site went live are not counted.
- The D1 table holds no client name or country with fewer than 20 requests in a week. A question about rare clients needs the SQL API within three months.
- Search engines and other bots that follow download links count as downloads. Most of them send a `Mozilla/5.0` User-Agent, like browsers.
- Page views can come later, after the domain switch: the cron can read Cloudflare Web Analytics through its GraphQL API into the same table. This is not built.
- Workers Logs keep the request URL and other request details for 7 days. Only people with access to the Cloudflare account can read them.
- `env.dev` runs on workers.dev, which has no `api.` host. `eelsdb_dev_api` stays empty until the dev deployment moves to `dev.eelsdb.eu`.
- Web Analytics injects its script into HTML at the edge. After the domain switch, check that a page loads `static.cloudflareinsights.com/beacon.min.js`. A response with `Cache-Control: no-transform` gets no script.

## Alternatives considered

- **Read Analytics Engine when the page loads.** Each visit would call the Cloudflare API with the token, the page would be slower, and it could show three months at most.
- **Upsert each row without the delete.** A value can fall below the threshold in a later run. Its old row would stay beside the new `other` row and count twice.
- **Count downloads with a query parameter from the site's own pages.** It needs a change to every script that fetches a file. The `Sec-Fetch-*` headers tell the two apart with no change.
- **A D1 table of requests.** Every API call would cost a D1 write, and we would need our own clean-up and query code. Analytics Engine is made for this.
- **Store the full User-Agent or the IP address.** These can identify a person, and some User-Agents hold an email address. The first product token answers "which client" without them.
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
