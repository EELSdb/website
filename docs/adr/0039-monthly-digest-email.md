---
title: "0039. Monthly digest email"
description: "People who ask for it get one email a month with the new news articles and spectra. Months with nothing new send nothing."
adr:
  date: 2026-11-06
---

## Context

The old site had a MailChimp newsletter that summarised new spectra and news each month. The list no longer exists. Registered users are the natural readers: they have a confirmed address and an account where they can change their mind.

New spectra arrive rarely and in bursts. Most months bring one or two spectra, many bring none, and an import can bring hundreds at once (666 gas-phase spectra in October 2026). News is also rare. A digest that goes out on a fixed day whether or not anything happened would train people to ignore it.

The site sends email through `sendEmail` in `worker/src/email.ts`. Workers Paid includes 3,000 emails a month, and the site caps itself at 1,000 a day and 3,000 in 30 days. Sign-in links and moderation emails use the same caps.

Cloudflare Email Service is for transactional email. Its FAQ answers "Can I use Email Service for marketing emails?" with "No". A digest that people ask for, about the site where they have an account, is close to the line but may count as marketing.

## Decision

### Who gets it

- Nobody gets the digest unless they ask for it. `users.digest` is 0 by default.
- It goes to a confirmed address of the account: the primary address if it is confirmed, otherwise the oldest confirmed one. An account with no confirmed address gets nothing.
- People turn it on in four places:
  - an unticked box on the welcome page and on the email step of sign-up. When the welcome page sends a sign-in link, the box rides with the link (`login_links.digest`) until the account exists.
  - a banner for signed-in people who have it off, a confirmed address, and no other banner showing. The cross hides it for 90 days in that browser, like the other banners.
  - a "Monthly digest" section on Settings › Email addresses.
- Every email has an unsubscribe link with a random per-account token (`users.digest_token`) and the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. Opening the link shows a page with a button. A `POST` to the same address unsubscribes at once, so mail clients' one-click unsubscribe works. Link scanners only send `GET`, so they cannot unsubscribe anyone. No sign-in is needed.

### What goes in it

- One digest covers one calendar month (UTC): the news articles and the spectra published in that month. A month with neither sends nothing.
- News comes first, newest first. Every article looks the same: title, date, the article's summary ([ADR 0038](/docs/adr/0038-news-on-the-site/)) and a "Read the article" button. The digest never cuts an article's text.
- Spectra come next:
  - One to three spectra get a card each, with a large plot, the edges, energy range, resolution, beam energy, contributor, reference and a "First … spectrum on EELSdb" label for each edge that no earlier published spectrum has.
  - More than three show as tiles grouped by contributor. With one contributor, six tiles. With several, the largest gets four, the next three get two each, and the rest are named in a line. A button opens the browse page sorted by newest first.
  - Six or more elements add a periodic table with the number of new spectra per element. It is an HTML table, so it shows with images off.
- The email opens with the logo and two lines that say what EELSdb is and what the email is, with a link to the setting. It ends with a panel that asks readers to share their own spectra, then the footer: the address it went to, Unsubscribe, Email settings and View in a browser.
- The subject always starts "EELSdb digest: ". It is the news titles when they fit in 60 characters, or the spectrum titles when there is no news and they fit in 50, or else a count such as "2 news articles and 7 new spectra in May". The preview text (the inbox line after the subject) reads on its own and gives what the subject leaves out.
- Every email has a plain-text part with the same content.
- The HTML follows email-client practice: tables, inline styles, a 600px column, Outlook conditional comments, dark-mode classes for clients that support them, and a web font only where it loads. The whole email stays under Gmail's 102 KB clipping limit; however many spectra arrive, the email is the same size.
- `/digest/YYYY-MM/` shows each digest on the web, without the recipient's address or unsubscribe link.

### Plots

The plots are PNGs drawn by the share-card renderer ([ADR 0036](/docs/adr/0036-share-cards/)): `/og/digest/plot/{slug}.png` for cards and `/og/digest/tile/{slug}.png` for tiles. They have a transparent background and mid-tone colours, so they work on light and dark backgrounds. The edge cache keeps them for a day, and mail clients' image proxies keep their own copies.

### Sending

- The daily cron builds the previous month's digest once it ends. The month's content is stored as JSON in `digests.data_json`, so later edits to a spectrum or article do not change a digest that is already going out. The recipients are fixed at the same time in `digest_sends`.
- Each run sends to the waiting recipients through `sendEmail`, at most 300 per run. The digest stops while fewer than 200 of the day's emails, or 500 of the 30 days', are left, so sign-in links and moderation emails always get through. Recipients who turned the digest off or lost their confirmed address in the meantime are skipped.
- Each recipient's email is rendered from the stored JSON when it is sent, so the address and unsubscribe link are theirs.
- The site setting `digest_enabled` switches the whole digest on and off. It is on by default, and is there to stop the digest at once if something goes wrong. While it is off, nothing is built or sent. Switching it back on sends the previous month's digest at the next daily run; earlier months are never sent.
- Admins have `/admin/digest/`: the switch, a preview of any month, a test send to their own address, and each digest with its sent and waiting counts.

### Schema

- `users.digest` (0 or 1) and `users.digest_token` (random, unique, set when the digest is first turned on).
- `login_links.digest` (0 or 1).
- `digests (month, data_json, created_at)`, one row per month that had something new.
- `digest_sends (month, user_id, sent_at)`. A row with no `sent_at` is still waiting.

## Consequences

- Most months send nothing or one short email. At 400 readers, a digest uses 400 of the 3,000 included emails, and the reserve keeps sign-in mail working on the day it goes out.
- The digest sends through Cloudflare Email Service, like every other email. We accept the risk that Cloudflare counts it as marketing. If it does, it could limit the account, and sign-in links would stop too. Then the switch stops the digest at once, and moving it to another provider changes only `sendEmail`.
- The emails were checked in Chromium only. Send test digests from the admin page to Outlook desktop (images off), Gmail web and app (dark mode), Apple Mail and Yahoo before the first digest goes out.
- A month that the switch skipped is lost. A late digest covering several months would need headings and a subject that no longer say one month.
- The digest uses each article's summary, so the news editor's hint says the summary appears in the digest.

## Alternatives considered

- **A newsletter service (MailChimp and similar).** The list would have to be kept in step with accounts, a third party would hold every reader's address, and someone would have to write each issue. The digest writes itself from the database.
- **A digest every week, or an email for each new spectrum.** There are too few spectra for a weekly email, and an import would send hundreds of emails.
- **A window "since the last digest".** After a quiet spell, one digest would cover several months, and "in October" headings would be wrong. Calendar months are simpler to explain and to test.
- **Sending on the 1st whatever happened.** An empty digest teaches people to ignore it.
- **Plots made offline with matplotlib.** The site has no server-side Python. The share-card renderer already draws spectra as SVG.
- **Signed (HMAC) unsubscribe links.** They need a secret and cannot be revoked one at a time. A random token in the database needs neither.
- **Storing the banner's "hide" in the database.** The other banners hide per browser for a set time. One rule for every banner is easier to understand.
- **A smaller heading and an outlined button for all but the first news article.** It ranks articles that have equal weight.
- **A periodic table in every digest.** With one or two spectra it is almost all empty cells.
- **Counts-only subjects ("1 news article and 1 new spectrum").** They are predictable, but they say nothing about what is new. The rules above fall back to counts only when titles do not fit.
- **A second provider for the digest only (for example Amazon SES or Resend).** It would keep the risk away from sign-in mail, but it adds an account, keys, a second domain set-up and a second sending path to look after. The switch and `sendEmail` keep it a small change if Cloudflare objects.
- **A queue, a Durable Object or a more frequent cron for sending.** At a few hundred readers, the daily run sends everything in one or two days. They add moving parts for no gain.
- **A filter on the browse page for the digest's month.** Sorting by newest puts the month's spectra first, with no change to the browse page or API v2.

## Research

Sizes of the mockup's HTML, measured on 2026-11-06 with real months from the database and made-up news text:

| Month | Content | HTML |
|---|---|---|
| September 2026 | 1 article, no spectra | 12 KB |
| October 2023 | 1 article, 1 spectrum | 18 KB |
| November 2023 | 2 spectra | 19 KB |
| May 2022 | 2 articles, 7 spectra | 25 KB |
| October 2026 | 1 article, 666 spectra | 50 KB |
| January 2008 | 24 spectra from 6 contributors | 63 KB |

Cloudflare Email Service (checked 2026-11-06): the `send_email` binding accepts `html`, `text` and `headers`. It allows `List-Unsubscribe`, `List-Unsubscribe-Post`, `List-Id`, `Precedence`, `Auto-Submitted` and `X-` headers. Sending to a suppressed address throws `E_RECIPIENT_SUPPRESSED`.
