---
title: "0018. Sign-in"
description: "Six sign-in methods all end in one function, and ORCID is the first choice."
adr:
  date: 2026-10-14
---

## Context

- Contributors' old accounts must keep working ([ADR 0011](/docs/adr/0011-migrating-accounts/)).
- EELSdb wants to identify contributors by ORCID iD, and may move to ORCID-only sign-in later. We measured this on local data. ORCID-only sign-in would lock out about 396 accounts, which is almost every migrated account. So it needs a linking campaign first.
- Not everyone has or wants ORCID, Google or GitHub.

## Decision

### Methods

The first step is any one of these methods:

- ORCID, Google or GitHub (OAuth)
- a passkey
- an email link
- an email address or username, and a password

One account can use any mix of methods.

### One completion path

Every method ends in `completeSignIn`. This function does these steps:

- It decides whether a second step is needed ([ADR 0019](/docs/adr/0019-two-step-and-passkeys/)).
- It links a pending identity ([ADR 0020](/docs/adr/0020-one-account-per-person/)).
- It refuses methods that are switched off.
- It sets the session and the "last used" hint.

No sign-in can skip `completeSignIn`.

### Sessions

The session cookie is `eelsdb_session`. The Worker stores the SHA-256 of a random token in `sessions`. A session lasts 30 days. Sensitive changes need a sign-in in the last 2 hours, measured from `sessions.created_at`. On an older session, the change sends the person to the sign-in page (`/login/?notice=again&next=…`) without signing them out. Signing in there replaces the old session and returns them to the page to make the change.

### Email links

The email link is also the sign-up path. There is no separate sign-up form.

- The page always answers "If this address can sign in, we have sent a link", so it reveals nothing.
- The Worker sends at most 5 links an hour per address and 30 an hour per IP (`rate_events`). Only sent links count towards these limits.
- The token is random. The Worker stores it as SHA-256. It is valid for 15 minutes and works once.
- The emailed link opens a page with a "Sign in" button, and the button sends a POST. Email scanners open links, so a GET must not use up the token. The POST spends the token with one `UPDATE ... RETURNING`, so two clicks cannot both sign in.
- The Worker looks for an account in this order:
  1. the account with that verified address
  2. a migrated account whose old email matches and that has no linked service
  3. if neither exists, it makes a new account
- In a browser that holds a pending identity, the link also links that identity. A new account then takes its name from the service ([ADR 0020](/docs/adr/0020-one-account-per-person/)).

### Passwords

Passwords are optional.

- `users.password_hash` holds a PBKDF2-SHA256 hash with 100,000 iterations, made with Web Crypto. 100,000 is the Workers maximum.
- Sign-in accepts a confirmed email address or the current username. When they match different accounts, the Worker prefers the confirmed address.
- Adding an email address or making one primary needs a sign-in in the last 2 hours, like passkeys ([ADR 0019](/docs/adr/0019-two-step-and-passkeys/)). A confirmed address signs in by email link and receives password links, so an unattended signed-in browser could otherwise give itself a way in. The welcome email step right after sign-up is always recent.
- Passwords from the old site are not migrated. Old accounts are reached through their old email address ([ADR 0011](/docs/adr/0011-migrating-accounts/)).
- After 10 failures in an hour, the Worker locks the login.
- A password must have 10 to 200 characters. There are no other rules. The Worker rejects a password over 200 characters without hashing it.
- There is no reset form. "Forgot your password?" sends an email link.
- To set or change a password, the person types it once in Settings. The Worker stores its hash in `password_changes` and emails a link to the primary confirmed address. The password works only once that link is opened, within 60 minutes. An account has at most one waiting password: a newer request replaces the older one, and the daily cron deletes expired ones. So a password never works without access to a confirmed address. This needs no recent sign-in and no current password, because adding an address or making one primary does need a recent sign-in: an unattended signed-in browser cannot send the link to an address of its own. An account with no confirmed address cannot set a password.
- The link opens a page with a button, like sign-in links, so an email scanner cannot use it. It needs no sign-in, so it works on another device. Using it signs out every session except the one that asked. If that browser signed in again in the meantime, its new session counts as the one that asked. Opened in the browser that asked, it returns to Settings; anywhere else it shows a page that says the new password works.
- Removing a password needs nothing more. It also cancels a waiting new password and signs out other sessions. Email-link sign-in still reaches the account.

### OAuth details

- Each provider has one callback. The state cookie `eelsdb_oauth` holds `state|next|link`.
- After the ORCID token exchange, the Worker reads the record's public addresses from `GET https://pub.orcid.org/v3.0/{iD}/email`, with a 4 s timeout. The sandbox host is `pub.sandbox.orcid.org`.
- The Worker uses the first verified address. If the request fails for any reason, the Worker uses no address and sign-in continues.
- ORCID shares only addresses that the person made public, and only verified ones. Addresses are private by default. "Trusted parties" addresses need the paid member API. So a match on an ORCID address is safe.
- Google and GitHub return verified addresses.
- ORCID can refuse a plain-http localhost callback. For local work, set `ORCID_BASE` to the sandbox.

### Sign-in page

The sign-in page is one narrow panel. From top to bottom, it shows:

1. "Continue with ORCID", the only primary button, with the text "EELSdb credits contributors by their ORCID iD."
2. Google, GitHub and passkey, as secondary buttons.
3. The email field, with passkey autofill (`autocomplete="username webauthn"`), and "Email me a sign-in link".
4. The password fold-out.

The browser keeps the "last used" method name in `localStorage`, and nothing else. The page marks that method with a tag and an accent border. The "last used" method never changes which button is primary. The brand marks are inline SVG and follow each service's rules. Google asks for a neutral button, and the ORCID iD icon stays unaltered.

### Site settings

Admins change site settings at `/admin/settings/`. The values are in the `site_settings` table, and the defaults are in `worker/src/settings.ts`.

- Each method has one switch: `signin_orcid`, `signin_google`, `signin_github`, `signin_passkey`, `signin_email_link` and `signin_password`. All are on by default.
- `methodsFrom(env, settings)` is the one rule for which methods are available. A method must be switched on. A service must also be configured.
- A switched-off method is off everywhere. The page hides it, and its routes refuse it before they do any work. Passkeys still work as a second step.
- The settings must never lock everyone out:
  - At least one method stays on.
  - The acting admin must keep a usable method that is on.
  - An admin can never switch a method off with one click. A confirmation page shows how many accounts would have no way in, and how many accounts use each method. If that count is above zero, the admin types the number.
  - Locked-out accounts are not lost. If an admin switches the method back on, or merges the account, access returns at once.
  - The Worker logs changes in `site_settings_log`.
- "Require a linked ORCID iD to submit" (`require_orcid`) is on by default. A banner asks signed-in people without a linked ORCID iD to link one. This setting does not apply when ORCID sign-in is off or not configured.

## Consequences

- `wayInSql` in `auth.ts` defines who has a way in. The guard and every count use it.
- Usernames stay first-class, because they are the author page address.
- `.env` in `worker/` holds local secrets. It is gitignored, and a committed `.env.example` lists the names. Vitest also loads `.env`. So `vitest.config.ts` pins the Turnstile, email and ORCID bindings, and `test/setup.ts` turns `require_orcid` off for older tests.
- `wrangler dev` does not pick up changes to `.env` until you restart it.

## Alternatives considered

- OAuth only. Not everyone has these services, and most migrated accounts have only an old email address.
- Accepting the old WordPress password hashes (phpass and WordPress bcrypt), and the old-site logins, and rehashing each password on first use. Few people would use them: most old accounts had not signed in for years, and the old email address reaches the same account. The hashes are weak, checking them needs a bcrypt library and a lot of CPU, and keeping them in the new database is a risk with no end date.
