# Security Baseline — Neuralitica V1 Backlog

> **Scope:** design-time review of every story in `plan/USER_STORIES.md` (US-1.x through US-13.x, US-X.1–X.3), cross-checked against the hard rules in `plan/MODULES_ROADMAP_v1.1.html`.
> **Date:** 2026-07-02 · **Reviewer:** security-architect
> **Status of criteria:** every `[SEC]` checkbox added to `USER_STORIES.md` is binding for the implementing agents and is validated by the requirements-validator like any other acceptance criterion.

Sanctioned exceptions per `AGENTS.md` (NOT findings): the hardcoded local user `gaveho@gmail.com` / Gabriel Vega served by `getCurrentUser()` — sanctioned **only until US-14.5 lands**; see the Authentication section for the posture change. Stack: Next.js (FE + BE), Supabase (Postgres), Vercel. All database objects (tables, triggers, indexes, functions, enums, policies) carry the `neuramark_` prefix. All designs below are constrained so real auth (Supabase Auth), Row Level Security, and multi-tenancy can be introduced later without rewrite.

---

## Verdict summary per module

| Module | Stories | Verdict |
|---|---|---|
| Interview Builder | US-1.1–1.3 | APPROVE WITH CONDITIONS ([SEC] criteria added) |
| Business Profile | US-2.1–2.3 | APPROVE WITH CONDITIONS |
| Avatar / Visual Mode | US-3.1–3.4 | APPROVE WITH CONDITIONS — highest legal sensitivity |
| Content Strategy Agent | US-4.1–4.2 | APPROVE WITH CONDITIONS |
| Video Script Agent | US-5.1–5.2 | APPROVE WITH CONDITIONS |
| Caption Agent | US-6.1–6.2 | APPROVE WITH CONDITIONS |
| Cost Policy Engine | US-7.1–7.4 | APPROVE WITH CONDITIONS — spend authority must be server-side |
| Video Provider Adapter | US-8.1–8.7 | APPROVE WITH CONDITIONS — biggest external trust boundary; V1 default SadTalker/Wan (low tier), HeyGen P1 fallback |
| Media Assembly Pipeline | US-9.1–9.3 | APPROVE WITH CONDITIONS — command-injection surface |
| QA/Compliance + Overrides | US-10.1–10.2 | APPROVE WITH CONDITIONS — non-overridable legal blocks |
| Approval Flow | US-11.1–11.3 | APPROVE WITH CONDITIONS — gate must hold against direct calls |
| Calendar / Metrics (P1) | US-12.x, US-13.x | APPROVE WITH CONDITIONS |
| Cross-cutting | US-X.1–X.4 | APPROVE WITH CONDITIONS — X.3 is the auth seam; X.4 is provider catalog |
| Authentication | US-14.1–14.5 | APPROVE WITH CONDITIONS — highest-stakes module; see dedicated section below |

**No REDESIGN verdicts.** The backlog's shapes are sound; every risk found was addressable with acceptance criteria rather than a structural change. Two designs came close and carry explicit conditions:

1. **US-8.2/8.4 webhook/polling** — storing raw provider `output_url` long-term and accepting unauthenticated status callbacks would have been a REDESIGN; the added criteria (download-and-own assets, signature-verified webhooks, server-only status writes) keep the current story shape viable. US-8.2 is SadTalker (low tier), not HeyGen.
2. **US-3.3 media storage** — serving uploads from `public/` would be irreversible-ish once URLs spread; the criteria mandate storage outside the web root behind an ownership-checked route from day one.

---

## Assets and trust boundaries

| Asset | Sensitivity | Where untrusted input enters |
|---|---|---|
| Likeness media + consents (US-3.2/3.3) | Highest — legal/biometric-adjacent | File uploads, consent actions |
| Provider API keys (Replicate, SiliconFlow, HeyGen, TTS, LLM) | High — direct financial abuse | Never; must stay server-env only |
| Budget/cost records (US-7.x) | High — margin integrity | Settings form, retry actions |
| Interview/profile free text | Medium — feeds every LLM prompt | Interview forms, profile edits, change requests |
| Provider responses (status, URLs, errors) | Untrusted external input | Webhooks/polling responses |
| Approval/QA state | High — publish gate | Any status-mutating endpoint |

Trust boundaries: browser → server (everything client-side is presentation only); server → AI providers (outbound keys, inbound untrusted responses); server → FFmpeg (text becomes command input); server → LLM (client-authored text becomes prompt data).

---

## Abuse cases considered

- *As a malicious actor, I can…* call the generation endpoint directly to skip the budget check → blocked: estimate and policy resolved server-side inside job creation (US-7.1/8.2).
- …select own-avatar or submit a video job after revoking consent → blocked: consent re-checked live at job creation, append-only ledger (US-3.1/3.2/8.2).
- …upload `../../evil.sh` or an HTML/SVG file disguised as an image → blocked: magic-byte MIME allowlist, server-generated storage keys, storage outside web root (US-3.3/8.3/9.2).
- …POST a forged provider webhook to mark a job `completed` with an attacker URL → blocked: signature/secret verification, job matching, server-side-only status writes (US-8.2/8.4).
- …approve a Reel that never passed QA by hitting the decision endpoint directly → blocked: gate re-checked at decision time, server state machine (US-11.1/11.3).
- …override the consent or impersonation QA block → blocked: `blocking` check class rejected in the override handler with 403 (US-10.2, US-3.4).
- …put "ignore previous instructions" in interview answers to steer the strategy/script agents → contained: delimited data in prompts, schema-validated agent output, no free text in metrics prompt (US-4.1/5.1/11.2/13.2).
- …enumerate IDs to read another client's Reels, jobs, or assets → blocked now and post-multi-tenancy: all lookups scoped through `getCurrentUser()`, foreign IDs return 404 (backlog-wide IDOR criteria).
- …spam "generate" to burn LLM/video spend → blocked: server-side rate limiting, retry caps, cumulative budget (US-4.1/7.1/8.4).
- …inject FFmpeg options via subtitle text or filenames → blocked: argument arrays, sanitized text, validated asset paths (US-9.1/9.2).

---

## Design concerns and required changes (binding)

1. **Single identity seam (US-X.3).** `getCurrentUser()` is the only identity resolver; every table carries `client_id`; every query filters by the server-resolved client. No endpoint accepts `client_id` from the request. This is the one-function auth swap later.
2. **Consent as an immutable ledger (US-3.2).** Append-only rows, versioned disclosure text, live re-check at job creation, revocation cancels queued jobs. Enforcement reads the ledger, never a cached flag.
3. **Shared upload validation stack (US-3.3, 8.3, 9.2).** One server-side module: size limit → magic-byte MIME allowlist → server-generated key → storage outside web root → ownership-checked serving route. All three upload surfaces must use it.
4. **Provider boundary hygiene (US-8.x).** Keys in server env only; provider responses treated as untrusted; assets downloaded and owned locally (provider URLs expire); webhooks authenticated; `external_job_id` opaque.
5. **Server-side state machines.** Interview status, strategy approval, job status, QA verdicts, approval decisions, publish status — all transitions validated in handlers. UI disabling is never the control.
6. **Spend authority is server-side (US-7.x).** Budget cap, cumulative cost, provider selection, and actual-cost recording all live in server code; the client sends intent, never numbers the server trusts.
7. **Non-overridable legal class (US-10.x).** Missing/revoked consent and generic-avatar impersonation are `blocking` checks defined in code/config; the override endpoint rejects them for everyone.
8. **Prompt-injection containment (US-4/5/6/11.2).** Client-authored text enters prompts as delimited data; agent output is schema-validated before persistence; rule flags are injected server-side.
9. **FFmpeg invocation (US-9.x).** Argument arrays only; no shell interpolation; only system-owned validated assets as inputs; no URL fetching at assembly time.

## Dependency guidance

New packages expected by this backlog: a schema validator (Zod — sanctioned, mainstream), an FFmpeg wrapper or direct `spawn` (prefer direct `spawn` with arg arrays over thin wrapper packages), file-type detection (`file-type` — mainstream) and official/first-party or aggregator SDKs for Replicate, SiliconFlow, HeyGen, and TTS vendors where they exist. Provider integration must go through `lib/providers/` adapters — no direct vendor calls from route handlers. See `plan/PROVIDER_TIERS.html`.

---

## Authentication (US-14.1–14.5)

**Verdict: APPROVE WITH CONDITIONS** for all five stories. The module's shape is correct — Supabase Auth wrapped entirely behind Next.js endpoints, httpOnly-cookie sessions, no auth SDKs or tokens in the browser, identity flowing exclusively through the `getCurrentUser()` seam (US-X.3) so the swap changes zero call sites. The `[SEC]` criteria added to `USER_STORIES.md` (45 total across the five stories, plus role-driven criteria on US-7.4 and US-12.1) are the conditions. No REDESIGN.

**Access model (user decision, re-reviewed 2026-07-02):** signup is OPEN — signup → Supabase email confirmation → `neuramark_clients` row created with `active = false` → operator activates manually via SQL. Confirmed-but-inactive users can authenticate but reach only a neutral "pending activation" screen; `active` is enforced server-side in `getCurrentUser()`/route guards on every request. This replaces the earlier invite-only recommendation; the compensating controls below make the open model acceptable.

**Role flag (user decision, re-reviewed 2026-07-02):** `neuramark_clients.role` (`client` | `operator`, `NOT NULL DEFAULT 'client'`, DB-level enum/CHECK), SQL-only writes — same trust model as `active`. This is **server-resolved authorization, not authentication**: the role is a property of the `neuramark_clients` row read fresh per request inside `getCurrentUser()`; it never appears in any request contract, cookie, or JWT claim, and the session token carries identity only. Operator-only stories (US-4.1, 4.2, 7.1, 7.3, 7.4, 8.3, 8.4, 10.2, 12.1, 12.2, 13.1) gate with `role === 'operator'` inside the handler itself; middleware and UI hiding are convenience. `role` and `active` compose as AND — an inactive operator has no access. No RBAC, no permission tables, no role UI; this is deliberately the smallest possible authorization model, and anything richer is a future story, not an extension of this flag.

### Trust boundaries (new/changed)

| Boundary | Notes |
|---|---|
| Browser → auth endpoints | Credentials, reset requests, and redirect parameters are the only places raw secrets cross from untrusted space; passwords must never persist anywhere app-side (logs, tables, telemetry) |
| Email channel → set-password page | Recovery tokens travel by email and re-enter through the reset link; exchanged for a session server-side via a Route Handler, never touching client JS, with `Referrer-Policy: no-referrer` on the set-password page |
| Session cookie ↔ server | The httpOnly cookie is the sole session bearer: `HttpOnly` + `Secure` + `SameSite=Lax`, rotated on login, revoked in Supabase (not just cleared) on logout and password change |
| Middleware vs handlers | Middleware is routing convenience; the enforced boundary is every handler re-resolving identity via `getCurrentUser()`. Deny-by-default public allowlist |
| `neuramark_clients.active` (activation gate) | Server-side only: read fresh per request in `getCurrentUser()`, no cross-request caching, no cookie/JWT claim, no write path except operator SQL; activation state disclosed only to the authenticated account owner |
| `neuramark_clients.role` (authorization flag) | Server-resolved authorization, not authentication: fresh per-request read, never in a request/cookie/JWT, DB-constrained to `client`\|`operator`, SQL-only writes; demotion effective next request; evaluated after `active` (inactive operator = no access) |

### Abuse cases considered

- *As a malicious actor, I can…* enumerate registered emails via signup, login, or reset responses → blocked: identical status/body/copy for existing vs unknown emails on all three endpoints, no app-added timing branches (US-14.1/14.2/14.4).
- …brute-force passwords or spam signups/resets → blocked: `neuramark_auth_attempts` app-level limits (5 failed logins per email+IP per 15 min; 5 signups per IP per hour; 3 resets per email per hour) layered on Supabase Auth's built-in limits (US-14.1/14.2/14.4).
- …fix a victim's session by planting a cookie pre-login → blocked: fresh cookie always issued on login/signup (US-14.1/14.2).
- …replay a stolen cookie after logout or password reset → blocked: server-side Supabase revocation on logout and global sign-out on reset (US-14.3/14.4).
- …CSRF a login/logout/reset mutation → blocked: POST-only Server Actions / Route Handlers with origin verification on every auth mutation (US-14.1–14.4).
- …abuse the post-login `next` parameter as an open redirect for phishing → blocked: same-origin relative-path validation with `/dashboard` fallback (US-14.2).
- …reach protected data by calling a Route Handler directly, skipping the middleware → blocked: every handler independently resolves identity; middleware is not the boundary (US-14.5).
- …re-enable the hardcoded user in production via the dev fallback flag → blocked: requires `NODE_ENV=development` AND explicit env var; production startup throws if the var is set, with a test asserting inertness (US-14.5).
- …harvest a recovery token from logs or the `Referer` header → blocked: server-side code exchange, no-referrer policy, token never logged (US-14.4).
- …mass-register accounts through the open signup to spam or burn resources → bounded: per-IP hourly and daily signup caps in `neuramark_auth_attempts`, Supabase built-in limits, and `active = false` accounts can reach no spend-bearing endpoint (US-14.1/14.5).
- …use the pending-activation state as an enumeration oracle → blocked: activation state is revealed only after successful authentication; all unauthenticated responses (login failure, signup, reset) stay generic regardless of `active` (US-14.2).
- …keep product access after an operator deactivates me by holding a live session → blocked: `active` is read fresh per request inside `getCurrentUser()`, never cached across requests or baked into a cookie/JWT; deactivation bites on the next request (US-14.5).
- …flip my own `active` flag via some endpoint or payload → blocked: `active` has no write path except operator SQL; no endpoint, Server Action, or request field can modify it (US-14.5).
- …call product Route Handlers directly from an inactive session, skipping the pending-screen redirect → blocked: the `active` check lives in `getCurrentUser()`/handler guards, not just page routing; direct calls get 403 (US-14.5).
- …activate my account by resetting my password → blocked: reset changes credentials only; `active` is untouched and access remains gated (US-14.4).
- …escalate to operator by sending `role: 'operator'` in a signup/profile payload, a header, or a tampered cookie → blocked: `role` appears in no request contract and is stripped/rejected if present; the only source is the server-side `neuramark_clients` read, and the DB constraint makes invalid values impossible (US-14.1/14.5).
- …hit an operator endpoint directly from a client-role session, relying on the UI merely hiding the button → blocked: the `role === 'operator'` check lives inside each Server Action / Route Handler (shared `requireOperator()` helper), returning 403 before any side effect (US-14.5 + per-story gates).
- …keep operator powers after being demoted via SQL by holding a live session → blocked: role is read fresh per request with the same one-request staleness bound as `active` (US-14.5).
- …read margin-sensitive cost data from a client session via a shared payload → blocked: cost fields exist only in operator-gated serializers; shared responses (Reel detail, dashboard, approval package) carry no cost fields by contract (US-7.4).

### Posture change: end of the "no real auth" exception

The prior baseline treated "no real auth, hardcoded local user" as a sanctioned exception. That posture is now **time-boxed**:

1. **Until US-14.5 is implemented** — hardcoded `getCurrentUser()` remains sanctioned. Interim rules unchanged: no header/query-param identity, `client_id` on every table, all lookups scoped through the seam.
2. **Once US-14.5 lands** — any remaining hardcoded-user path in the default build, any endpoint reachable without a session outside the public allowlist, or any identity source other than the session-backed `getCurrentUser()` is a **finding**, not an exception. Future back-door sweeps must verify the dev fallback flag is inert in production builds — and, for the role model: (a) no code path writes `neuramark_clients.role` or `active` (grep migrations, Server Actions, Route Handlers, seed scripts for UPDATE/upsert on those columns — the only sanctioned writes are the US-14.5 seed's initial values and operator SQL outside the app); (b) no request schema, serializer input, or env flag accepts or maps a `role` value; (c) every endpoint whose story carries the operator-only criterion actually calls the role check inside the handler, not only in middleware.
3. **Auth-specific dependency note** — no new auth packages expected beyond `@supabase/supabase-js` (server-only) and optionally `@supabase/ssr` for cookie handling; both first-party. A dedicated rate-limiter package (Upstash) is NOT required for V1 — the `neuramark_auth_attempts` table satisfies the criteria on Vercel serverless without a new dependency.

### Recommendations on the product-owner's open questions

- **(a) Auto-login after signup vs redirect-to-login:** resolved by the accepted model — Supabase email confirmation is ON; signup lands on "check your email" (which doubles as the enumeration-safe duplicate-email response), and post-confirmation the user reaches the pending-activation screen until an operator activates them.
- **(b) Password policy:** minimum 12 characters, maximum 128, all characters allowed, **no composition rules** (NIST 800-63B style), reject known-common passwords via a bundled top-1,000 list. One shared server-side policy module used by signup and reset.
- **(c) Open vs invite-only signup:** the user chose **open signup with manual SQL activation** over the invite-only recommendation. Accepted, with the compensating controls now bound as `[SEC]` criteria: tightened signup rate limits (5/IP/hour + 15/IP/day), email confirmation before any pending state, `active = false` by default with no spend-bearing endpoint reachable while inactive, per-request `active` enforcement with no cross-request caching, no client-side write path to `active`, activation state disclosed only post-authentication, and password reset that never alters activation.
- **(d) Password reset for inactive accounts (PO open question):** **allow it.** Reset must behave identically for active, inactive, and unconfirmed accounts — same generic responses and flow — because branching on `active` would turn the reset endpoint into an activation-state oracle and re-open enumeration. A successful reset grants credential access only; the account stays gated on `active`. This is now a `[SEC]` criterion on US-14.4.
- **(e) US-12.1 weekly calendar visibility (PO open question):** **operator-gated in V1.** The calendar as specified aggregates production status across clients, which makes it an operator surface; a client seeing their own calendar is a legitimate future feature but must be a separate client-scoped endpoint, never the operator aggregate filtered in the UI or an operator endpoint with a `client_id` parameter. Encoded as an operator-only criterion plus a future-view `[SEC]` criterion on US-12.1.
- **(f) Cost visibility for clients (PO open question):** **never in V1.** Cost data (`estimated_cost_cents`, `actual_cost_cents`, provider pricing, budget caps) is margin-sensitive: exposing unit costs to clients hands them the negotiation sheet and leaks provider strategy. Enforced at the response-shape level, not UI hiding — shared payloads a client session can receive contain no cost fields; cost appears only in operator-gated serializers (new `[SEC]` criterion on US-7.4, existing operator gates on US-7.1/7.3/7.4). If pricing transparency is ever wanted, it should be a deliberate "price to client" field, not the raw cost data.

### Residual risk accepted (open signup)

Open signup means strangers can create Supabase auth users and inactive `neuramark_clients` rows at will, within rate limits. What bounds it: inactive accounts can trigger **zero paid work** (no LLM/video/TTS/storage endpoints reachable), the blast radius per attacker IP is capped (5 signups/hour, 15/day, plus Supabase limits), unconfirmed accounts never even reach the pending state, and the only cost of a spam account is a DB row and a confirmation email (itself rate-limited). Accepted consequences: junk rows accumulating in `auth.users`/`neuramark_clients` (operator hygiene, not a security breach) and confirmation-email volume within provider limits. Revisit if signup volume triggers Supabase email throttling or if an admin activation UI (P1) changes the activation trust model.

---

## Future-proofing notes

**Introducing real auth:** all identity flows through `getCurrentUser()`; swapping in a session-backed implementation changes zero call sites. Do not build any interim header-based or query-param identity — that becomes an accidental back door.

**Database:** all queries parameterized from day one (also the SQLi guard); keep Supabase access behind a thin server-only data layer with the service-role key never exposed to the client; enforce uniqueness/FK constraints at the DB level (e.g. `source_interview_id`); keep `client_id` on every table and plan RLS policies (prefixed `neuramark_`) so enabling Row Level Security at multi-tenancy time is additive, not a rewrite.

**Multi-tenancy:** `client_id` on every owned table now, ownership checks on every client-supplied ID now (they're trivially true with one client, and they're the entire IDOR defense later); asset serving already ownership-checked; cost aggregation already client-scoped. When tenancy arrives, add row-level policies without schema rework.

**Storage migration (local → S3):** storage behind a server-side interface with relative keys; the serving route becomes a signed-URL redirect with no client-visible change.

---

## Top 5 risks

1. **Likeness misuse** — generating own-avatar video without valid, current consent, or a generic avatar impersonating the owner (legal + trust; mitigated by US-3.2 ledger, US-3.4/10.2 non-overridable blocks).
2. **Approval-gate bypass** — content reaching "ready to publish" via direct endpoint calls without QA/client approval (mitigated by server-side gates in US-10.1/11.1/11.3/12.2).
3. **Provider-boundary compromise** — leaked API keys or forged webhooks corrupting job state / attacker-controlled output URLs (mitigated by US-8.1/8.2/8.4 criteria).
4. **Uncontrolled spend** — budget checks skippable client-side, runaway retries/regenerations (the roadmap's own #1 margin risk; mitigated by US-7.1/8.4 server-side cumulative enforcement).
5. **Malicious uploads / injection** — hostile files, path traversal, FFmpeg or prompt injection through client-authored text (mitigated by the shared upload stack and US-9.x/4.x criteria).
