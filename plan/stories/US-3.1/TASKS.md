# US-3.1 — Choose visual production mode

**Priority:** P0  
**Depends on:** US-2.1 ✅ CLOSED (`plan/stories/US-2.1/`) · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout) · continuity US-2.2 ✅ (PATCH must not write Preferencias) · US-2.3 ✅ (`visualModeSummary` stub until populated)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-3.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-frontend** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md` Fase 1). DB migration under BE/DB. No content/media/integrations specialist for this story.  
**Canonical terms:** **Preferencias de producción visual** · **Cliente** / **Operator** · product labels **Avatar propio autorizado** · **Avatar genérico profesional** · **Video sin rostro** / **B-roll**. Technical enums `own_avatar` \| `generic_avatar` \| `faceless` OK in code/DB only. Avoid CONTEXT _Evitar_ list in product-facing docs/copy.

## Out of scope (do not implement here)

- **US-3.2 full Consentimiento ledger** — no append-only consent UI/API, no revoke flow, no `consent_version` UX. Soft **check** only: reject `own_avatar` when no active consent (missing table / no row / revoked → reject).
- **US-3.3** reference asset upload / `media_assets` / serving routes.
- **US-3.4** QA agent impersonation checks / approval disclosure UI — optional **server-side rule stubs** only if CONTRACT needs (e.g. `must_disclose_not_owner` when generic selected); no QA agent wiring.
- **Modalidad de producción per Reel** / Strategy slot assignment (US-4.x) — this story is Cliente Preferencias only.
- Reopening US-2.2 Ficha viva PATCH to write Preferencias; do not put Preferencias editors on `/profile` edit chrome.
- Enqueueing video/TTS/strategy jobs or silent regenerate of in-flight content on preference save.
- Auth redesign; browser Supabase; public Route Handler with tenant ids.

## Scope split

| Concern | Owner |
|---------|--------|
| Ficha viva read / edit / agent DTO stub | **US-2.1 / US-2.2 / US-2.3** (done) |
| Preferencias UI + persist + enum SEC + soft consent gate | **US-3.1** (this story) |
| Consentimiento ledger | **US-3.2** |
| Reference uploads | **US-3.3** |
| Generic disclosure / QA flags | **US-3.4** |
| Slot modality assignment | **US-4.x** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| SPEC vs story shape | **SPEC S3.M4 wins:** Preferencias = **allowlist** (multi-selección), not a single rigid account mode. Story AC still the checkbox SoT; CONTRACT reshapes columns to satisfy SPEC (e.g. allowed modalities set) while keeping enum tokens. Escalate amendment only if spec-guardian requires USER_STORIES rewrite. |
| Table name | **`neuramark_visual_preferences`** (SPEC + root `TASKS.md`). Story shorthand `visual_preferences` = same object with `neuramark_` prefix. UNIQUE `client_id`; RLS deny-by-default; service-role Node only. |
| Settings route | **PO lean:** new gated App Router page under `(app)`, e.g. `/settings/preferences` (EN page title “Visual production preferences” / ES “Preferencias de producción visual”). Not on Ficha viva `/profile` edit. Exact path freezes in CONTRACT. Link from dashboard and/or profile nav. Off `isPublicPath`; `Cache-Control: no-store`. |
| Mutation surface | Prefer **Server Action** (arity 0 tenant — identity from `getCurrentUser().id` only). No public `/api/…` with `client_id`. |
| Enum validation | Zod/server enum: `own_avatar` \| `generic_avatar` \| `faceless` only. Reject unknown. |
| Consent soft gate (pre–US-3.2) | Selecting / persisting `own_avatar` (alone or in allowlist) **rejected server-side** if no active consent. **PO lean:** if `neuramark_avatar_consents` (or CONTRACT name) **does not exist yet**, treat as **no consent** (fail closed). If table exists (later), require non-revoked row. UI disables Avatar propio when check fails — UI is not authority. |
| `faceless_style` | Required when `faceless` is in Preferencias. **PO lean:** structured jsonb `{ voice, onScreenText, broll }` (or equivalent) — CONTRACT freezes keys/enums; not free-form only. |
| `generic_avatar_id` | Nullable stub until catalog/assets exist; do not invent catalog UX. |
| Mode rules stub | **PO lean:** optional `rules` jsonb; if `generic_avatar` selected, server may set `must_disclose_not_owner: true` (US-3.4 continuity). Field **not** client-writable. Full QA enforcement stays US-3.4. |
| No silent regenerate | Preference save **only** upserts Preferencias (+ revalidate). **No** job enqueue, no strategy/script regenerate, no provider calls. Prove with tests: mutation does not call generation helpers / job tables. |
| No human recording | Copy + UX: never ask Cliente to record video/audio; own-avatar references = future uploads (US-3.3). |
| Agent summary | **PO lean:** when Preferencias row exists, update `getBusinessProfileForAgents` `visualModeSummary` from allowlist (minimal, no consent internals). If absent, keep `null`. Exact DTO freezes in CONTRACT; may be soft follow-up in same BUILD. |
| Identity | `requireActive("page"|"handler")`; `WHERE client_id = $server`. Strip/reject browser `client_id`. |
| Disable unavailable | FE disables Avatar propio without consent; other “unavailable” (e.g. missing assets) may be soft messaging only until US-3.3 — CONTRACT freezes which modes are hard-disabled in V1. |
| i18n | EN + ES; product terms per CONTEXT; enums never as primary UI labels. |
| XSS | Controlled inputs / PrimeReact; no `dangerouslySetInnerHTML`. |

## Carry-forwards / reuse (do not reinvent)

- Identity / session: same `(app)` + `requireActive` / `getCurrentUser()` as profile stories.
- Do **not** weaken US-2.2 strip of Preferencias on Ficha viva PATCH.
- US-2.3: extend `visualModeSummary` only via server helper; never dump consent ledger into agent DTO.
- Migrations: `neuramark_` prefix; no ad-hoc SQL.
- Prefer PrimeReact for selector / form controls.

---

## FE checklist

Concrete BE consumers: Server Action upsert Preferencias (CONTRACT name); RSC loader for own Preferencias on settings page; optional consent-availability probe (read-only helper returning boolean — no ledger UI).

- [x] **Preferencias UI** on settings route (CONTRACT path): three modalities with explanations and examples; clear product copy (EN/ES) per roadmap / CONTEXT labels — not raw enum strings as headlines.
- [x] **Disable unavailable modes** (at minimum: Avatar propio when server says no active consent); show why disabled.
- [x] **Faceless style** capture when Video sin rostro is selected/included (voice + text + stock/B-roll) — fields map to `faceless_style`.
- [x] **Show stored preferences** after load/save (AC: mode stored and shown in settings).
- [x] **No recording UX** — no prompts to record video/audio; copy states own-avatar uses uploaded references (US-3.3).
- [x] Save / Cancel (or equivalent); loading / error / success states; disable save while in-flight.
- [x] EN + ES in `messages/en.json` / `es.json`. Canonical Preferencias terms; avoid CONTEXT _Evitar_.
- [x] No Supabase in Client Components; no `client_id` as identity in URL/body.
- [x] Do **not** build US-3.2 consent form, US-3.3 upload, or US-3.4 approval disclosure UI.

---

## BE checklist

Concrete FE consumers: settings RSC page; Preferencias Client form calling Server Action; optional dashboard/nav link.

- [x] **Migration** for Preferencias table (`neuramark_visual_preferences` — CONTRACT freezes columns: allowlist vs single `mode`, `generic_avatar_id`, `faceless_style`, `updated_at`, optional `rules`).
- [x] **Loader** (arity 0): own Preferencias by `getCurrentUser().id` or explicit empty/missing.
- [x] **Server Action upsert** (CONTRACT name): `requireActive("handler")`; Zod enum/allowlist + `faceless_style` when required; identity from session only.
- [x] **[SEC] Enum validation** server-side; reject unknown modes.
- [x] **[SEC] Reject `own_avatar` without active consent** — independent of UI; soft gate if consent table missing (fail closed). Do **not** implement full US-3.2 ledger APIs.
- [x] Attach **mode rules stubs** if CONTRACT requires (e.g. server-set `must_disclose_not_owner` for generic) — not client-writable.
- [x] **No silent regenerate:** upsert must not enqueue jobs / regenerate strategy/scripts/media; automated test proves no generation side effects.
- [x] Parameterized queries; service-role Node only; never log unnecessary PII.
- [x] `revalidatePath` for settings (and nav consumers if needed).
- [x] Optional: populate `visualModeSummary` in `getBusinessProfileForAgents` when Preferencias exist (CONTRACT freezes shape).
- [x] Automated tests: happy path persist; enum reject; `own_avatar` without consent rejected; faceless requires style; foreign `client_id` ignored; no job enqueue on save.


**BE note (US-3.1 BUILD):** `visualModeSummary` populated from Preferencias allowlist in `getBusinessProfileForAgents` (soft same-BUILD). Migration applied via `supabase/migrations/20260829210000_neuramark_visual_preferences.sql`. Settings UI remains FE.

**AC mapping (for validator later):** Three modes + copy; stored + settings UI; no silent regenerate; no recording requirement; `faceless_style`; [SEC] enum + consent reject.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] Create **`neuramark_visual_preferences`** (SPEC name) — map story work-table `visual_preferences` columns: `client_id` (UNIQUE FK → `neuramark_clients`), mode/allowlist representation (CONTRACT), `generic_avatar_id` (nullable), `faceless_style` (jsonb), `updated_at` (+ trigger), optional `rules` jsonb for US-3.4 stub.
- [x] RLS: zero policies / deny-by-default (match profile pattern); access only via service-role server.
- [x] **Do not** create full `neuramark_avatar_consents` ledger here (US-3.2) — soft consent check may no-op/fail-closed against missing table.
- [x] **Do not** create `media_assets` here (US-3.3).
- [x] No writes of Preferencias onto `neuramark_business_profiles.fields`.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — S3.M4 Preferencias allowlist vs story single-mode wording; table name; no recording; no silent regenerate) — ALIGNED
- [x] SECURITY.md (security-architect — enum SEC; consent soft gate; IDOR; rules not client-writable) — APPROVE WITH CONDITIONS
- [x] CONTRACT.md authored (nextjs-backend) + FE signoff — Frozen, Reviewed by FE (2026-08-29)
- [x] BUILD (FE + BE + DB) — FE `c0caaee` · BE `6e2121c`
- [x] VALIDATION.md — PASS WITH NOTES
- [x] QA.md — APPROVE WITH CONDITIONS (0 Critical, 0 High, 1 Medium non-blocking, 5 Low; CLOSE can proceed)

**Status:** CLOSED (2026-08-29). All gates complete; AC checked in `plan/USER_STORIES.md`. Next recommended: **US-3.2**.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Allowlist (SPEC) vs single `visual_mode` (USER_STORIES)** — **Critical.** SPEC S3.M4 + CONTEXT: Preferencias = multi-selección allowlist; modality per Reel later. Story DB/AC language is singular `mode`. **PO lean:** implement allowlist; keep enum tokens; AC “three modes selectable” = Cliente can enable any of the three in Preferencias. Spec-guardian confirm ALIGNED without USER_STORIES rewrite, or require amendment.
2. **Table / column names** — SPEC `neuramark_visual_preferences` vs story `visual_preferences` + `mode`. **PO lean:** SPEC table name; CONTRACT freezes whether column is `allowed_modes text[]` / jsonb vs single `mode` (+ how “shown in settings” reads).
3. **Settings route** — No `/settings` exists today. **PO lean:** `/settings/preferences` under `(app)`. Alternate: section on dashboard. Confirm path + nav entry.
4. **`faceless_style` shape** — AC: voice + text + stock/B-roll. Enum options vs free text? **PO lean:** small structured jsonb with constrained enums where possible; CONTRACT freezes schema + Zod.
5. **Consent check before US-3.2** — How to prove [SEC] reject without ledger? **PO lean:** fail closed if consent table/row absent; helper `hasActiveAvatarConsent(clientId)` returns false until US-3.2 ships. SECURITY confirm (no false “consented” default).
6. **Prove “no silent regenerate”** — What evidence satisfies validator/QA? **PO lean:** Server Action contract forbids job calls; unit/integration test asserts no inserts into job/strategy tables and no calls to generation modules; FE has no “regenerate now” side effect on save.
7. **`generic_avatar_id` without catalog** — Always null in V1 of this story? **PO lean:** yes, nullable unused until later catalog story.
8. **`visualModeSummary` for agents** — Populate in same BUILD vs leave null until US-3.4/4.1? **PO lean:** populate minimal allowlist summary when row exists (helps US-4.1); omit consent.
9. **EN/ES copy** — Exact marketing lines for each modality + disable reasons. **PO lean:** FE drafts from CONTEXT labels + roadmap “no recording”; copy review not a SPEC block.
10. **Unavailable modes beyond consent** — Disable `own_avatar` also when zero reference assets (US-3.3 not done)? **PO lean:** V1 hard-disable only for missing consent; soft note that assets required before production (US-3.3), so selection can persist without assets.

No SPEC amendment assumed in PREP: S3.M4 already covers Preferencias, `neuramark_visual_preferences`, consent reject, no recording, no silent regenerate. Spec-guardian must resolve allowlist vs singular story wording (Q1).
