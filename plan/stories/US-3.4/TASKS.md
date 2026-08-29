# US-3.4 — Enforce generic avatar representation rules

**Priority:** P0  
**Depends on:** US-3.1 ✅ CLOSED (`plan/stories/US-3.1/`) · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout) · US-2.3 ✅ (`getBusinessProfileForAgents` / `visualModeSummary`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-3.4 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-frontend** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md`). QA check stub authored under BE; **content-agents-engineer** consumes DTO flag in US-5.1 / US-10.1 — not required for 3.4 BUILD unless CONTRACT expands. No DB specialist unless migration amends `rules` constraint.  
**Canonical terms:** **Avatar genérico profesional** · **Preferencias de producción visual** · **Cliente** / **Operator** · **disclosure**. Technical tokens (`generic_avatar`, `must_disclose_not_owner`, table/column names) OK in code/DB only. Avoid CONTEXT _Evitar_ list in product-facing docs/copy.

## Out of scope (do not implement here)

- **Full US-10.1** QA agent job, LLM pass, `neuramark_qa_reports` persistence, Operator QA report panel.
- **Full US-11.1** client approval screen, video package loader, approve/reject Server Actions, mobile approval flow.
- **US-10.2** override modal, `qa_overrides` table, override handler 403 logic (stub **classification constant** only).
- **Per-slot Modalidad de producción** assignment (US-4.x) — allowlist-level rule is V1 proxy.
- Reopening US-3.1 Preferencias upsert schema, allowlist enum, or consent gates.
- Generic avatar catalog UX / non-null `generic_avatar_id`.
- Auth redesign; browser Supabase; client-writable `rules` / `mustDiscloseNotOwner`.

## Scope split

| Concern | Owner |
|---------|--------|
| Preferencias allowlist + `rules` derivation on upsert | **US-3.1** (done — harden/read-back in 3.4) |
| Preferencias warning copy | **US-3.4** (this story — polish) |
| Agents DTO disclosure flag | **US-3.4** (this story) |
| QA impersonation check (full agent) | **US-10.1** (stub export in 3.4) |
| Approval disclosure line (full UI) | **US-11.1** (preview stub in 3.4) |
| Script agent prompt injection (full) | **US-5.1** (consumes DTO from 3.4) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Rule trigger (V1) | **`generic_avatar` ∈ `allowed_modes`** ⇒ `rules.must_disclose_not_owner = true`; else `false`. Same as US-3.1 `deriveVisualPreferencesRules`. Per-slot re-evaluation deferred to US-4.x — agents treat DTO flag as “Cliente accepts generic modality.” |
| Client writability | **`rules` / `must_disclose_not_owner` remain FORBIDDEN** on upsert (US-3.1 strip list). Any endpoint accepting these keys → reject. |
| Agents DTO widen | **PO lean:** extend `visualModeSummary` to `{ allowedModes, mustDiscloseNotOwner: boolean }` (camelCase in TS DTO; DB stays snake_case). Derive from stored `rules` or recompute from allowlist — **must match** persisted row. Omit consent / asset internals. |
| QA check stub | Export server function e.g. `evaluateGenericAvatarNotOwnerCheck(input: { mustDiscloseNotOwner: boolean; scriptText: string; ownerDisplayName?: string })` → `{ checkKey, status: 'pass' \| 'fail', severity: 'blocking', evidence? }`. Register `checkKey = 'generic_avatar_not_owner'` (CONTRACT freezes). **Classification:** `blocking` — document in stub + SECURITY; US-10.2 enforces non-overridable. |
| Check logic (V1 stub) | **PO lean:** when `mustDiscloseNotOwner === false` → pass (check N/A). When true → fail if script contains first-person owner claims heuristic (CONTRACT freezes patterns: e.g. “I am {owner}”, “I'm the owner”, “soy el dueño”, “yo soy {name}” from profile) **without** adjacent disclosure phrase; pass if disclosure phrase present. Full LLM QA deferred to US-10.1 — stub uses deterministic rules + unit fixtures. |
| Disclosure preview stub | Reusable **server-only or shared** i18n strings under e.g. `preferences.disclosurePreview` + FE component `GenericAvatarDisclosurePreview` (props: `visible: boolean`, optional `variant: 'preferences' \| 'approval'`). Renders canonical line: EN *“This video uses an AI presenter who is not the business owner.”* / ES equivalent. **PO lean:** mount stub on dev-only dashboard card or isolated `(app)/settings/preferences` subsection — **not** full US-11.1 page. |
| Preferencias FE warning | Upgrade generic-mode banner: show when `draftModes.includes('generic_avatar')` **or** `server.rules.must_disclose_not_owner`; severity **warn** (PrimeReact `Message`) when generic selected; keep EN/ES copy aligned with disclosure preview. |
| DB changes | **PO lean:** **no migration** — `rules` jsonb already on `neuramark_visual_preferences`. Optional one-time repair script **out of scope** unless corrupt rows found in BUILD. |
| Identity | Preferencias paths: `requireActive("page"|"handler")`; agents helper: trusted `clientId` from job context only. |
| i18n | EN + ES for warning, disclosure preview, QA check evidence strings (internal). |

## Carry-forwards / reuse (do not reinvent)

- **`deriveVisualPreferencesRules`** — keep single source of truth; upsert + read paths must call it or validate stored `rules` matches derivation.
- US-3.1 FORBIDDEN keys + tests — extend, do not weaken.
- **`getBusinessProfileForAgents`** — widen loader + mapper + Zod schema + tests (US-2.3 / US-3.1 patterns).
- SECURITY_BASELINE #7 — blocking legal class for impersonation; reference in SECURITY.md.
- Prefer PrimeReact `Message` on Preferencias (existing `PreferencesEditor` pattern).

---

## FE checklist

Concrete BE consumers: Preferencias loader (existing — includes `rules`); optional loader/helper for disclosure preview text; no new mutation endpoints expected.

- [x] **Generic-mode warning** on `/settings/preferences`: when **Avatar genérico profesional** selected, show prominent warning (PO lean: `severity="warn"`) with EN/ES copy explaining scripts/videos must disclose presenter is not the owner.
- [x] Keep warning visible while generic is in draft selection **or** persisted server rules say `must_disclose_not_owner`.
- [x] **`GenericAvatarDisclosurePreview` stub component**: renders approval-style disclosure line when `visible={true}`; uses shared i18n keys with Preferencias warning; no video player / approve actions.
- [x] **Mount preview stub** where Operator approval UI does not exist — PO lean: bottom of Preferencias page under generic section **or** commented dev-only import on dashboard placeholder — CONTRACT freezes placement.
- [x] EN + ES in `messages/en.json` / `es.json` (`disclosureNote` polish + new `disclosurePreview.*` keys). Canonical product terms; avoid CONTEXT _Evitar_.
- [x] No Supabase in Client Components; no client write of `rules` / `mustDiscloseNotOwner`.
- [x] Do **not** build US-10.1 QA panel, US-11.1 full approval screen, or US-10.2 override modal.

**AC satisfied by FE (for validator):** Warning copy on generic mode; disclosure preview stub when applicable; EN/ES. Server rule + QA stub remain BE.

---

## BE checklist

Concrete FE consumers: Preferencias loader (unchanged shape + rules); disclosure text helper for preview component; agents DTO consumers (US-5.1 / US-10.1 — soft same-BUILD tests only).

- [ ] **Verify enforce** `must_disclose_not_owner` on upsert path: persisted `rules` always equals `deriveVisualPreferencesRules(allowed_modes)`; add/extend tests for toggle generic on/off.
- [ ] **Read paths:** Preferencias SELECT + mapper surface `rules.must_disclose_not_owner` consistently; reject/handle corrupt `rules` jsonb as `loadFailed` (existing pattern).
- [ ] **Widen `getBusinessProfileForAgents`:** include `mustDiscloseNotOwner` in `visualModeSummary` when Preferencias row exists; `null` summary when no row; update Zod `.strict()` agent schema + unit tests.
- [ ] **[SEC] Flag not client-writable:** extend tests — any upsert body with `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` → `FORBIDDEN_FIELDS` / validation reject (US-3.1 continuity).
- [ ] **Export QA check stub** e.g. `lib/qa/checks/generic-avatar-not-owner.ts`: deterministic evaluator + `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` + `QA_CHECK_SEVERITY.blocking` constant for US-10.1 import.
- [ ] **Unit tests** for QA stub: pass when flag false; fail when flag true + owner-claim phrases; pass when flag true + disclosure phrase present; ES fixture strings.
- [ ] **Optional:** `getGenericAvatarDisclosurePreviewText(locale)` server helper returning i18n key or string for FE preview — CONTRACT freezes.
- [ ] Document US-10.1 / US-5.1 integration point in module header (MUST-import comment pattern from US-2.3).
- [ ] Do **not** invoke LLM; do **not** write `neuramark_qa_reports`; do **not** build approval package API.

**AC mapping (for validator later):** Generic mode sets flag (persist + DTO); QA stub fails owner-claim scripts when flag true; `[SEC]` server-side only; `[SEC]` blocking class stub for US-10.1.

---

## DB checklist

All objects keep `neuramark_` prefix. **PO lean: no migration in V1.**

- [ ] **Use existing** `neuramark_visual_preferences.rules` jsonb — `{ must_disclose_not_owner: boolean }` strict shape (US-3.1).
- [ ] **Do not** add columns for disclosure text version (unlike Consentimiento) unless SECURITY mandates — **PO lean:** static i18n V1; legal copy bump = i18n + process, not DB version column.
- [ ] **Do not** create `neuramark_qa_reports` or approval tables.
- [ ] RLS unchanged — deny-by-default; service-role Node only.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — allowlist-level rule V1; stubs only for QA/approval; no US-10.1/US-11.1 scope creep)
- [ ] SECURITY.md (security-architect — server-owned flag; blocking class; no client bypass; disclosure copy XSS bar)
- [x] CONTRACT.md authored (nextjs-backend) + FE signoff — Reviewed by FE: yes 2026-08-29
- [ ] BUILD (FE + BE)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** PREP (2026-08-29). Gates unchecked. Next: SPEC-REVIEW → SECURITY → CONTRACT.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Allowlist vs per-slot trigger** — SPEC says `must_disclose_not_owner` when **slot uses generic**; US-3.1 derives when **`generic_avatar` ∈ allowlist**. **PO lean:** keep allowlist-level flag in 3.4; US-4.x slot assignment passes per-job flag into agents/QA; DTO flag means “Cliente permits generic modality.” Amend USER_STORIES wording if spec-guardian requires explicit V1 proxy note.
2. **Agents DTO field name** — `visualModeSummary.mustDiscloseNotOwner` vs nested `visualModeSummary.rules.must_disclose_not_owner` vs top-level agent DTO field. **PO lean:** flat boolean on `visualModeSummary` for prompt ergonomics; snake_case only in DB/jsonb.
3. **QA stub strictness** — Deterministic phrase list only vs optional lightweight LLM in 3.4. **PO lean:** deterministic only; US-10.1 adds LLM layer importing same check key + blocking class.
4. **Owner-claim heuristics** — Which phrases fail? Use profile `fields` owner name from Ficha viva in matcher? **PO lean:** fixed phrase list EN/ES + optional match on profile display name when available to agent caller; CONTRACT freezes minimal set + fixtures.
5. **Disclosure “pass” phrases** — What counts as sufficient disclosure in script/on-screen text? **PO lean:** whitelist e.g. “not the business owner”, “AI presenter”, “presentador no es el dueño”, “presentador de IA” — CONTRACT freezes; legal review async.
6. **Disclosure preview placement** — Preferencias footer vs dashboard dev card vs `(app)/dev/disclosure-preview` route. **PO lean:** Preferencias subsection below generic card (Cliente-visible continuity); SECURITY confirm no confusion with final approval UI.
7. **Preferencias warning severity** — `info` (current) vs `warn` when generic selected. **PO lean:** `warn` when `generic_avatar` checked; `info` when only persisted server rule (edge: deselect in draft but not saved).
8. **Corrupt `rules` row repair** — Fail closed `loadFailed` vs server-side re-derive on read. **PO lean:** re-derive on read for display + upsert next save fixes persist; log anomaly; no migration.
9. **i18n key structure** — Split `preferences.disclosureNote` vs new `preferences.disclosurePreview.approvalLine` vs shared `legal.genericAvatarDisclosure`. **PO lean:** shared `legal.genericAvatarDisclosure` consumed by Preferencias warning + preview stub + future US-11.1.
10. **QA check export surface** — Single function vs `{ checkKey, evaluate, severity, descriptionKey }` registry entry for US-10.1 catalog. **PO lean:** export function + constants; registry table in US-10.1.
11. **Script agent instruction injection (US-5.1)** — Document in CONTRACT as consumer obligation vs soft helper `buildGenericDisclosurePromptHint(mustDiscloseNotOwner)` in 3.4. **PO lean:** export small string helper in 3.4 for US-5.1 import; no script generation here.
12. **Blocking class constant location** — `lib/qa/check-classes.ts` shared with US-10.2 vs QA stub module only. **PO lean:** shared `lib/qa/check-classes.ts` with `blocking` \| `overridable` enum; US-10.2 imports same module.

No SPEC amendment assumed in PREP: SPEC §3 S3.M4 + script generation already reference `must_disclose_not_owner` and generic disclosure. Spec-guardian confirms V1 = allowlist proxy + stubs, not full QA/approval modules.
