# Security Design Review — US-14.4

**Story:** US-14.4 — Reset forgotten password  
**Date:** 2026-08-28  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-14.4), `plan/SECURITY_BASELINE.md` (Authentication / reset), `plan/stories/US-14.1/SECURITY.md`, `plan/stories/US-14.2/SECURITY.md`, `plan/stories/US-14.4/TASKS.md`, `plan/stories/US-14.4/SPEC-REVIEW.md` (ALIGNED), `app/auth/callback/route.ts` (Path A), `AGENTS.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: request-reset and set-password wrapped entirely behind Next.js Server Actions, recovery token exchanged on a Route Handler (never client JS), generic known/unknown responses, shared US-14.1 password policy, reset ≠ activation, global sign-out on success. No REDESIGN.

The conditions are the `[SEC]` criteria below plus the CONTRACT freeze list in **Design Concerns**. Implementers must not ship every-request guards, spend blocks, or a `getCurrentUser()` swap — those remain US-14.5. This story **does** revoke all sessions on a successful reset; it does **not** ship logout UI (US-14.3).

**Sanctioned interim state (not a finding):** Until US-14.5 lands, `getCurrentUser()` may still return the hardcoded local user (`gaveho@gmail.com` / Gabriel Vega). A leftover recovery cookie must not be treated as product identity in this story’s redirects. Direct navigation to product routes may still hit the hardcoded seam — sanctioned, not a US-14.4 defect. Recovery session ≠ route protection.

**Do not require** a new `neuramark_auth_action` value for set-password. Request windows use existing **`password_reset_request`**. No new tables. OTP expiry is Supabase Auth project config, not a `neuramark_` migration.

---

### Threat Summary

US-14.4 is the **credential-recovery boundary**. Open signup already exists, so any internet actor can probe emails and attempt inbox-driven takeover. Primary threats:

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Email / activation enumeration** | Attacker learns which addresses are registered, unconfirmed, or inactive | One generic check-email success for known and unknown; same flow for active, inactive, and unconfirmed; no app branch on `neuramark_clients.active` or confirmation status; no timing early-return; absorb “user not found” server-side |
| **Reset spam / inbox flooding** | Harassment, provider throttling | App-level 3/email/hour **and** 10/IP/hour in `neuramark_auth_attempts` (`password_reset_request`); 429 with the **same check-email copy**; **fail closed**; record every well-formed email so 429 vs 200 is not an existence oracle; Supabase Auth limits as second layer |
| **Stolen recovery token** | Account takeover | Token exchanged **server-side** on a dedicated Route Handler; never in client JS, logs, `Location`, HTML, or JSON; `Referrer-Policy: no-referrer`; single-use; expire within **1 hour** (Supabase OTP config) |
| **Path A token burn** | Recovery link hitting `GET /auth/callback` is consumed as confirmation, 302 `/login?confirmed=1`, password cannot be set | Dedicated `GET /auth/callback/recovery`; Path A **must not** `verifyOtp` for `type=recovery`; recovery `emailRedirectTo` must **not** point at `/auth/callback` |
| **Session survival after reset** | Stolen session outlives password change | Successful set-password performs **global** sign-out (refresh-token revocation) then clears cookies; user must log in with the new password |
| **Reset-as-activation** | Inactive user gains product access by recovering | Reset never writes `active` or `role`; success lands on **`/login`**, never `/dashboard` or `/pending` |
| **Weak new password** | Easy takeover after inbox click | Shared `validatePassword` (US-14.1): 12–128, no composition rules, bundled common-password denylist; server-authoritative |
| **CSRF** | Cross-origin reset request or password change | Both mutations are POST-only Server Actions with origin verification |
| **Open redirect** | Phishing via `emailRedirectTo` / `next` | Server-only `SITE_URL` origin; never `Host` / `X-Forwarded-Host`; callback ignores `next` / `redirect_to` |
| **US-14.1 High finding 1 class** | Send-failure / profile-read path that only fires when the auth user exists | Request-reset maps provider “not found” **and** send failures that only occur for existing users to the **same generic success**; `INTERNAL_ERROR` only for failures that also occur for unknown emails |

**Residual risk accepted:** Possession of the inbox is possession of the reset capability (inherent to email recovery). Until US-14.5, a recovery session cookie plus hardcoded `getCurrentUser()` can still render product pages if the user navigates there. Bounded by: this flow never **redirects** to product routes; global sign-out after success; no spend endpoints added here. Unconfirmed recovery may confirm email as a **Supabase provider side effect**; that must never set `neuramark_clients.active`.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Email (request-reset payload) | Medium — identity probe surface | Browser (untrusted) → Next.js Server Action only |
| New password (set-password payload) | High — authentication secret | Browser → set-password Server Action only; exists only in the request body and the server-side Auth update |
| Recovery `token_hash` / PKCE `code` | High — one-time capability | Email link query on the **first GET** to the recovery Route Handler; exchanged server-side immediately; never logged; never copied into `Location`, HTML, JSON, or client JS |
| Recovery session cookie | High — authorizes set-password only | Set by the **user-scoped** `@supabase/ssr` client; `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`, host-only; must not survive successful reset |
| Other sessions for the same user | High — must die on recovery | Revoked via `signOut({ scope: "global" })` (or equivalent refresh-token revocation) after password change |
| `neuramark_clients.active` / `role` | High — authorization gates | **Not read for branching** in this flow; **no app write**; post-reset landing does not consult them |
| `neuramark_auth_attempts` (`password_reset_request`) | Low — abuse telemetry | Server writes; HMAC `ip_hash` / `email_hash` only; never password, raw IP, plaintext email, or tokens |
| `SITE_URL` / redirect allowlist | Medium — open-redirect and email-link origin | Server env; recovery `emailRedirectTo` is `{origin}/auth/callback/recovery` |
| Service-role key | Critical | Privileged reads/writes to `neuramark_auth_attempts` only; `persistSession: false`; **must not** mint recovery cookies; **must not** `verifyOtp` recovery tokens (that would consume without a user session) |

**Boundaries:**

1. **Browser → request-reset mutation** — Untrusted email. Client validation is presentation only. No password on this hop.
2. **Request-reset → Supabase Auth** — Server-only `resetPasswordForEmail` (or equivalent). Always invoked on a valid, not-yet-limited request (known and unknown).
3. **Email channel → `GET /auth/callback/recovery`** — Untrusted query (`token_hash`, `type`, `code`, `error`, `error_description`, `next`). Handler exchanges or rejects; 302 to a **token-free** set-password URL.
4. **`GET /auth/callback` (Path A)** — Confirmation only. Must **not** consume recovery tokens. Frozen signup/email landings stay `/login?confirmed=1` / `/login?error=confirmation`.
5. **Browser → set-password mutation** — New password + recovery session cookie. Cookie is the capability; the client does not send the token.
6. **Set-password → Auth + global sign-out** — Update password on the recovery session, revoke all sessions, clear cookies, return the user to login.

---

## Abuse Cases Considered

- *As a malicious actor, I can tell whether `victim@example.com` is registered by comparing reset responses (sent vs not found vs inactive vs unconfirmed)* → **Blocked:** same status, body shape, and copy for known and unknown. The Supabase recovery call **runs** for every well-formed request that is not rate-limited. No app early-return on “user not found.” No branch on `active` or confirmation that the client can observe.
- *As a malicious actor, I can repeat US-14.1 High finding 1: send-failure or a profile read returns a distinct error only when the auth user exists* → **Blocked:** absorb “user not found” **and** map provider/send failures that only occur for existing users to generic check-email success (log server-side). `INTERNAL_ERROR` only for failures that also occur for unknown emails (e.g. unconfigured Supabase). Do **not** read `neuramark_clients` to decide whether to send.
- *As a malicious actor, I can flood a victim’s inbox or spray the reset endpoint* → **Bounded:** 3 `password_reset_request` per email per hour **and** 10 per IP per hour; over-limit returns **429** with the **same check-email copy**. Store errors **fail closed**. Record **every** well-formed submitted email (known or unknown) so 429 vs 200 is not an existence oracle. Supabase limits remain on.
- *As a malicious actor, I can harvest `token_hash` / `code` from client JS, the set-password URL, logs, or the `Referer` header* → **Blocked:** dedicated Route Handler exchanges server-side; 302 Location is token-free; never log the URL/query; set-password page and callback 302 send `Referrer-Policy: no-referrer`; Client Components must not read `token_hash`, `code`, or `type`.
- *As a malicious actor, I can reuse a recovery link after the victim (or I) already set a password, or after 1 hour* → **Blocked:** tokens are single-use and expire within 1 hour (Supabase OTP config). Used or expired tokens cannot set a password. Password change invalidates outstanding recovery tokens (provider behavior; CONTRACT documents the config).
- *As a malicious actor, I can click a recovery link that hits Path A (`/auth/callback`), burn the token as confirmation, and strand the victim — or land as `confirmed=1`* → **Blocked:** recovery `emailRedirectTo` points at **`/auth/callback/recovery`**, not `/auth/callback`. Path A **removes `recovery` from the `verifyOtp` allowlist**. If `type=recovery` still arrives at Path A, Path A **must not** call `verifyOtp` / `exchangeCodeForSession`; it 302s to `/auth/callback/recovery` with the same query (relative Location, `Referrer-Policy: no-referrer`). Signup/email Path A landings stay frozen.
- *As a malicious actor, I can keep a stolen session after the owner resets their password* → **Blocked:** successful set-password performs **global** sign-out then clears cookies. The user must authenticate with the new password via US-14.2 `logIn`.
- *As a malicious actor, I can activate my account or escalate `role` by resetting* → **Blocked:** this story never `UPDATE`s `neuramark_clients.active` or `role` (and does not INSERT/DELETE client rows). Forbidden keys rejected or stripped. Success lands on `/login`, not dashboard/pending.
- *As a malicious actor, I can CSRF a victim into requesting resets or changing a password they just recovered* → **Blocked:** both mutations are Server Actions with origin verification (same as `signUp` / `logIn`). GET cannot change a password. The recovery callback is GET (email link); the `token_hash`/`code` is the capability — it only exchanges and 302s.
- *As a malicious actor, I can pass `next=https://evil.example` on the callback or build `emailRedirectTo` from `Host`* → **Blocked:** `SITE_URL` (allowlisted) is the only origin for recovery links. Callback `next` / `redirect_to` are **ignored**. 302 targets are frozen app-relative paths.
- *As a malicious actor, I can send `role` / `active` / `auth_user_id` / `client_id` / `confirmPassword` on either mutation* → **Blocked:** forbidden keys rejected or stripped before processing. `confirmPassword` stays off the wire (client match is UX only).
- *As a malicious actor, I can use the service-role client to `verifyOtp` a recovery token without minting a user session, then call set-password another way* → **Blocked:** recovery exchange uses the **user-scoped** cookie client. Service-role stays `persistSession: false` and is not the recovery `verifyOtp` client. Set-password authorizes from the recovery session cookie, not a request-supplied user id.
- *As a malicious actor, I can learn the new password from logs, error pages, or analytics* → **Blocked:** reuse `redactAuthPayload`; never echo the password; never store it in `neuramark_*`.
- *As a malicious actor, I can 302 from this flow to `/dashboard` while `active = false` (or while `getCurrentUser()` is still hardcoded)* → **Blocked:** this flow never 302s to `/dashboard`, `/pending`, or other product routes. Post-reset landing is `/login`. US-14.2 then chooses dashboard vs pending after password login.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-14.4 are binding. Items marked **(added)** are new in this review — paste them into the story. Do not drop or weaken any existing `[SEC]` line.

- [ ] **[SEC] Known and unknown emails get the same status code, body, and copy from the request endpoint;** the Supabase recovery call's "user not found" outcome is absorbed server-side, and app code adds no timing branch that distinguishes the two
- [ ] **[SEC] Reset requests are rate-limited:** max 3 requests per email per hour and max 10 per IP per hour, tracked in `neuramark_auth_attempts`; over-limit requests still return the generic "check your email" response (with 429)
- [ ] **[SEC] Recovery tokens are single-use and expire within 1 hour** (Supabase Auth OTP expiry configured accordingly); a used or expired token cannot set a password, and any outstanding recovery token is invalidated when the password changes by any means
- [ ] **[SEC] The emailed link lands on a Next.js Route Handler that exchanges the recovery code for a session server-side;** the token never reaches client-side JavaScript, is never logged, and the set-password page sends `Referrer-Policy: no-referrer` so the URL cannot leak via referrer
- [ ] **[SEC] A successful password reset revokes all other active sessions for that user** (global sign-out), so a stolen session does not survive recovery
- [ ] **[SEC] The set-password endpoint enforces the shared password policy module (US-14.1), is CSRF-protected, and never logs the new password**
- [ ] **[SEC] Password reset works identically for active, inactive, and unconfirmed accounts** — same generic responses, same flow (preserving enumeration resistance); a successful reset never changes `neuramark_clients.active`, and the account remains gated on activation after the reset (recovering a password grants credential access only, never product access)
- [ ] **[SEC] (added) Rate-limit store errors fail closed:** if `recordAuthAttempt` / count queries throw or return an error, treat the request as over-limit and return **429** with the **same generic check-email copy** — do not fail open (US-14.1 QA Medium #2 class). Record **every** well-formed submitted email (known or unknown) so 429 vs 200 is not an existence oracle
- [ ] **[SEC] (added) Request-reset is CSRF-protected** the same way as set-password: Server Action with origin verification (or Route Handler rejecting mismatched `Origin`). No GET can trigger a recovery email
- [ ] **[SEC] (added) Request-reset must not become an existence oracle via send/profile failure** (US-14.1 High finding 1 class): do not return a client-visible error that only happens when the auth user exists (`INTERNAL_ERROR`, “email failed to send”, distinct copy). Absorb “user not found.” Map provider/send failures that only occur for existing users to generic check-email success (log server-side). Do **not** read `neuramark_clients` (or confirmation status) to decide whether to send. `INTERNAL_ERROR` only for failures that also occur for unknown emails (e.g. unconfigured Supabase)
- [ ] **[SEC] (added) Recovery `emailRedirectTo` uses server-only `SITE_URL` as the allowlisted public origin** pointing at the dedicated recovery callback — never `Host` / `X-Forwarded-Host`. If origin cannot be resolved safely, omit `emailRedirectTo` rather than copying the request host. Document the recovery callback URL on the Supabase Auth redirect allowlist (`.env.example`)
- [ ] **[SEC] (added) Dedicated recovery callback; Path A must not consume recovery tokens:** primary exchange is `GET /auth/callback/recovery` (not Path A). Recovery `emailRedirectTo` must **not** be `/auth/callback`. Path A **must not** call `verifyOtp` / `exchangeCodeForSession` for `type=recovery` (remove `recovery` from Path A’s OTP allowlist). If `type=recovery` still hits Path A, 302 to `/auth/callback/recovery` with the same query **without consuming the token**; never 302 `/login?confirmed=1` for recovery. Signup/email Path A landings stay frozen
- [ ] **[SEC] (added) `token_hash`, `code`, access_token, and refresh_token never appear in the 302 `Location`, HTML, JSON, or client JS;** they are never logged (redact if a URL is logged). Recovery callback 302 sends `Referrer-Policy: no-referrer`. Invalid, expired, missing, or already-used tokens — and provider `error` / `error_description` — share **one** generic recovery-failure (retry to `/reset-password`); do not echo provider error text. Expire any `sb-*` cookies on exchange failure
- [ ] **[SEC] (added) Recovery session is set-password only:** cookie flags match login (`HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, host-only). Minted with the user-scoped `@supabase/ssr` client — **not** the service-role client. This flow never 302s to `/dashboard`, `/pending`, or other product routes. After successful set-password: `signOut({ scope: "global" })` (or equivalent) **then** clear cookies; land on **`/login`** (not dashboard/pending). Cookie carries identity only — do not bake `active` / `role` / `client_id` into it
- [ ] **[SEC] (added) Request-reset and set-password contracts forbid `role`, `active`, `auth_user_id`, and `client_id`:** any payload containing those keys is rejected or stripped before processing. Set-password forbids `confirmPassword` / `confirm_password` on the wire (same as signup). Success/error payloads never include tokens, `role`, `active`, `client_id`, or `auth_user_id`
- [ ] **[SEC] (added) Unconfirmed recovery must not write activation:** if Supabase confirms email as a provider side effect of recovery/`verifyOtp`/`updateUser`, document that as provider behavior — **do not** invent an app-side confirm write and **never** set `neuramark_clients.active` or `role`. Observable reset responses stay identical for unconfirmed vs confirmed

---

## Design Concerns and Required Changes

### CONTRACT.md must freeze (non-negotiable)

When `plan/stories/US-14.4/CONTRACT.md` is authored, lock these before implementation. Security will spot-check the contract against this list.

1. **Surfaces** — Two Server Actions (request-reset + set-password) and **one** recovery Route Handler. No `@supabase/supabase-js` / tokens / keys in the browser. No second undocumented reset path.
2. **Dedicated recovery callback (pick this, not Path A branching as primary)**  
   - **Path:** `GET /auth/callback/recovery`  
   - **`emailRedirectTo`:** `{SITE_URL origin}/auth/callback/recovery`  
   - **Exchange (preferred):** `token_hash` + `type=recovery` via `verifyOtp` on the **user-scoped** cookie client (mints the set-password session; does not require a PKCE verifier cookie).  
   - **Also accept:** PKCE `code` via `exchangeCodeForSession` on the same user-scoped client when `token_hash` is absent (Supabase may send either).  
   - **Success 302:** token-free set-password page (CONTRACT picks the exact path, e.g. `/reset-password/new`).  
   - **Failure 302:** same set-password route with a generic invalid/expired state, plus retry to `/reset-password`. One failure for missing, expired, used, and provider `error` / `error_description`. Expire `sb-*` on failure.  
   - **Ignore** `next` / `redirect_to`. Relative `Location` only. `Referrer-Policy: no-referrer` on every 302.
3. **Path A defense (this story may change `app/auth/callback/route.ts` only for this)**  
   - Remove `"recovery"` from Path A’s `verifyOtp` type allowlist.  
   - If `type=recovery` (with or without `token_hash`): **do not** `verifyOtp` or `exchangeCodeForSession`; 302 to `/auth/callback/recovery` preserving the query (relative Location, no-referrer).  
   - PKCE `code` **without** `type=recovery` on `/auth/callback` remains confirmation Path A (cannot distinguish recovery PKCE). Therefore recovery emails **must not** use `/auth/callback` as `emailRedirectTo`.  
   - Signup/email landings stay `/login?confirmed=1` and `/login?error=confirmation`. Do not share those with reset.
4. **Post-success landing** — After set-password: global sign-out, clear cookies, **land on `/login`**. Do **not** send the user to `/dashboard` or `/pending` from this story. Optional `?reset=1` banner on login is allowed (no email, no tokens) — CONTRACT’s choice. US-14.2 `logIn` then chooses dashboard vs pending.
5. **OTP config (ops, not a migration)** — Supabase Auth email OTP / recovery token expiry **≤ 1 hour**; tokens **single-use**. Document in CONTRACT and `.env.example` / ops notes. Password change must invalidate outstanding recovery tokens (provider behavior). Used or expired token cannot set a password.
6. **Generic request-reset success** — Known and unknown share **one** success code, HTTP/logical status, body shape, and `messageKey` (check-email). Suggested: `{ ok: true }` with FE always showing check-email. Do **not** expose `USER_NOT_FOUND`. Validation (malformed email) and `FORBIDDEN_FIELDS` may differ — they do not reveal existence. **`RATE_LIMITED` is 429 with the same user-facing check-email copy** (not a distinct “too many attempts for this account”). `INTERNAL_ERROR` must not fire solely on “user exists, send failed.”
7. **Rate-limit fail-closed** — Document: 3 `password_reset_request` per `email_hash` per hour **and** 10 per `ip_hash` per hour; 429 generic check-email; store errors → limited; record every well-formed email. Reuse `lib/auth/rate-limit.ts` (mirror `isResendConfirmationRateLimited`). No new table, no new enum, no Upstash. Set-password is **not** a second attempt counter (token-gated).
8. **Cookie flags and clients** — Recovery exchange: `@supabase/ssr` user-scoped client + server-only anon/publishable key; flags match login. Service-role remains `persistSession: false` and is **not** the recovery `verifyOtp` / cookie adapter. Response bodies contain zero tokens. After success: `signOut({ scope: "global" })` then expire cookies with the same name/path/host attributes used to set them.
9. **Password policy** — Reuse `lib/auth/password-policy.ts` `validatePassword`. Do not fork. `confirmPassword` off the wire. CSRF on both actions. Passwords never logged (`redactAuthPayload`).
10. **Forbidden keys** — `role`, `active`, `auth_user_id` / `authUserId`, `client_id` / `clientId` on both actions; plus `confirmPassword` / `confirm_password` on set-password. Reject or strip before processing.
11. **Unconfirmed** — Freeze: no app-side confirm write; never UPDATE `active`/`role`. Provider auto-confirm via recovery is allowed if documented. Observable flow stays identical.
12. **Out of scope (copy into CONTRACT)** — US-14.5 `getCurrentUser()` swap, every-request `active`/spend/RLS/middleware allowlist; US-14.3 logout UI (global sign-out **is** in scope); RBAC or activation UI; app writes to `active` / `role`; Path A landing changes for `type=signup` / `type=email`; Instagram / spend / generation paths.

### Required implementation constraints

1. **Do not repeat US-14.1 High finding 1.** After “this email might exist,” any *different client-visible outcome* is an oracle. Map: well-formed + not limited → generic check-email (including unknown user and send-failure-for-existing). Limited → 429 + same copy. Malformed → validation. Forbidden keys → 400. Never “profile missing,” never `active` in the payload.
2. **Processing order (request-reset):** forbidden keys → Zod parse → record `password_reset_request` (fail closed) → rate-limit check (fail closed) → `resetPasswordForEmail` **always** on valid not-limited shape (including unknown emails) → generic success. Absorb Auth “not found.” Do not skip the Supabase call for “user not found.” Do not lookup `neuramark_clients` first.
3. **Processing order (set-password):** forbidden keys → Zod parse → `validatePassword` → require recovery session from cookie (`getUser()` / equivalent on user-scoped client; no request `userId`) → update password → global sign-out → expire cookies → `{ ok: true }` (FE → `/login`). Missing/invalid session → same generic expired-token error as callback failure (retry to request a new link). Password-policy failure may be distinct — the attacker already holds the recovery session.
4. **User-scoped vs service-role.** Recovery `verifyOtp` / `exchangeCodeForSession` / `updateUser` / `signOut(global)`: cookie client. `neuramark_auth_attempts`: existing service-role helper. Never put the service-role key in a cookie client. Never `verifyOtp` recovery on service-role (consumes token, mints no session).
5. **Callback is GET** (email link). CSRF origin checks do not apply the same way; the token is the capability. Limit the handler to: exchange or reject, set recovery cookies on success, 302. No other mutations. No product landing.
6. **Fixation:** on successful exchange, issue a **fresh** cookie value; discard any pre-existing `sb-*` identifier. After success, those cookies must not remain.
7. **Reuse** `lib/auth/password-policy.ts`, `rate-limit.ts`, `forbidden-fields.ts`, `errors.ts` (`redactAuthPayload`), `get-client-ip.ts`, `hash.ts`, `supabase-cookie.ts`. Add `isPasswordResetRateLimited` (or equivalent). Do not add Upstash or a new table.
8. **FE:** generic EN/ES check-email only; expired-token error + retry to `/reset-password`; clear password fields after submit; do not read `token_hash` / `code` / `type` in Client Components; set-password page metadata `Referrer-Policy: no-referrer`; no Supabase in the bundle.
9. **Dependencies:** no new auth packages. `@supabase/ssr` already present from US-14.2. No lookalike password-policy libraries — reuse the existing module.
10. **Terminology:** do not use “admin” / administrador / staff in CONTRACT, this file’s product-facing examples, or EN/ES copy. Operator SQL only for `active` / `role`.

---

## Future-Proofing Notes

- **US-14.5 cookie shape:** Recovery cookies must be the same `@supabase/ssr` format login already mints, so `getCurrentUser()` can validate them later. They must **not** grant product access in *this* story’s redirects; US-14.5 will enforce `active` on every request. Do not invent a parallel `neuramark_reset` JWT.
- **Identity seam:** This story must not introduce a second product identity API. Product pages keep using `getCurrentUser()` (hardcoded until US-14.5).
- **`active` freshness:** Do not cache `active` in the recovery cookie. Reset never writes it. After the user logs in with the new password, US-14.2 landing + US-14.5 guards apply.
- **Logout:** Cookie names, `Path`, and host-only attributes must match so US-14.3 can clear every variant. Global sign-out here is the security control; US-14.3 is the user-visible logout control.
- **RLS:** Stay deny-by-default with zero new policies. Attempts writes use service-role. Do not add authenticated RLS policies here.
- **Dev fallback:** Do not add `AUTH_DEV_FALLBACK` or header/query identity in this story.
- **Multi-tenancy:** One auth user → one `neuramark_clients` row. Reset does not create, merge, or retarget client rows.
- **Back-door sweep hooks after implementation:** no `@supabase` / `NEXT_PUBLIC_SUPABASE` / tokens in `.next/static`; no reset Route Handler besides `/auth/callback/recovery`; Path A allowlist no longer includes `recovery` as a consumed type; grep logs for `password` / `token_hash=` / `code=` / `refresh_token`; confirm `role`/`active` absent from reset Zod schemas; confirm this flow never 302s to `/dashboard` or `/pending`; confirm no `UPDATE` of `neuramark_clients.active` / `role`.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-14.4/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Request-reset schema: `email` only; set-password schema: `password` only (`confirmPassword` off the wire)
- [ ] Both schemas forbid or omit: `role`, `active`, `auth_user_id`, `client_id`
- [ ] Known/unknown request-reset: one status/shape/copy; recovery call always runs when not limited; send-failure-for-existing ≠ distinct client error
- [ ] Rate-limit: 3/email/hour **and** 10/IP/hour; `password_reset_request`; 429 with **check-email copy**; fail closed; record every well-formed email; no new enum
- [ ] Dedicated `GET /auth/callback/recovery`; `emailRedirectTo` not `/auth/callback`; Path A does not consume `type=recovery`
- [ ] Token / `code` / `token_hash` never in `Location`, HTML, JSON, logs, or client JS; `Referrer-Policy: no-referrer` on callback 302 and set-password page
- [ ] Recovery session: user-scoped cookie client; login cookie flags; set-password only; no product 302
- [ ] Success: global sign-out + clear cookies + land on `/login` (not dashboard/pending)
- [ ] OTP ≤ 1 hour + single-use documented as Supabase Auth config
- [ ] Shared `validatePassword`; CSRF on both actions; passwords redacted
- [ ] Unconfirmed: no app-side confirm/`active` write
- [ ] Out of scope: US-14.5 guards/spend/`getCurrentUser()` swap, US-14.3 logout UI, Path A signup/email landing changes
