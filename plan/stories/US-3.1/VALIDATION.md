# Validation Report — US-3.1

**Story:** Choose visual production mode (Preferencias de producción visual)  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-3.1-visual-mode`  
**Commits reviewed:** `c0caaee` (FE — Preferencias UI), `6e2121c` (BE — migration + upsert + loader + consent probe)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED (allowlist; SPEC S3.M4 wins over singular `visual_mode`)  
**SECURITY:** APPROVE WITH CONDITIONS (binding `[SEC]` floors)  
**Tests re-run:** `npx tsx --test lib/visual-preferences/*.test.ts lib/profile/get-business-profile-for-agents.test.ts lib/profile/update-business-profile.test.ts` → **61/61 pass**  
**Live browser / DB E2E:** **Not run** this gate (code + unit evidence only)

---

### Verdict: PASS WITH NOTES

All six USER_STORIES acceptance criteria and the SECURITY.md `[SEC]` floors for US-3.1 (story + added + inherited re-assertions relevant to Preferencias) are met. CONTRACT shapes, error envelopes, fail-closed consent probe, server-derived `rules`, and **no silent regenerate** are implemented and covered by automated tests. Soft stubs for US-3.2 consent ledger / US-3.3 assets match CONTRACT/SPEC allowances.

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

**QA can proceed:** **Yes** (blocker count: **0**).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Three modes selectable with clear product copy per roadmap rules | **PASS** | Allowlist UI for `own_avatar` \| `generic_avatar` \| `faceless` via PrimeReact `Checkbox` + i18n labels/descriptions/examples (`PreferencesEditor.tsx` 20–24, 340–418; `messages/en.json` 309–324; `messages/es.json` 309–324). Product labels (EN: Authorized own avatar / Professional generic avatar / Faceless video / B-roll; ES: Avatar propio autorizado / Avatar genérico profesional / Video sin rostro / B-roll) — enums not used as primary headlines. SPEC allowlist interpretation of “three modes selectable” (SPEC-REVIEW ALIGNED). |
| Mode stored on profile and shown in settings | **PASS** (CONTRACT: Preferencias store + settings, not Ficha viva fields) | Persist to `neuramark_visual_preferences` (`migration` 10–48; `upsert-visual-preferences.ts` 53–59). Settings route `/settings/preferences` loads via arity-0 `getVisualPreferencesForClient()` (`page.tsx` 7, 38; `get-visual-preferences-for-client.ts` 20–76). After save, form syncs allowlist + `updatedAt` + success toast (`PreferencesEditor.tsx` 252–266). Dashboard link (`dashboard/page.tsx` 114–117). **Not** written into `neuramark_business_profiles.fields`; US-2.2 PATCH still rejects Preferencias keys (`visual-preferences.test.ts` 329–346). Soft agent `visualModeSummary` from allowlist when row exists (`get-business-profile-for-agents.ts` 34–67, 94–100). |
| Changing mode does not silently regenerate in-flight content | **PASS** | Upsert path: validate → consent check → upsert Preferencias → `revalidatePath("/settings/preferences")` only (`upsert-visual-preferences.ts` 104–125, 133–134). No job/strategy/script/media/provider calls (static assert `upsert-visual-preferences.ts` source; test `upsert-visual-preferences.test.ts` 151–206: `fromTables` = `["neuramark_visual_preferences"]` only). Toast copy says new productions will use modalities — not regenerate now (`messages/en.json` 304). |
| No mode ever requires the client to record video or audio; own-avatar uses uploaded reference assets only | **PASS** | No `MediaRecorder` / `getUserMedia` / file-capture / recording controls in Preferencias components. Explicit EN/ES copy: never asked to record; uploads later (`messages/en.json` 308; `messages/es.json` 308; `PreferencesEditor.tsx` 404–413). US-3.3 upload UI out of scope (no `media_assets` in migration — `visual-preferences.test.ts` 564–565). |
| Faceless mode captures a style preference (voice + text + stock/B-roll) stored in `faceless_style` | **PASS** | Structured `{ voice, onScreenText, broll }` enums (`lib/contracts/visual-preferences.ts` 16–22). Required when `faceless` ∈ allowlist (Zod superRefine 114–130; DB CHECK `neuramark_visual_preferences_faceless_consistency_chk` migration 37–47). FE shows three Dropdowns when faceless selected (`PreferencesEditor.tsx` 422–481). Persist maps to `faceless_style` jsonb (`helpers.ts` 245–262). |
| **[SEC]** `visual_mode` value validated server-side against the enum; selecting `own_avatar` rejected when no active consent (independent of UI) | **PASS** (applied to allowlist membership per SPEC/SECURITY) | Zod `visualModalitySchema` + `.strict()` input (`lib/contracts/visual-preferences.ts` 8–12, 95–131). Unknown tokens rejected (test lines 101–107). Server: if `own_avatar` ∈ set and `!(await hasActiveAvatarConsent(user.id))` → `OWN_AVATAR_CONSENT_REQUIRED`, no write (`upsert-visual-preferences.ts` 104–108; test `upsert-visual-preferences.test.ts` 117–148). UI disable is UX only (`PreferencesEditor.tsx` 142, 343–368); server remains authority. Fail-closed probe (`has-active-avatar-consent.ts` 47–86; tests 407–505). |

---

### SECURITY.md `[SEC]` floors

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **[SEC] (inherited)** Interview/profiles loaded only via `getCurrentUser()`; no browser `client_id` | **PASS** | Loader arity 0; `requireActive("page")` then `.eq("client_id", user.id)` (`get-visual-preferences-for-client.ts` 20–41). Upsert: `requireActive("handler")`; `client_id: user.id` in payload only (`upsert-visual-preferences.ts` 81, 117–118; `helpers.ts` 245–258). Forbidden keys include `client_id` / `as_client_id` (`helpers.ts` 20–47, 50–68; action 89–91). |
| **[SEC] (inherited)** PATCH rejects consent / visual_mode / system fields (US-2.2 continuity) | **PASS** | Regression: `updateBusinessProfileInputSchema` rejects `visual_mode` / `allowedModes` (`visual-preferences.test.ts` 329–346). Preferencias live on separate table/surface. |
| **[SEC] (inherited)** `getBusinessProfileForAgents` server-only; omit consent internals | **PASS** | `import "server-only"` (`get-business-profile-for-agents.ts` 1). Soft summary = `{ allowedModes }` only (34–67); no consent fields. |
| **[SEC] (inherited)** Free-text / preference strings rendered escaped | **PASS** | i18n + PrimeReact `Message` `text` / React text nodes (`PreferencesEditor.tsx` 325–327, 383–413). No `dangerouslySetInnerHTML` on preferences surfaces. |
| **[SEC] Preferencias modalities ⊆ enum; reject `own_avatar` without consent** | **PASS** | See USER_STORIES [SEC] row above. |
| **[SEC] (US-3.4 continuity)** `must_disclose_not_owner` server-derived; not client-writable | **PASS** | `deriveVisualPreferencesRules` (`helpers.ts` 71–77); payload uses derived rules (`254–261`). Client `rules` / `must_disclose_not_owner` → `FORBIDDEN_FIELDS` (`helpers.ts` 31–33; action 89–91; tests 160–173, 216–231). |
| **[SEC] (added)** Multi-select allowlist on `neuramark_visual_preferences` (UNIQUE `client_id`); DB constraint ∈ enum | **PASS** | Migration: PK `client_id`, `allowed_modes neuramark_visual_modality[]`, CHECK containment + uniqueness (`migration` 10–31). Empty allowlist allowed (CONTRACT freeze; Zod accepts `[]` — test 93–99). |
| **[SEC] (added)** Server Action only; CSRF via Next.js; `requireActive("handler")`; no public RH with tenant ids | **PASS** | `"use server"` + `upsertVisualPreferences` (`upsert-visual-preferences.ts` 1, 135–147). No `app/api/**/preferences` (test 533–546). Unauthenticated → `UNAUTHENTICATED` (test 242–274). |
| **[SEC] (added)** No tenant/prefs id as authority; arity 0 / body-only; `WHERE client_id = $server` | **PASS** | Signature/arity tests (`visual-preferences.test.ts` 378–404). Foreign `client_id` → `FORBIDDEN_FIELDS`, no write (`upsert-visual-preferences.test.ts` 212–239). |
| **[SEC] (added)** Zod `.strict()`; reject unknown modes, rules, consent*, tenant, privilege, audit keys | **PASS** | Input schema `.strict()` (`visual-preferences.ts` 95–113); forbidden-key scan before Zod (`helpers.ts` 50–68; action 89–91). Tests cover unknown keys, rules, consent, tenant (150–157, 160–201). |
| **[SEC] (added)** Consent soft gate fail-closed; never invent/grant consent on save | **PASS** | Missing config / missing table / revoked / error → `false` (`has-active-avatar-consent.ts` 50–85). Preferencias upsert never writes consent table. Migration does not create `neuramark_avatar_consents` (test 553–565). |
| **[SEC] (added)** `faceless` ∈ set ⇒ required structured `faceless_style` | **PASS** | Zod + DB consistency CHECK; FE constrained Dropdowns (see AC faceless row). Payload size ≤ 4 KiB (`visual-preferences.ts` 26–27; `helpers.ts` 88–94; action 100–102). |
| **[SEC] (added)** Server-owned `rules` when generic selected | **PASS** | See US-3.4 continuity row. |
| **[SEC] (added)** No silent regenerate | **PASS** | See USER_STORIES AC row. |
| **[SEC] (added)** Do not write Preferencias onto `business_profiles.fields` / reopen PATCH | **PASS** | Separate table; PATCH regression tests. |
| **[SEC] (added)** Settings under `(app)`, not `isPublicPath`, `requireActive("page")`, `no-store`; not on `/profile` edit | **PASS** | `app/(app)/settings/preferences/page.tsx`; `(app)/layout.tsx` `requireActive("page")`; `isPublicPath("/settings/preferences") === false` (test 548–550); `next.config.ts` 45–50 `/settings` + `/settings/:path*` → `no-store`; `dynamic = "force-dynamic"` (`page.tsx` 7). No Preferencias chrome in `components/profile`. |
| **[SEC] (added)** XSS bar | **PASS** | Trusted i18n; controlled Checkbox/Dropdown; no `dangerouslySetInnerHTML`. |
| **[SEC] (added)** Response / agent summary minimality | **PASS** | Loader DTO: allowlist + style + rules + `updatedAt` + soft `ownAvatarConsentActive` boolean — no tokens/role/ledger (`get-visual-preferences-for-client.ts` 56–76). Agent summary allowlist-only. |
| **[SEC] (added)** RLS deny-by-default; `neuramark_` prefix; service-role Node; no browser Supabase | **PASS** | Migration ENABLE RLS, zero `CREATE POLICY` (55–57; test 553–567). Client components have no `@supabase` imports. Supabase only via `lib/supabase/server`. |
| **[SEC] (added)** No Operator cross-tenant Preferencias edit | **PASS** | No `as_client_id` / `requireOperator` branch; own `user.id` only. |
| **[SEC] (added)** Do not log full preference jsonb in production | **PASS** | Logs use codes / static strings only (`upsert-visual-preferences.ts` 62, 112, 144; `helpers.ts` 177–209; consent probe 70). |
| **[SEC] (added)** Do not create full consent ledger / grant-revoke APIs | **PASS** | Soft probe only; no grant/revoke Server Action; no consent migration in this story. |
| **[SEC] (added)** Automated security tests cover listed cases | **PASS** | 61/61 re-run: allowlist happy path; unknown enum; own_avatar without consent; faceless without style; rules/tenant reject; no job enqueue; PATCH boundary; unauthenticated; no public RH; route not public; migration RLS; fail-closed consent. |

---

### CONTRACT compliance

| Topic | Status | Evidence |
|-------|--------|----------|
| Shapes (loader / upsert success / errors) | **PASS** | Contracts in `lib/contracts/visual-preferences.ts` match CONTRACT fixtures; success/error Zod schemas; `OWN_AVATAR_CONSENT_REQUIRED` + `messageKey` (`errors.ts` 43–47; test 303–315). |
| Surface set | **PASS** | `/settings/preferences` + `getVisualPreferencesForClient` + `upsertVisualPreferences` + `hasActiveAvatarConsent`; soft `visualModeSummary` widen; no public Preferencias Route Handler. |
| Empty allowlist | **PASS** | Allowed and persistable (CONTRACT freeze #5; Zod test 93–99). |
| `genericAvatarId` null-only V1 | **PASS** | Schema `z.null().optional()`; non-null rejected (test 141–148); payload always `null` (`helpers.ts` 260). |
| No silent regenerate | **PASS** | Explicit non-behavior + tests. |
| FE signed freeze followed | **PASS** | Await + toast (not optimistic-only); Cancel restores server snapshot (`PreferencesEditor.tsx` 161–165, 245–266); own-avatar disabled when `ownAvatarConsentActive === false`. |

---

### Convention Compliance

| Concern | Status | Notes |
|---------|--------|-------|
| EN + ES user-facing copy | **PASS WITH NOTE** | Full `preferences` + dashboard `preferencesCard` in both catalogs. ES uses CONTEXT labels correctly. EN mode label “Faceless video / B-roll” uses the word “Faceless” (CONTEXT _Evitar_ soft risk for product copy) — does not block AC; optional copy polish. |
| Server Components default; minimal `"use client"` | **PASS WITH NOTE** | Page is RSC; Client islands for editor interactivity. `PreferencesView.tsx` is `"use client"` though it has no hooks — could stay RSC wrapping `PreferencesEditor` (non-blocking). |
| PrimeReact-first | **PASS** | `Checkbox`, `Dropdown`, `Button`, `Message`, `Toast`. |
| Loading / empty / error / pending | **PASS WITH NOTE** | Empty hint; loadFailed error + dashboard CTA; save `pending`/`loading`/`disabled`; error banner. No dedicated `app/(app)/settings/**/loading.tsx` (interview has one) — soft; SSR + force-dynamic acceptable for V1. |
| Auth / identity via `getCurrentUser()` / `requireActive`; no browser Supabase | **PASS** | `(app)` layout + helper/action gates; Client calls Server Action only. |
| `neuramark_` DB prefix | **PASS** | Type, table, constraints, trigger all prefixed. |
| Backend surfaces map to concrete FE consumers | **PASS** | Settings page ↔ loader; Editor ↔ upsert; dashboard Link only. |
| Dependency US-2.1 | **PASS** | TASKS marks US-2.1 CLOSED; Preferencias is a separate surface/store. |

---

### Gaps (what blocks PASS)

**None.** Blocker count: **0**.

---

### Scope Creep

**None material.** Soft `visualModeSummary` populate and server `rules` stub are in-CONTRACT same-BUILD. No US-3.2 ledger UI/API, no US-3.3 uploads, no job enqueue, no Preferencias on `/profile`, no public Preferencias API.

---

### Soft notes (do not block QA)

1. **US-3.2 / US-3.3 stubs** — Consent is fail-closed probe only; assets messaging only — allowed by CONTRACT/SPEC.  
2. **EN “Faceless…” wording** — Optional i18n polish toward CONTEXT-preferred phrasing (e.g. “Video without a face / B-roll”).  
3. **`PreferencesView` client boundary** — Unnecessary `"use client"`; FE may tighten later.  
4. **Client value import from Zod contract module** — `FACELESS_STYLE_DEFAULT` imported into Client Component from `lib/contracts/visual-preferences.ts` (also exports Zod). Prefer a tiny shared constants module later to keep Zod server-only.  
5. **No live E2E** this gate — unit/static evidence only; QA should exercise `/settings/preferences` against a real session/DB.  
6. **Agents summary tests** — Existing agents suite still asserts `null` paths; population path is implemented but not assertively covered beyond code review (soft CONTRACT item).

---

### Recommended Next Actions (and which agent should take them)

1. **product-owner** — Check off USER_STORIES US-3.1 AC in `plan/USER_STORIES.md` (validator does not). Advance gate to QA.  
2. **qa-engineer** — Manual/E2E: load empty Preferencias; save generic + faceless style; assert `OWN_AVATAR_CONSENT_REQUIRED` / disabled own-avatar without consent; confirm no generation side effects; EN/ES strings.  
3. **nextjs-frontend** (optional, non-blocking) — Tighten `PreferencesView` to RSC; EN faceless label polish; move `FACELESS_STYLE_DEFAULT` out of Zod module.  
4. **Do not** implement US-3.2/3.3 under this story’s residual notes.

---

### Test evidence (re-run)

```text
npx tsx --test \
  lib/visual-preferences/*.test.ts \
  lib/profile/get-business-profile-for-agents.test.ts \
  lib/profile/update-business-profile.test.ts
→ 61/61 pass
```
