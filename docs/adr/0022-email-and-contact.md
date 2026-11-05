---
title: "0022. Email and contact form"
description: "The Worker sends email through Cloudflare Email Service, and the contact form emails the admins."
adr:
  date: 2026-10-22
---

## Context

Several features send email: email links, address confirmation, account-change notices, moderation messages and a contact form. An outside provider would add a vendor. One example is the free tier of Resend, which allows about 3,000 emails a month.

## Decision

### Sending

- `worker/src/email.ts` provides `sendEmail(env, { to, subject, text, replyTo })`.
- There are two providers. `log` is the default. It prints to the Worker log and keeps `sent` for tests. `cloudflare` uses the Workers `send_email` binding of Cloudflare Email Service. We chose Cloudflare Email Service to avoid another vendor. Sending to arbitrary recipients needs Workers Paid ([ADR 0001](/docs/adr/0001-cloudflare-workers-d1-r2/)).
- `wrangler.jsonc` always contains the `EMAIL` binding. `wrangler dev` and the test pool simulate the binding without an account. `EMAIL_PROVIDER=log` stays the default, so the Worker sends nothing until someone configures a provider. `eelsdb.eu` is set up for Email Sending in the Cloudflare account; it added a DMARC policy (`p=reject`) for the domain.
- The sender name is "EELSdb". The sender address comes from `EMAIL_FROM`: `info@eelsdb.eu`, so a reply to any site email reaches people. Cloudflare Email Routing receives mail for `info@eelsdb.eu` and passes it to a small Worker (`worker/info-forward/`), which forwards it to each address in its `FORWARD_TO` secret. Email Routing forwards only to addresses that have confirmed a verification email. Messages are plain text only. `sendEmail` adds one footer to every message.
- The `cloudflare` provider sends at most 3,000 emails in 30 days and 1,000 in one day, counted in `rate_events`. Workers Paid includes 3,000 emails a month, so email never costs extra, even when bots use many IPs and addresses. The daily cap stops bots from using up the month in one day. It still lets a burst through, such as the cut-over email to the kept accounts. Over the cap, `sendEmail` logs an error, sends nothing and returns `false`, and the request carries on.
- The binding calls the reply-to field `replyTo`. The REST API calls it `reply_to`.

### Contact form

- The form at `/contact/` (`worker/src/contact.tsx`) asks for a name, an email address to reply to, a topic from a fixed list and a message. When the user is signed in, the form prefills the fields.
- The Worker sends each message to every admin who counts as an admin under the two-step rule ([ADR 0019](/docs/adr/0019-two-step-and-passkeys/)). It uses the primary confirmed address of each admin. If there is no recipient, the Worker sends the message to `CONTACT_EMAIL` if it is set. Otherwise it stores the message with the status `no_recipient`.
- The Worker never emails the address that the person typed. It sends no copy to the sender, so nobody can use the form to send mail to other people.
- The subject is `[EELSdb contact] {topic label}`. It contains no user text, which prevents header injection. The Reply-To header is the typed address. The Worker lowercases it and checks that it is one address.
- The form uses Turnstile, a hidden honeypot, a rate limit and length limits. If a bot fills in the honeypot, the form shows the normal "sent" page but stores and sends nothing. The rate limit is 5 messages an hour per IP and per address.
- The Worker stores each message in `contact_messages` with its delivery status. Admins see the list at `/admin/messages/`, with search, pages of 50 and a delete button. The daily cron deletes messages older than a year. The Worker does not store the IP of the sender.
- The docs page `/docs/about/contact/` stays as a reference. It links to the form and to GitHub issues for public bug reports.

## Consequences

- All contact links point to `/contact/`.
- Admin copies of contact messages need their own footer.
- Code and docs must never contain invented contact addresses. Use the form or a configured address.
