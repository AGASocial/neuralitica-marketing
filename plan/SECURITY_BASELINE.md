# Security Baseline — Neuralitica V1 Backlog

> **Scope:** design-time review of every story in `plan/USER_STORIES.md` (US-1.x through US-13.x, US-X.1–X.3), cross-checked against the hard rules in `plan/MODULES_ROADMAP_v1.1.html`.
> **Date:** 2026-07-02 · **Reviewer:** security-architect
> **Status of criteria:** every `[SEC]` checkbox added to `USER_STORIES.md` is binding for the implementing agents and is validated by the requirements-validator like any other acceptance criterion.

Sanctioned exceptions per `AGENTS.md` (NOT findings): no real auth yet, hardcoded local user `gaveho@gmail.com` / Gabriel Vega, SQLite for local dev. All designs below are constrained so real auth, a production DB, and multi-tenancy can be introduced later without rewrite.

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
| Video Provider Adapter | US-8.1–8.5 | APPROVE WITH CONDITIONS — biggest external trust boundary |
| Media Assembly Pipeline | US-9.1–9.3 | APPROVE WITH CONDITIONS — command-injection surface |
| QA/Compliance + Overrides | US-10.1–10.2 | APPROVE WITH CONDITIONS — non-overridable legal blocks |
| Approval Flow | US-11.1–11.3 | APPROVE WITH CONDITIONS — gate must hold against direct calls |
| Calendar / Metrics (P1) | US-12.x, US-13.x | APPROVE WITH CONDITIONS |
| Cross-cutting | US-X.1–X.3 | APPROVE WITH CONDITIONS — X.3 is the auth seam |

**No REDESIGN verdicts.** The backlog's shapes are sound; every risk found was addressable with acceptance criteria rather than a structural change. Two designs came close and carry explicit conditions:

1. **US-8.2/8.4 webhook/polling** — storing raw provider `output_url` long-term and accepting unauthenticated status callbacks would have been a REDESIGN; the added criteria (download-and-own assets, signature-verified webhooks, server-only status writes) keep the current story shape viable.
2. **US-3.3 media storage** — serving uploads from `public/` would be irreversible-ish once URLs spread; the criteria mandate storage outside the web root behind an ownership-checked route from day one.

---

## Assets and trust boundaries

| Asset | Sensitivity | Where untrusted input enters |
|---|---|---|
| Likeness media + consents (US-3.2/3.3) | Highest — legal/biometric-adjacent | File uploads, consent actions |
| Provider API keys (HeyGen, LTX/Wan, TTS, LLM) | High — direct financial abuse | Never; must stay server-env only |
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

New packages expected by this backlog: a schema validator (Zod — sanctioned, mainstream), an FFmpeg wrapper or direct `spawn` (prefer direct `spawn` with arg arrays over thin wrapper packages), file-type detection (`file-type` — mainstream) and official/first-party SDKs for HeyGen/TTS where they exist. Anything beyond that list should be justified against a story; watch for typosquats when installing (`filetype` vs `file-type`, etc.). No package with postinstall scripts without review.

---

## Future-proofing notes

**Introducing real auth:** all identity flows through `getCurrentUser()`; swapping in a session-backed implementation changes zero call sites. Do not build any interim header-based or query-param identity — that becomes an accidental back door.

**Production database:** all queries parameterized from day one (also the SQLi guard); keep SQLite access behind a thin data layer so the Postgres/Vercel swap is mechanical; enforce uniqueness/FK constraints at the DB level (e.g. `source_interview_id`) so integrity survives the migration.

**Multi-tenancy:** `client_id` on every owned table now, ownership checks on every client-supplied ID now (they're trivially true with one client, and they're the entire IDOR defense later); asset serving already ownership-checked; cost aggregation already client-scoped. When tenancy arrives, add row-level policies without schema rework.

**Storage migration (local → S3):** storage behind a server-side interface with relative keys; the serving route becomes a signed-URL redirect with no client-visible change.

---

## Top 5 risks

1. **Likeness misuse** — generating own-avatar video without valid, current consent, or a generic avatar impersonating the owner (legal + trust; mitigated by US-3.2 ledger, US-3.4/10.2 non-overridable blocks).
2. **Approval-gate bypass** — content reaching "ready to publish" via direct endpoint calls without QA/client approval (mitigated by server-side gates in US-10.1/11.1/11.3/12.2).
3. **Provider-boundary compromise** — leaked API keys or forged webhooks corrupting job state / attacker-controlled output URLs (mitigated by US-8.1/8.2/8.4 criteria).
4. **Uncontrolled spend** — budget checks skippable client-side, runaway retries/regenerations (the roadmap's own #1 margin risk; mitigated by US-7.1/8.4 server-side cumulative enforcement).
5. **Malicious uploads / injection** — hostile files, path traversal, FFmpeg or prompt injection through client-authored text (mitigated by the shared upload stack and US-9.x/4.x criteria).
