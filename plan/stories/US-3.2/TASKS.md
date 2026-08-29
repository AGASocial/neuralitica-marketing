# US-3.2 — Capture consent for own avatar

**Priority:** P0  
**Depends on:** US-3.1 ✅ CLOSED (`plan/stories/US-3.1/`) · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout) · Preferencias continuity (`upsertVisualPreferences` + soft gate → real ledger)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-3.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-frontend** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md`). DB migration under BE/DB. No content/media/integrations specialist for this story.  
**Canonical terms:** **Consentimiento de avatar** · **Avatar propio autorizado** · **Preferencias de producción visual** · **Cliente** / **Operator**. Technical tokens (`own_avatar`, table/column names) OK in code/DB only. Avoid CONTEXT _Evitar_ list in product-facing docs/copy (esp. “consent ledger” as product name).

## Out of scope (do not implement here)

- **US-3.3** reference asset upload / `media_assets` / serving routes / magic-byte MIME checks.
- **US-8.x / US-10.x video job cancel UI** — no queue screens, provider cancel UX, Operator review UI. SEC revoke→cancel queued own-avatar jobs + flag in-flight = **stub / design hook** only until job tables exist.
- Enqueueing video/TTS/strategy jobs from consent grant/revoke.
- Reopening US-2.2 Ficha viva PATCH to write consent; no consent toggles on `/profile` edit chrome.
- Changing Preferencias allowlist schema (US-3.1 CLOSED) beyond consuming hardened consent probe.
- Auth redesign; browser Supabase; public Route Handler with tenant ids.

## Scope split

| Concern | Owner |
|---------|--------|
| Preferencias UI + soft consent gate | **US-3.1** (done — keep; wire to real ledger) |
| Consentimiento grant / revoke / disclosure version / append-only ledger | **US-3.2** (this story) |
| Reference uploads | **US-3.3** |
| Generic disclosure / QA flags | **US-3.4** |
| Job create re-check + cancel queue (full) | **US-8.x / US-10.x** (stub here) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table name | **`neuramark_avatar_consents`** (story shorthand `avatar_consents` + `neuramark_` prefix). Columns: `client_id`, `consented_at`, `consent_version`, `revoked_at` (+ `id` PK). RLS deny-by-default; service-role Node only. |
| Append-only revoke | **Never UPDATE consent fields in place** except setting `revoked_at` on the active row (or equivalent CONTRACT pattern that preserves full audit trail). **Never DELETE** consent rows. Re-consent after revoke or disclosure change → **INSERT** new row with new `consented_at` (+ new `consent_version` when disclosure changed). |
| `consent_version` | **Server-owned constant** (e.g. `AVATAR_CONSENT_DISCLOSURE_V1` string) matching the disclosure text shipped in i18n/messages. Cliente cannot supply an arbitrary version. Changing disclosure copy requires bumping the constant → prior grants are inactive for “current version” purposes / require re-consent (CONTRACT freezes exact rule: active = non-revoked **and** version match current, vs non-revoked any version — **PO lean:** active = `revoked_at IS NULL` on latest row; version mismatch with current constant → treat as inactive for Preferencias/`own_avatar` until re-consent). |
| Grant / revoke surface | Prefer **Server Actions**, arity **0** or body with **no tenant id** (identity from `getCurrentUser().id` only). Grant requires explicit affirmative signal in body if needed (e.g. `{ affirmed: true }` + echoed `consentVersion` must match server constant) — CONTRACT freezes. Preferencias upsert **must not** grant/revoke. |
| UI placement | **PO lean:** Consentimiento UI **on Preferencias page** (`/settings/preferences`) — disclosure + grant/revoke + timestamp — so Avatar propio enablement and consent live together. Alternate (SECURITY/FE may veto): dedicated `/settings/avatar-consent`. Exact chrome freezes in CONTRACT. |
| Preferencias gate | Keep US-3.1 reject: `own_avatar` ∈ allowlist ⇒ `hasActiveAvatarConsent` must be true. Soft “table missing → false” remains valid fail-closed; after migration, probe reads real rows. |
| Video-job re-check stub | Export a small server helper (e.g. `assertActiveAvatarConsentForJob(clientId)` or document that job create **must** call `hasActiveAvatarConsent`) used later by US-8/US-10. In this story: unit-test the helper; **no** job table writes required. |
| Revoke → cancel queued jobs stub | On revoke success, call a stub `cancelQueuedOwnAvatarJobs(clientId)` that no-ops (or safely no-ops if `neuramark_video_jobs` absent) and is tested as invoked. Full cancel + Operator flag for in-flight = US-8/US-10. |
| Identity | `requireActive("page"|"handler")`; `WHERE client_id = $server`. Strip/reject browser `client_id`. |
| i18n | EN + ES; disclosure text is product-facing legal copy — versioned; enums never as primary UI labels. |
| XSS | Controlled copy / PrimeReact; no `dangerouslySetInnerHTML` for disclosure (render as text nodes / structured markup without raw HTML inject). |

## Carry-forwards / reuse (do not reinvent)

- **US-3.1 QA Medium (mandatory first BE work):** harden `hasActiveAvatarConsent` — filter `revoked_at IS NULL`, order by `consented_at` desc (or version), `.limit(1)` / `.maybeSingle()` on active subset; unit test multi-row + one active.
- Preferencias soft gate + `/settings/preferences` + `OWN_AVATAR_CONSENT_REQUIRED` error code — keep.
- Do **not** weaken US-2.2 strip of consent / Preferencias on Ficha viva PATCH.
- US-2.3: never dump consent ledger internals into `getBusinessProfileForAgents`.
- Migrations: `neuramark_` prefix; no ad-hoc SQL.
- Prefer PrimeReact for checkbox / buttons / form controls.

---

## FE checklist

Concrete BE consumers: Server Actions grant/revoke Consentimiento (CONTRACT names); RSC/loader returning consent status (+ timestamp, version) for settings; Preferencias page already consuming `ownAvatarConsentActive` / equivalent — refresh after grant/revoke.

- [x] **Consentimiento UI** (CONTRACT placement — PO lean: on `/settings/preferences`): disclosure text + explicit affirmative control (checkbox or equivalent); Grant action; Revoke action when active.
- [x] **Block Avatar propio** until active consent (continue US-3.1 disable pattern; refresh after grant so Cliente can then enable modality).
- [x] **Timestamp display** for current consent (`consented_at`); show version for audit if CONTRACT requires.
- [x] Loading / error / success states for grant + revoke; disable controls while in-flight.
- [x] EN + ES in `messages/en.json` / `es.json`. Canonical **Consentimiento de avatar** / **Avatar propio autorizado**; avoid CONTEXT _Evitar_ (no “consent ledger” product label).
- [x] No Supabase in Client Components; no `client_id` as identity in URL/body.
- [x] Do **not** build US-3.3 upload UI or US-8/US-10 job cancel UI.

---

## BE checklist

Concrete FE consumers: Preferencias / Consentimiento Client form(s) calling grant/revoke Server Actions; settings RSC loader for consent status.

- [ ] **FIRST — Harden `hasActiveAvatarConsent`** for append-only multi-row ledger: `revoked_at IS NULL`, order (`consented_at` desc), limit 1 / maybeSingle on active subset; fail closed on errors; unit test multi-row + one active (US-3.1 QA Medium). Apply before relying on grant/revoke in Preferencias gate.
- [ ] **Migration** for `neuramark_avatar_consents` (CONTRACT freezes columns/indexes/constraints).
- [ ] **Loader** (arity 0): own consent status (active?, `consented_at`, `consent_version`) by `getCurrentUser().id`.
- [ ] **Server Action grant** (CONTRACT name): `requireActive("handler")`; explicit affirmative only; server timestamp; store current `consent_version` constant; identity from session only; **no** side effect from Preferencias upsert.
- [ ] **Server Action revoke** (CONTRACT name): set `revoked_at` on active row (append-only rules); never delete; invoke **stub** `cancelQueuedOwnAvatarJobs` (no-op / safe if jobs table absent).
- [ ] **[SEC] Append-only:** no in-place mutation of historical consent fields; no DELETE; full audit trail preserved.
- [ ] **[SEC] Disclosure version:** store exact `consent_version` shown; bump constant ⇒ re-consent required per PO lean / CONTRACT.
- [ ] **[SEC] Video-job re-check stub:** helper that job creation will call (document + unit test); Preferencias gate continues to call hardened probe.
- [ ] **[SEC] Explicit grant only:** no endpoint/action sets consent as side effect of another operation (incl. Preferencias save).
- [ ] Parameterized queries; service-role Node only; never log unnecessary PII / full disclosure dumps in production logs.
- [ ] `revalidatePath` for Preferencias / consent surface after grant/revoke.
- [ ] Automated tests: grant → active; revoke → inactive + Preferencias `own_avatar` rejected; version stored; multi-row probe; foreign `client_id` ignored; Preferencias save does not grant; stub cancel invoked on revoke; fail-closed probe errors.

**AC mapping (for validator later):** Cannot select own avatar without consent; version string stored; revoke blocks new own-avatar; [SEC] append-only; [SEC] disclosure version; [SEC] job-time re-check (stub); [SEC] explicit grant only; [SEC] revoke immediate + cancel queued stub.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [ ] Create **`neuramark_avatar_consents`**: `client_id` (FK → `neuramark_clients`), `consented_at` (timestamptz, server-set), `consent_version` (text), `revoked_at` (nullable timestamptz), PK `id`. Index supporting active probe (e.g. `(client_id)` where `revoked_at IS NULL` — CONTRACT freezes).
- [ ] RLS: zero policies / deny-by-default; access only via service-role server.
- [ ] **Do not** create `media_assets` here (US-3.3).
- [ ] **Do not** create full `neuramark_video_jobs` cancel schema here unless already present — stub only.
- [ ] No writes of consent onto `neuramark_business_profiles.fields` or Preferencias row as authoritative cache.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — Consentimiento append-only; `neuramark_avatar_consents`; re-check en Job; revocación cancela cola; Preferencias reject without consent)
- [ ] SECURITY.md (security-architect — append-only; version; explicit grant; revoke cancel stub; IDOR; no browser Supabase)
- [ ] CONTRACT.md authored (nextjs-backend) + FE signoff
- [ ] BUILD (FE + BE + DB)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** PREP. AC in `plan/USER_STORIES.md` remain **unchecked**. Do not edit `docs/development/SPRINT-STATE.md` from this PREP write.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **UI placement** — Consentimiento on Preferencias (`/settings/preferences`) vs dedicated `/settings/avatar-consent`. **PO lean:** same page as Preferencias (grant/revoke + disclosure above or beside Avatar propio). Confirm with FE/SECURITY.
2. **Active = version match?** — Is active consent any non-revoked row, or must `consent_version` equal current constant? **PO lean:** latest non-revoked row must match current constant; else require re-consent (Preferencias treats as inactive).
3. **Grant Server Action arity** — Arity 0 vs body `{ affirmed: true, consentVersion }` echo. **PO lean:** body with `affirmed: true` + `consentVersion` must equal server constant (CSRF + mistaken grant guard); no `client_id`.
4. **Revoke mutation shape** — UPDATE `revoked_at` on the single active row vs INSERT a revoke event row. Story AC: “revocation sets `revoked_at` on the existing row.” **PO lean:** follow AC (UPDATE `revoked_at` only); no DELETE; other columns immutable.
5. **Re-consent after revoke** — Same disclosure version allowed as new INSERT? **PO lean:** yes (new row, new `consented_at`, same version OK); disclosure text change requires new version constant.
6. **Disclosure copy ownership** — Who authors legal EN/ES text? **PO lean:** FE drafts from CONTEXT + placeholder legal tone; product/legal review outside SPEC block; version string freezes in CONTRACT (`AVATAR_CONSENT_DISCLOSURE_V1`).
7. **Video-job stub depth** — Empty no-op vs throw “jobs not implemented” vs query-if-table-exists. **PO lean:** idempotent no-op when job table missing; when present later, cancel `queued` own-avatar for `client_id`. Prove invoke-on-revoke in unit test with mock.
8. **In-flight Operator flag** — AC mentions flagging in-flight provider jobs. **PO lean:** stub documents TODO for US-8/US-10; no Operator UI in 3.2.
9. **Preferencias allowlist after revoke** — Auto-strip `own_avatar` from Preferencias on revoke vs leave allowlist and only fail next upsert/job? **PO lean:** do **not** silently rewrite Preferencias on revoke; probe + upsert reject + UI disable suffice; optional soft warning in UI that allowlist still lists Avatar propio until Cliente edits (CONTRACT may choose auto-strip — escalate if SECURITY prefers fail-closed store).
10. **Multiple concurrent active rows** — Should DB constrain at most one `revoked_at IS NULL` per `client_id`? **PO lean:** partial unique index on `client_id` WHERE `revoked_at IS NULL` (SECURITY/DB confirm).
11. **Timestamp timezone / display** — Server UTC store; FE locale format. **PO lean:** yes; CONTRACT freezes ISO string in loader DTO.

No SPEC amendment assumed in PREP: SPEC §3 already covers Consentimiento grant/revoke, append-only, Job re-check, revocación cancela cola. Spec-guardian confirms ALIGNED vs story AC wording.
