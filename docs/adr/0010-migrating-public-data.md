---
title: "0010. Migrating public data"
description: "We record the old site's public data, fix its energy errors and drop dead content."
adr:
  date: 2026-10-20
  implemented: partly
---

## Context

The old site had 290 published spectra: 188 core-loss, 80 low-loss, 21 X-ray absorption and 1 zero-loss. It also had 21 private spectra from 2007–2008. 206 spectra came from the pre-2014 database, and contributors submitted 84 since 2014. The files are 273 `.msa` and 17 `.txt` files in 5 layouts, about 8 MB in total.

The migration has two separate tracks. One track handles public data and the other handles personal data ([ADR 0011](/docs/adr/0011-migrating-accounts/)).

## Decision

Public data comes only from public URLs. The scripts only read, send at most one request per second and use a User-Agent that names the project. We can commit the public data, except the files themselves.

1. Record the live API with `python/record_api.py` into `data/fixtures/api-v1/`. The recording covers these requests:
   - Every spectrum object.
   - Every filter and query shape that exSpy can send, with and without the trailing slash.
   - Each `*_compare` value, paging and sorts.
   - Unknown parameters (400) and unknown paths (404).
   - The route index and news.

   The recording leaves out the users routes, because they hold personal data.
2. Download every file to `data/cache/files/` (gitignored) and keep the URL path. Record the SHA-256s in `data/fixtures/files.json`.
3. Read every file with RosettaSciIO (`python/analyse_files.py`). Record the true energy axis in `data/fixtures/file-analysis.json`.
4. Build the seed with `python/build_seed.py`. It writes SQL inserts for D1 and an R2 upload list. The repo contains the seed (`data/seed/seed.sql`), so the Worker tests run without Python. A Python test checks that the seed is current.
5. Replace the old hand-typed edge table with the exSpy edge table.

The repository does not contain the spectrum files. They live in `data/cache/` and R2.

## Research: what reading every file found

- 16 files exported from HyperSpy (MSA `DATATYPE: Y`) had impossible energy ranges. The old PHP parser assumed two columns. Energy searches never found these files.
- The 2014 import script wrote a wrong `XPERCHAN` in 8 files with non-uniform data. The value is more than 10% off the real step. The files also have 2 wrong `OFFSET`s and 5 non-increasing axes.
- The 17 `.txt` files use 5 layouts. Variants of `numpy.loadtxt` parse them.
- 224 of the 273 MSA files contain no acquisition metadata.
- The old edge table disagreed with exSpy for 59 of 154 comparable edges. It stored combined edges such as L2,3 as one value between the two onsets. For NiO it stored 864 eV, against 855 and 872 eV.
- The old upload parser did arithmetic on the first column of every line. Under PHP 7, a blank line or a header line without `#` became energy 0 with no warning. Do not trust old derived min/max energies.
- RosettaSciIO read the headers of all 273 MSA files. It keeps padded keys (`BEAMKV   -kV`), so the reader must normalise them.
- For `#DATATYPE: XY`, RosettaSciIO 0.15 ignores the X column and builds an even axis from `#OFFSET` and `#XPERCHAN`, with no warning. Uneven or wrong headers therefore give wrong energies: in November 2026, 793 of the 1,598 XY MSA files in `data/cache/files` were more than 0.01 eV off, and a Corex file was up to 7.9 eV off. Blank `#OFFSET`/`#XPERCHAN` give `""` or a 0, 1, 2… axis. The reader therefore reads the X column itself, and HyperSpy users should load the HSPY files.
- A `DATATYPE: Y` file with no axis now fails with a clear error. EMSA 1.0 has not changed, so the age of a file does not matter.

## Clean-up at import

- The importer drops the keyword "imported from old site" (on 210 of 290 spectra) from the new data. It also drops the dead `pc-web.cemes.fr` links (on 210). The v1 replay keeps both.
- The importer removes links from public spectra to private ones. It removes them from the v1 objects too.
- Corrected energy ranges change the v1 object on purpose. `EXPECTED_DIFFS.md` lists each one.
- The importer sets `licence` to `ODbL-1.0` on every spectrum. The old site stored no licence per spectrum, but it stated the ODbL for all its data and its submit form asked contributors to agree to it ([ADR 0023](/docs/adr/0023-licences/)).

## Consequences

- The import scripts and the seed are built and run locally. The cut-over below has not happened, so the new site is not live and the old site still serves eelsdb.eu.
- In a fresh checkout, run the download scripts to fill `data/cache/` before you rebuild the seed. The committed seed is enough to run the Worker and its tests.
- We found data issues that we did not fix. One spectrum shows an energy step of 3,710 eV. Some download filenames look random (`DspecIk9kBZ.msa`).
- The private spectra need the `wp-content/uploads` folder from the old host. A person must copy it at cut-over.

## Cut-over (human tasks)

1. Make the WordPress site read-only. Record the API and run the imports one final time. The account export no longer writes old logins or password hashes, and it rewrites `data/private/accounts.sql` in full ([ADR 0011](/docs/adr/0011-migrating-accounts/)).
2. Copy `wp-content/uploads` from the host.
3. Create the Cloudflare resources in the EU jurisdiction ([ADR 0001](/docs/adr/0001-cloudflare-workers-d1-r2/)): `npx wrangler d1 create eelsdb --jurisdiction eu` and `npx wrangler r2 bucket create eelsdb-files --jurisdiction eu`. Put the new database ID in `wrangler.jsonc`, and add `"jurisdiction": "eu"` to the `eelsdb-files` binding, or the Worker cannot find the bucket. Then deploy. DNS for `eelsdb.eu` is already on Cloudflare (moved on 2026-11-05, still pointing at the old host): replace the `eelsdb.eu`, `www` and `api` records with the Worker's custom domains. Then turn on Cloudflare Web Analytics for `eelsdb.eu` in the dashboard (automatic setup, no code; [ADR 0037](/docs/adr/0037-usage-analytics/)).
4. Set up the redirects. `/forum/…`, `/jobs/…` and `/registered-users/` return 410. `/wp-login.php` redirects to the new sign-in.
5. Before you deploy, set up these items:
   - `EMAIL_PROVIDER=cloudflare` and `EMAIL_FROM=info@eelsdb.eu`, as `env.dev` sets them. `eelsdb.eu` is already onboarded for Email Sending, and the account has Workers Paid, which email sending needs.
   - Real Turnstile keys.
   - OAuth client IDs.
   - A Cloudflare API token with only the Account Analytics Read permission. Set it and the account ID as the secrets `ANALYTICS_API_TOKEN` and `ANALYTICS_ACCOUNT_ID`, so the daily cron copies usage counts into D1 ([ADR 0037](/docs/adr/0037-usage-analytics/)).
   - Two-step sign-in on the admin account of the owner. With the defaults, an admin without two-step sign-in has no powers, and contact messages reach nobody.
6. Give the Corex spectra ([ADR 0024](/docs/adr/0024-scope-gas-phase-and-xas/)) an account their author can take over. Create it with only a display name, the username `adam-hitchcock` and his current address as `legacy_email`, and make it the owner of those spectra:

   ```sql
   INSERT INTO users (display_name, slug, legacy_email, use_gravatar) VALUES ('Adam Hitchcock', 'adam-hitchcock', '<his address>', 1);
   UPDATE spectra SET owner_id = (SELECT id FROM users WHERE slug = 'adam-hitchcock') WHERE author_slug = 'adam-hitchcock' AND owner_id IS NULL;
   ```

   He then takes them over like any old account: with an email link to that address, or Google or GitHub with it.
7. Email the contributors who own spectra (about 42 accounts) yourself, from your own address rather than through the site, so that old addresses that bounce do not hurt the sending reputation of `eelsdb.eu`. Tell them their spectra are on the new site, and that an email link to that address signs them straight in to them. If they sign in another way, such as ORCID, they confirm that address under **Settings**, **Email addresses** to take the spectra over. Anyone whose address no longer works can reply, and an administrator merges their account. This lists them:

   ```sql
   SELECT u.display_name, u.legacy_email, COUNT(s.id) AS spectra FROM users u JOIN spectra s ON s.owner_id = u.id
   WHERE u.legacy_email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identities i WHERE i.user_id = u.id)
   GROUP BY u.id ORDER BY spectra DESC;
   ```

   Invite the other kept accounts later, when the site has its newsletter.
8. Watch 404s and failed sign-ins for a few weeks. Announce the new site on HyperSpy channels.
9. Decommission the old host and rotate its credentials. DNS and `info@eelsdb.eu` mail no longer go through it. The domain stays registered at 123-reg, because Cloudflare Registrar does not offer `.eu`; only its nameservers point at Cloudflare.
