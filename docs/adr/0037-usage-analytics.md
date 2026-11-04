---
title: "0037. Usage analytics"
description: "Workers Logs, an Analytics Engine count of API calls by client, and Cloudflare Web Analytics for the pages. No IP addresses, full User-Agents or cookies."
adr:
  date: 2026-11-04
  implemented: partly
---

## Context

- We can retire API v1 only when we know who still calls it, and how often ([ADR 0008](/docs/adr/0008-api-v1-frozen-contract/)). The old site kept no usage data.
- API v2, OAI-PMH and DCAT are new ([ADR 0009](/docs/adr/0009-api-v2/), [ADR 0026](/docs/adr/0026-metadata-harvesting/)). We want to know if clients and harvesters use them.
- Errors in the Worker must be visible after they happen. `wrangler tail` shows live requests only.
- Usage data must not hold personal data. Some User-Agents contain an email address, because the API docs ask scripts to name a contact.
- EELSdb must work without an outside service ([ADR 0006](/docs/adr/0006-no-hard-external-dependencies/)).

## Decision

EELSdb uses three Cloudflare features. None adds a vendor or a cookie.

- **Workers Logs.** `"observability": { "enabled": true }` in `worker/wrangler.jsonc` keeps the log of each invocation and its `console` output. `env.dev` inherits the setting.
- **Analytics Engine for the API.** The middleware of the `api` app in `worker/src/api/index.ts` writes one data point for each request to the API host. API v1, API v2, OAI-PMH and DCAT all pass through it. The binding is `API_USAGE`. The dataset is `eelsdb_api`, and `eelsdb_dev_api` for `env.dev`. Cloudflare creates a dataset on its first write.
- **Cloudflare Web Analytics for the pages.** An admin turns it on in the Cloudflare dashboard (automatic setup) after DNS for `eelsdb.eu` moves to Cloudflare ([ADR 0010](/docs/adr/0010-migrating-public-data/#cut-over-human-tasks)). It needs no code. This part is not done yet.

Each data point has these fields:

| Field | Value |
|---|---|
| `index1` | The surface: `v1`, `v2`, `oai` or `dcat`. |
| `blob1` | The surface. |
| `blob2` | The matched route, for example `/spectra/:slug/`. Never the raw path. |
| `blob3` | The HTTP method. |
| `blob4` | The client: the first product token of the User-Agent, for example `exSpy/0.4` or `python-requests/2.32`, at most 64 characters. It is empty when the User-Agent does not start with a product token, for example when it starts with an email address. |
| `blob5` | The country code from Cloudflare (`request.cf.country`). |
| `double1` | The response status. |

- The Worker never stores IP addresses, full User-Agents or query strings in Analytics Engine. The API sets no cookies.
- A missing binding or an error from `writeDataPoint` never changes the response.
- `worker/test/api-usage.test.ts` fails if a v1 request stops writing its data point.

This query lists the API v1 clients of the last 30 days. Analytics Engine samples at high volume, so count with `_sample_interval`.

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
- Analytics Engine keeps data for three months. For a longer trend, copy the aggregate counts into ADR 0008 from time to time.
- Workers Logs keep the request URL and other request details for 7 days. Only people with access to the Cloudflare account can read them.
- `env.dev` runs on workers.dev, which has no `api.` host. `eelsdb_dev_api` stays empty until the dev deployment moves to `dev.eelsdb.eu`.
- Web Analytics injects its script into HTML at the edge. After the domain switch, check that a page loads `static.cloudflareinsights.com/beacon.min.js`. A response with `Cache-Control: no-transform` gets no script.

## Alternatives considered

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
- Web Analytics automatic setup works only on hostnames that Cloudflare proxies. Cloudflare states that Web Analytics does not collect visitors' personal data.
