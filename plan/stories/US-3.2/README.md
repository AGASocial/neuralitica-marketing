# US-3.2 — Capture consent for own avatar

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH CONDITIONS (8/8 AC; FE `7a11571`, BE `ff280ed`).

**As a** Cliente, **I want** to explicitly authorize use of my likeness, **so that** Avatar propio autorizado is legally and ethically enabled.

Ship **Consentimiento de avatar**: explicit affirmative grant (+ revoke) of likeness authorization for Avatar propio autorizado, with disclosure text version stored for audit, append-only ledger semantics, EN/ES UI, and server-side enforcement that Preferencias cannot persist `own_avatar` without active consent. Replace US-3.1’s soft fail-closed probe (missing table) with a real ledger behind hardened `hasActiveAvatarConsent`. Video-job creation re-check and revoke→cancel queued own-avatar jobs are **stubs/design hooks** until US-8.x / US-10.x exist — no job cancel UI here. Reference uploads (US-3.3) stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-3.2 (checked on CLOSE).

**This folder:** [`plan/stories/US-3.2/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · [`CONTRACT.md`](./CONTRACT.md) (frozen) · `VALIDATION.md` · `QA.md`.

**Depends on:** [US-3.1](../US-3.1/) ✅ CLOSED — Preferencias UI at `/settings/preferences`, enum/allowlist SEC, soft `hasActiveAvatarConsent` fail-closed probe. Runtime identity: [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`). Continuity: Preferencias upsert must keep rejecting `own_avatar` without active consent (now against real ledger).

**Unblocks:** [US-3.3](../../USER_STORIES.md) (reference assets — uploads only when consent active) · US-8.x / US-10.x (live consent re-check at Job create; revoke cancels queued own-avatar jobs).

**Carry-forward (US-3.1 QA Medium):** harden `hasActiveAvatarConsent` for append-only multi-row ledger (`revoked_at IS NULL`, order, limit 1) — **first BE task** before grant/revoke APIs land.

---

## Close verdicts

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | ALIGNED (Consentimiento append-only; Preferencias continuity; job stubs) |
| SECURITY | APPROVE WITH CONDITIONS |
| CONTRACT | Frozen, Reviewed by FE (2026-08-29) |
| BUILD | FE `7a11571` · BE `ff280ed` |
| VALIDATION | PASS WITH NOTES |
| QA | APPROVE WITH CONDITIONS (0 Critical, 0 High, 1 Medium non-blocking, 2 Low; CLOSE yes) |

**QA handoff (non-blocking):** fix version-mismatch re-consent path **before any `AVATAR_CONSENT_DISCLOSURE_V*` bump** (QA Medium #1); optional Low polish (unify version constant; `server-only` on Preferencias helpers). Wire real job re-check + cancel at US-8.x / US-10.x.

---

## Scope in

| Area | What 3.2 adds |
|------|----------------|
| **FE** | Consentimiento UI: disclosure text + affirmative checkbox/action; grant + revoke; show consent status + timestamp (+ version for audit); keep Avatar propio disabled until active consent; EN/ES. Wire into Preferencias surface (or dedicated route — see PO lean). |
| **BE** | Create ledger table; **harden** `hasActiveAvatarConsent` for multi-row; grant + revoke Server Actions (explicit only — never side effect of Preferencias save); store `consent_version` + server `consented_at`; append-only revoke (`revoked_at`); stub video-job re-check + revoke→cancel queued jobs for when job tables exist. |
| **DB** | New `neuramark_avatar_consents` (story shorthand `avatar_consents`): `client_id`, `consented_at`, `consent_version`, `revoked_at` (+ indexes for active probe). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-3.3 uploads** | Reference photos/clips, `media_assets`, virus/size — **out**. Consent gates future uploads; no upload UI here. |
| **US-8 / US-10 video job cancel UI** | No job queue screens, provider cancel UX, or Operator review UI. **SEC still requires** revoke to cancel queued (not yet submitted) own-avatar jobs and flag in-flight — implement as **stub / design hook** callable when jobs exist; prove with tests against stub or absent tables. |
| **Modalidad de producción per Reel** | Strategy slot assignment — later (US-4.x). |
| **US-3.4** | Generic disclosure / QA flags — unchanged. |
| Auth redesign / browser Supabase | Unchanged. Keep consent + Preferencias paths off `isPublicPath`. |

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-3.1 | Preferencias at `/settings/preferences`; `upsertVisualPreferences` rejects `own_avatar` via `hasActiveAvatarConsent`; UI disables Avatar propio when probe false; fail-closed if table missing. |
| US-2.2 | Ficha viva PATCH still must not write consent / Preferencias. |
| US-2.3 | Agents DTO omits consent ledger internals; `visualModeSummary` from allowlist only. |
| Auth US-14.5 | `requireActive` / `getCurrentUser()` for Cliente mutations and settings RSC. |

**US-3.2 adds Consentimiento ledger + grant/revoke** — Preferencias soft gate becomes a real ledger probe; no consent as side effect of preference save.

## Canonical terms (CONTEXT)

Use **Consentimiento de avatar**, **Avatar propio autorizado**, **Preferencias de producción visual**, **Cliente**, **Operator**, **likeness** only in legal/disclosure sense (not as product entity name).  
_Evitar:_ consent ledger (in product copy), own_avatar / likeness mode (in product copy — OK as enum), avatar mode / visual preferences (as entity names), Business Profile / perfil de negocio, admin / staff.
