# QA Report — US-3.2 Capture consent for own avatar

**Story:** Consentimiento de avatar (append-only ledger)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-29  
**Branch:** `feature/US-3.2-avatar-consent`  
**Commits:** `7a11571` (FE), `ff280ed` (BE)  
**Prior gate:** VALIDATION.md — PASS WITH NOTES  
**Sources:** USER_STORIES § US-3.2, SECURITY.md, CONTRACT.md, VALIDATION.md; implementation under `lib/visual-preferences/` (grant/revoke/probe/loader/stubs), `lib/contracts/avatar-consent.ts`, `components/preferences/AvatarConsentSection.tsx`, migration `20260829220000_neuramark_avatar_consents.sql`

---

### Verdict: APPROVE WITH CONDITIONS

No Critical or High findings. Append-only ledger, explicit grant, version-aware fail-closed probe, IDOR, Preferencias non-side-effect, revoke→cancel stub, job assert stub, XSS/CSRF, and no browser Supabase all hold for the V1 single-version path.

**CLOSE can proceed:** **Yes** (blocker count for Critical/High: **0**).

Conditions: Medium #1 must be fixed **before any disclosure constant bump** (`AVATAR_CONSENT_DISCLOSURE_V2+`). V1 ship with only `AVATAR_CONSENT_DISCLOSURE_V1` is sound.

---

### Findings

#### Medium

1. **Version-mismatch re-consent is stuck (partial unique + INSERT-only grant + revoke UI only when `active`)**  
   - **Where:** `grant-avatar-consent.ts:74–99`; `revoke-avatar-consent.ts:47–63`; `AvatarConsentSection.tsx:332–380`; migration `neuramark_avatar_consents_client_id_active_uidx` (`20260829220000_neuramark_avatar_consents.sql:18–20`)  
   - **What:** Active = non-revoked **and** `consent_version === CURRENT`. After a constant bump, an old non-revoked row makes the probe/`loader` return inactive (`version_mismatch`), so the UI shows **Grant** (not Revoke). Grant then `INSERT`s a second active row and hits the partial unique `(client_id) WHERE revoked_at IS NULL` → `23505` mapped to `ALREADY_ACTIVE`. User cannot revoke via UI while inactive, and cannot INSERT a new version row while the outdated non-revoked row remains.  
   - **Why it matters:** Binding SEC AC (“changing disclosure requires re-consent under a new version”) cannot complete through the product path. Latent until the first legal-copy bump — not a V1 bypass — but leaves a dead-end once bump happens. No automated test covers grant after version-mismatch with an existing non-revoked row.  
   - **Fix direction (pick one before V2):** On grant, if a non-revoked outdated row exists for `$server`, revoke it (`revoked_at` only) then INSERT in one server flow; **or** expose revoke for `version_mismatch` / any non-revoked row; **or** document-and-enforce revoke-then-grant with UI that allows revoke when `reason === "version_mismatch"`. Add a unit test for the chosen path.

#### Low

2. **Duplicated disclosure version string (contracts vs server-only)**  
   - **Where:** `lib/contracts/avatar-consent.ts:9` (`AVATAR_CONSENT_DISCLOSURE_V1`); `lib/visual-preferences/avatar-consent-version.ts:8–14` (`CURRENT_AVATAR_CONSENT_VERSION`)  
   - **What:** Zod grant literal and FE echo use the contracts constant; probe/INSERT/loader authority use the server-only module. Strings match today; a one-sided bump desyncs Zod vs probe/INSERT.  
   - **Why it matters:** Process hazard on disclosure bumps — not a current trust-boundary hole.  
   - **Fix direction:** Single source of truth for the string (shared non-server-only constant module imported by contracts + server-only wrapper), or a build/test assert that both exports are equal.

3. **Residual: Preferencias `helpers.ts` still lacks `import "server-only"`**  
   - **Where:** `lib/visual-preferences/helpers.ts` (US-3.1 QA Low #2, still open)  
   - **What:** Unchanged this story; Preferencias helpers remain importable without the server-only guard. Consent modules correctly use `server-only` / `"use server"`.  
   - **Fix direction:** Add `import "server-only"` to `helpers.ts` (and assert in static test) when convenient — not introduced by US-3.2.

---

### Security focus checklist (evidence)

| Focus | Result | Evidence |
|-------|--------|----------|
| Append-only ledger | **Pass** | Grant = INSERT only (`grant-avatar-consent.ts:85–94`); revoke UPDATE payload is `{ revoked_at }` only (`revoke-avatar-consent.ts:68–75`); no DELETE in app code; migration has no `DELETE FROM` / no delete policies |
| Explicit grant (no Preferencias side effect) | **Pass** | Only `grantAvatarConsent` writes ledger; Zod `{ affirmed: true, consentVersion }` `.strict()`; Preferencias upsert never touches `neuramark_avatar_consents` (test “Preferencias upsert never writes consent ledger”) |
| Version match / server constant | **Pass** (V1) | Probe compares to `CURRENT_AVATAR_CONSENT_VERSION` (`has-active-avatar-consent.ts:85`); mismatch → false; grant rejects wrong echo (`CONSENT_VERSION_MISMATCH`); INSERT stores server constant. Re-consent after bump: **Medium #1** |
| Multi-row probe (US-3.1 QA Medium) | **Pass** | `.is("revoked_at", null).order("consented_at", { ascending: false }).limit(1).maybeSingle()` then version match; tests cover multi-row / revoked-only / mismatch |
| IDOR / session-bound | **Pass** | Loader arity 0; grant/revoke use `user.id` only; forbidden `client_id` / `as_client_id` / timestamps → `FORBIDDEN_FIELDS`; no tenant Route Handler |
| Revoke cancel stub | **Pass** | `await cancelQueuedOwnAvatarJobs(user.id)` after successful revoke; skipped on `NOT_ACTIVE`; stub no-op + Operator TODO documented |
| Job re-check stub | **Pass** | `assertActiveAvatarConsentForJobs` fail-closed via live probe; Preferencias allowlist not authority |
| No Preferencias silent rewrite on revoke | **Pass** | Revoke does not touch `neuramark_visual_preferences`; soft stale-allowlist warning in UI |
| XSS | **Pass** | Disclosure as React `<p>` text nodes (`AvatarConsentSection.tsx:298–301`); no `dangerouslySetInnerHTML` under `components/preferences/` |
| CSRF | **Pass** | Server Actions only; `requireActive("handler")`; no public `/api/…` consent mutate |
| No browser Supabase | **Pass** | No `@supabase` / `NEXT_PUBLIC_*` Supabase in preferences Client Components; DB via `lib/supabase/server` service-role only |
| RLS + `neuramark_` prefix | **Pass** | Table/indexes/constraints prefixed; `ENABLE ROW LEVEL SECURITY`; zero named policies |
| Settings gated + `no-store` | **Pass** | `(app)` + `requireActive`; `isPublicPath("/settings/preferences") === false`; `next.config.ts` `/settings/:path*` → `no-store`; `dynamic = "force-dynamic"` |
| No silent jobs from grant/revoke | **Pass** | Ledger + stub + `revalidatePath` only; static assert no generation modules |

---

### Checks Run

| Check | Result |
|-------|--------|
| `npx tsx --test lib/visual-preferences/*.test.ts` | **58/58 pass** (avatar-consent + Preferencias continuity) |
| `npx tsc --noEmit -p tsconfig.json` | Pre-existing test-file TS5097 / NODE_ENV noise only — **no US-3.2 production-source errors** |
| Static: `dangerouslySetInnerHTML` in preferences | **None** (comment-only mentions) |
| Static: `@supabase` in `components/preferences/` | **None** |
| Static: migration RLS / partial unique / no `media_assets` | **Present** (also asserted in tests) |
| Live browser / real Supabase E2E grant→revoke→upsert reject | **Not run** (unit + code review only) |

---

### What Was Not Covered

- End-to-end against a live Supabase project (grant → enable Avatar propio → save Preferencias → revoke → upsert reject + stale warning).
- Concurrent double-grant race beyond mapping `23505` → `ALREADY_ACTIVE` (partial unique exists; no load test).
- Real `neuramark_video_jobs` cancel / Operator in-flight flag (CONTRACT stubs only — accepted for US-3.2).
- Legal review of EN/ES disclosure copy.

---

### Recommended Next Actions

| Action | Owner |
|--------|--------|
| Fix Medium #1 before any `AVATAR_CONSENT_DISCLOSURE_V*` bump | **nextjs-backend** (+ FE if revoke UX for mismatch) |
| Optional: unify version constant (Low #2); `server-only` on Preferencias helpers (Low #3) | **nextjs-backend** |
| Wire `assertActiveAvatarConsentForJobs` + real cancel stub at job create | **nextjs-backend** (US-8.x / US-10.x) |
| Check off USER_STORIES.md § US-3.2 AC after PO review | **product-owner** |

**CLOSE?** **Yes** — 0 Critical, 0 High; Medium #1 is a binding process condition for the next disclosure version, not a V1 trust-boundary bypass.
