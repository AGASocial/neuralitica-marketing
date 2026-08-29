# Security Design Review — US-3.4

**Story:** US-3.4 — Enforce generic avatar representation rules  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-3.4 `[SEC]` + AC), `plan/SECURITY_BASELINE.md` §7 (non-overridable legal class), `plan/stories/US-3.1/SECURITY.md` + `CONTRACT.md` (`deriveVisualPreferencesRules`, FORBIDDEN strip list), `plan/stories/US-3.2/SECURITY.md` (blocking-class continuity), `plan/stories/US-2.3/SECURITY.md` (agents DTO floors), `plan/stories/US-3.4/README.md`, `TASKS.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: **harden and wire** the US-3.1 server-owned `rules.must_disclose_not_owner` stub — verify upsert derivation, consistent read-back, and drift handling; **extend** `getBusinessProfileForAgents.visualModeSummary` with a server-derived `mustDiscloseNotOwner` boolean for Script/QA consumers; **export** a deterministic `generic_avatar_not_owner` QA check stub classified **`blocking`** (same non-overridable legal family as missing consent per SECURITY_BASELINE #7); surface **Cliente warning copy** and a **disclosure preview stub** on Preferencias (approval full UI stays US-11.1). V1 rule trigger remains **allowlist proxy** (`generic_avatar` ∈ `allowed_modes`) until US-4.x per-slot Modalidad de producción.

No REDESIGN. No veto of PO leans on: no DB migration; flat `mustDiscloseNotOwner` on `visualModeSummary`; deterministic QA stub only (no LLM in 3.4); shared `lib/qa/check-classes.ts`; Preferencias subsection for disclosure preview stub; re-derive on read when stored `rules` drifts. Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-1.x / US-2.2 / US-2.3 / US-3.1 / US-3.2 / US-14.5 — do not weaken):** identity only via `getCurrentUser()` / `requireActive()`; strip/reject browser `client_id`; `rules` / `must_disclose_not_owner` / `mustDiscloseNotOwner` remain **FORBIDDEN** on Preferencias upsert (US-3.1); Ficha viva PATCH still rejects Preferencias / `visual_mode` / consent / rules keys (US-2.2); `getBusinessProfileForAgents` remains `import "server-only"` and must **omit consent ledger internals** (US-2.3); parameterized SQL; no `@supabase/supabase-js` in Client Components; disclosure / warning copy as React text nodes only (no `dangerouslySetInnerHTML`); gated settings off `isPublicPath` with `Cache-Control: no-store`.

**This story owns:** Harden server-owned `must_disclose_not_owner` on read/write paths; widen agents `visualModeSummary`; export QA check stub + `blocking` classification constant; Preferencias warning + disclosure preview stub (EN/ES); unit tests for derivation, FORBIDDEN strip, DTO flag, QA stub fixtures.

**This story does not own:** Full US-10.1 QA agent job / `neuramark_qa_reports`; full US-11.1 approval screen / approve-reject Actions; US-10.2 override handler 403 logic (classification **constant export only**); US-5.1 script generation / LLM prompt wiring (consumes DTO); per-slot Modalidad de producción (US-4.x); Preferencias allowlist schema reopen; US-3.2 consent ledger; US-3.3 uploads; generic avatar catalog; auth redesign; browser Supabase.

**Terminology:** **Avatar genérico profesional** · **Preferencias de producción visual** · **Cliente** · **Operator** · **disclosure** (presenter is not the business owner). Enums `generic_avatar`, `must_disclose_not_owner` OK in code/DB only — never primary UI headlines. Do not use CONTEXT _Evitar_ terms (esp. “impersonation” in Cliente copy — prefer “presenter is not the owner”). Do not use “consent ledger” as a product label.

---

### Threat Summary (US-3.4–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Client clears or forges `must_disclose_not_owner`** | Generic avatar presented as owner; legal/trust exposure (SECURITY_BASELINE highest class) | `rules` jsonb **server-derived only** via `deriveVisualPreferencesRules(allowed_modes)` on upsert. FORBIDDEN strip: `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` (+ `rules.*` nested if ever accepted). No endpoint accepts client-writable rules JSON |
| **Stored `rules` drift / corrupt jsonb** | Agents or UI trust `false` while `generic_avatar` remains in allowlist | **Authority = allowlist membership** through `deriveVisualPreferencesRules`. On read/agents DTO: compute `mustDiscloseNotOwner` from `allowed_modes`; if stored `rules` mismatches derivation, **prefer derivation** (fail toward disclosure when generic ∈ allowlist); log anomaly; next upsert repairs persist |
| **Agents consume client-supplied rule flags** | Script/QA skip disclosure when job payload smuggles `mustDiscloseNotOwner: false` | `getBusinessProfileForAgents` loads Preferencias server-side; DTO flag derived from DB allowlist/rules — **never** from request body, job client JSON, or LLM output. US-5.1 / US-10.1 must inject flags from this helper only |
| **QA impersonation check overridable** | Operator override publishes misleading generic-avatar content | Export check with `severity: 'blocking'` and frozen `checkKey`; register in shared `lib/qa/check-classes.ts` alongside future `overridable`. US-10.2 will reject override for `blocking` — 3.4 ships **constant + stub evaluator only** |
| **Bypass via Ficha viva PATCH or new write surface** | Set disclosure flags outside Preferencias SEC | Do not reopen US-2.2 PATCH allowlist. No new Route Handler / Action that accepts `rules` or disclosure flags from browser |
| **False negative in QA stub (owner-claim scripts pass)** | Misleading content reaches approval/publish | Deterministic stub fails on CONTRACT-frozen owner-claim heuristics when `mustDiscloseNotOwner === true`; pass only when disclosure whitelist phrases present or flag false (check N/A). Full LLM QA deferred to US-10.1 importing same `checkKey` + class |
| **False positive flooding (blocking everything)** | Production blocked on benign copy | Stub is **narrow**: fixed phrase lists EN/ES + optional profile display-name match; disclosure pass whitelist frozen in CONTRACT; unit fixtures for pass/fail |
| **Over-exposure in agents DTO** | Leak raw `rules` jsonb, consent, or foreign prefs | `visualModeSummary` = `{ allowedModes, mustDiscloseNotOwner }` only — flat boolean; **omit** consent internals; do not expose full `rules` object to prompts unless CONTRACT explicitly needs (PO lean: flat boolean only) |
| **XSS on warning / disclosure preview** | Script via disclosure copy | i18n / trusted strings; React text nodes; **no** `dangerouslySetInnerHTML`; no client-authored disclosure HTML |
| **IDOR via `client_id` on Preferencias / agents path** | Read another Cliente’s disclosure flag | Preferencias loader + upsert: arity 0 / session `user.id` only. Agents helper: `clientId` from **trusted server/job context** only — never browser body/query |
| **UI-only disclosure (no server flag)** | Cliente sees warning but agents generate owner-claim scripts | Warning is **not** authority; persisted derivation + DTO flag are. Tests prove generic ∈ allowlist ⇒ `must_disclose_not_owner: true` in DB + DTO |
| **Per-slot modality gap (V1 proxy)** | Disclosure required only when slot uses generic but allowlist includes generic | **Accepted residual risk** until US-4.x: allowlist-level flag is conservative (may require disclosure when generic is allowed but slot is faceless). US-4.x must pass per-job modality into agents/QA without trusting client |

**Residual risk accepted:** V1 trigger is allowlist-level, not per-slot (SPEC ideal deferred to US-4.x) — conservative for legal safety. QA stub is heuristic, not LLM-complete — US-10.1 adds LLM layer on same `checkKey`. Full override rejection ships US-10.2 — 3.4 exports classification only. Disclosure preview on Preferencias is **not** the final approval gate (US-11.1). Hardcoded local user via `getCurrentUser()` until auth stories land is sanctioned, not a finding. Legal review of EN/ES disclosure strings is outside this gate.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_visual_preferences.rules` / `must_disclose_not_owner` | **Highest** — legal disclosure obligation | **Server-derived only** on upsert via `deriveVisualPreferencesRules`; never client write authority |
| `allowed_modes` allowlist | High — drives derivation input | Client may select modes (US-3.1 SEC); server validates enum; derivation recomputed server-side |
| `visualModeSummary.mustDiscloseNotOwner` (agents) | **Highest** — injected into Script/QA prompts | Server-only `getBusinessProfileForAgents`; derived from allowlist/rules; never request input |
| QA check stub (`generic_avatar_not_owner`) | **Highest** — publish gate precursor | Server-only module; `blocking` class in code; not editable via API/DB |
| `lib/qa/check-classes.ts` | High — override policy seam for US-10.2 | Code/config only; `blocking` \| `overridable` — not data-editable |
| Preferencias warning + disclosure preview UI | Medium–High — Cliente-facing legal copy | `(app)` + `requireActive` + `no-store`; read-only display of server state |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()` / `requireActive` (Preferencias) or trusted job context (agents) |
| Session cookie (`sb-*`) | High — US-14.5 | Unchanged; CSRF via Server Action on Preferencias upsert |
| Service-role key | Critical | Node only. Never Client Components |

**Boundaries:**

1. **Browser → Preferencias Server Action** — Untrusted body: allowlist + `faceless_style` only (US-3.1). **No** `rules` / `mustDiscloseNotOwner`. Upsert always persists `rules = deriveVisualPreferencesRules(allowed_modes)`.
2. **Browser → Preferencias RSC / Client form** — Read-only `rules` in loader DTO for display/warning. Client Components **must not** POST rules back. Warning reflects draft selection **and** server `rules` — display only.
3. **Next.js → Postgres (`neuramark_visual_preferences`)** — Parameterized upsert/`SELECT` where `client_id = $server`. Service-role Node; RLS deny-by-default unchanged.
4. **Trusted server/job → `getBusinessProfileForAgents(clientId)`** — `clientId` from job orchestration only. Loads allowlist + derives `mustDiscloseNotOwner`. **No** browser-supplied rule flags.
5. **Script/QA modules (US-5.1 / US-10.1 consumers)** — Import QA stub + read DTO flag from agents helper. **No** parallel client-writable rule channel.
6. **US-2.2 PATCH / consent Actions** — Remain rules-blind; do not reopen.
7. **US-10.2 override handler (future)** — Must import same `blocking` constant; reject override for `generic_avatar_not_owner` — not implemented in 3.4.

---

## Abuse Cases Considered

- *As a malicious actor, I can POST `{ allowedModes: ["generic_avatar"], rules: { must_disclose_not_owner: false } }` or `mustDiscloseNotOwner: false` on Preferencias upsert* → **Blocked:** FORBIDDEN_FIELDS / Zod `.strict()` reject before write; server derives `true` from allowlist regardless.
- *As a malicious actor, I can PATCH Ficha viva with `must_disclose_not_owner` or `rules` to disable disclosure* → **Blocked:** US-2.2 PATCH allowlist unchanged; Preferencias/rules keys rejected.
- *As a malicious actor, I can call a new API with `{ mustDiscloseNotOwner: false }` to steer script generation* → **Blocked:** no new client-writable endpoint; agents helper ignores request rule flags; US-5.1 must use server profile only.
- *As a malicious actor, I can tamper with stored `rules` jsonb directly (DB access) while keeping `generic_avatar` in allowlist* → **Contained:** agents DTO and read display re-derive from `allowed_modes` (prefer derivation on mismatch); upsert repairs on next save; anomaly logged. Fail toward `mustDiscloseNotOwner: true` when generic ∈ allowlist.
- *As a malicious actor, I can pass `client_id` to read another Cliente’s disclosure requirement* → **Blocked:** session-bound Preferencias; agents `clientId` only from trusted server context.
- *As a malicious actor, I rely on UI warning only and omit disclosure in generated script* → **Blocked (stub):** QA check fails owner-claim heuristics when flag true; Script agent obligation documented for US-5.1 via DTO flag.
- *As an Operator, I can override the generic-avatar impersonation QA failure before US-10.2 ships* → **Out of scope for 3.4 BUILD** — no override UI/handler here. Classification `blocking` exported so US-10.2 cannot accidentally treat as overridable.
- *As a malicious actor, I inject HTML in disclosure preview via manipulated i18n or user input* → **Blocked:** copy from trusted i18n keys only; React text nodes; no user HTML in disclosure strings.
- *As a malicious actor, I select generic in UI draft but persist faceless-only allowlist and expect agents to still think disclosure required* → **Blocked:** authority is **persisted** allowlist + derived rules after save; draft-only selection does not affect DTO until upsert succeeds.
- *As a malicious actor, I import `getBusinessProfileForAgents` in a Client Component* → **Blocked:** `import "server-only"`; distinct from Cliente Preferencias loader.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-3.4 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**US-3.4 story `[SEC]` (existing):**

- [ ] **[SEC] `must_disclose_not_owner` is set server-side as a consequence of mode selection and is not client-writable through any endpoint**
- [ ] **[SEC] The impersonation check in QA (US-10.1) is classified as a non-overridable legal block, same class as missing consent (US-10.2)**

**Added in this review:**

- [ ] **[SEC] (added) `rules` jsonb is never client-writable:** Preferencias upsert continues to reject `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner`, and any `rules.*` nested keys (extend US-3.1 FORBIDDEN list if nested paths are ever parsed). Persisted `rules` on every successful upsert **must equal** `deriveVisualPreferencesRules(allowed_modes)` exactly (`{ must_disclose_not_owner: boolean }` strict shape)
- [ ] **[SEC] (added) Derivation authority on read:** `mustDiscloseNotOwner` exposed to UI loaders and `getBusinessProfileForAgents` **must be computed from `allowed_modes` via `deriveVisualPreferencesRules`** (or validated equal to stored `rules`; on mismatch when `generic_avatar` ∈ allowlist, **must expose `true`** and log anomaly — never fail open to `false`)
- [ ] **[SEC] (added) Agents DTO injection only:** `visualModeSummary.mustDiscloseNotOwner` is populated server-side when a Preferencias row exists; `null` summary when no row. Script/QA/job modules **must not** accept rule flags from HTTP request bodies, webhook payloads, or unvalidated LLM JSON — only from `getBusinessProfileForAgents` (or server re-call to `deriveVisualPreferencesRules` on trusted allowlist)
- [ ] **[SEC] (added) QA stub exports frozen `checkKey` + `blocking` severity:** e.g. `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY = 'generic_avatar_not_owner'` and `QA_CHECK_SEVERITY.blocking` from shared `lib/qa/check-classes.ts`. Stub evaluator is deterministic (no LLM). US-10.1 **must** import this key/class — no duplicate ad-hoc severity strings
- [ ] **[SEC] (added) No new client write surface for disclosure flags:** Do not add PATCH/POST/Route Handler that accepts `rules`, `must_disclose_not_owner`, or `mustDiscloseNotOwner` from the browser. Disclosure preview stub is read-only display
- [ ] **[SEC] (added) Ficha viva PATCH remains rules-blind:** Do not add `rules` / disclosure keys to US-2.2 allowlist (continuity re-assert)
- [ ] **[SEC] (added) XSS bar on disclosure copy:** Warning, `disclosureNote`, and disclosure preview strings render as React text / i18n only — **no** `dangerouslySetInnerHTML`; no client-supplied HTML in disclosure components
- [ ] **[SEC] (added) IDOR continuity:** Preferencias upsert/loader arity 0 (session identity). Agents helper `clientId` parameter only from trusted server callers — never from browser query/body as authority
- [ ] **[SEC] (added) Automated tests (security-relevant):** (1) upsert with forbidden `rules` / `mustDiscloseNotOwner` keys → reject, no write; (2) toggle `generic_avatar` on/off → persisted `rules` matches derivation; (3) DTO `mustDiscloseNotOwner` tracks allowlist; (4) QA stub pass when flag false; fail on owner-claim when flag true; pass with disclosure phrase; (5) `blocking` class constant exported and referenced by stub

**Inherited (still binding — do not weaken):**

- [ ] **[SEC] Preferencias modality values validated server-side; `own_avatar` rejected without active consent** (US-3.1)
- [ ] **[SEC] PATCH accepts explicit allowlist; consent / visual_mode / rules cannot be modified via Ficha viva** (US-2.2)
- [ ] **[SEC] `getBusinessProfileForAgents` is server-only; output excludes consent ledger internals** (US-2.3)
- [ ] **[SEC] Free-text / preference strings stored as data and rendered escaped** (US-3.1 / baseline)

---

## Design Concerns and Required Changes

### Required before BUILD (freeze in CONTRACT)

1. **Single derivation function:** `deriveVisualPreferencesRules(allowed_modes)` remains the **only** write authority for `rules`. Upsert, tests, and documentation must not duplicate logic inline.
2. **FORBIDDEN strip list (extend, never weaken):** `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` on Preferencias upsert; case-insensitive; reject before Zod (US-3.1 pattern).
3. **Agents DTO shape:** `visualModeSummary: { allowedModes, mustDiscloseNotOwner: boolean } | null` — camelCase in TS; snake_case in DB/jsonb only. Update Zod `.strict()` schema + tests.
4. **Read-path drift handling:** When stored `rules.must_disclose_not_owner !== deriveVisualPreferencesRules(allowed_modes).must_disclose_not_owner`, loaders and agents mapper **use derived value** for `mustDiscloseNotOwner` when serving; log `[preferences] rules drift`; do not expose `false` to agents when generic ∈ allowlist.
5. **QA module layout:** `lib/qa/check-classes.ts` exports `QA_CHECK_SEVERITY` (`blocking` | `overridable`). `lib/qa/checks/generic-avatar-not-owner.ts` exports evaluator + `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY`. Severity **must** be `blocking`.
6. **QA stub contract:** Input `{ mustDiscloseNotOwner, scriptText, ownerDisplayName? }`. When `mustDiscloseNotOwner === false` → `pass` (N/A). When `true` → fail on owner-claim patterns without adjacent disclosure whitelist phrase. CONTRACT freezes minimal EN/ES phrase lists + fixtures.
7. **No LLM in 3.4 QA path:** Deterministic evaluator only. US-10.1 may wrap with LLM but **must** preserve `checkKey` and `blocking` class.
8. **Disclosure preview stub:** Read-only; `visible` prop driven by server state / generic selection; placement frozen in CONTRACT (PO lean: Preferencias subsection). Label must not imply final Operator approval (US-11.1).
9. **No DB migration** unless SECURITY finds unchecked jsonb shape — PO lean approved: enforce strict `{ must_disclose_not_owner: boolean }` in server parse; corrupt → `loadFailed` or re-derive per CONTRACT.
10. **No new packages** without justification. No browser Supabase. No `neuramark_qa_reports` / approval tables / override handler in this story.

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Accept client-writable `rules`, `must_disclose_not_owner`, or `mustDiscloseNotOwner` on any endpoint | **REJECT** |
| Trust stored `rules` alone when it disagrees with allowlist and exposes `mustDiscloseNotOwner: false` while `generic_avatar` ∈ allowlist | **REJECT** |
| Populate agents DTO rule flags from request body, job client JSON, or LLM output without server profile | **REJECT** |
| Ship QA stub with `overridable` severity or ad-hoc string not imported by US-10.2-bound module | **REJECT** |
| Add `rules` / disclosure keys to Ficha viva PATCH allowlist | **REJECT** |
| Expose full consent ledger or raw `rules` jsonb in agents DTO beyond flat boolean | **REJECT** (unless CONTRACT explicitly widens with SECURITY sign-off — PO lean rejects) |
| Render disclosure via `dangerouslySetInnerHTML` | **REJECT** |
| Build US-10.1 QA job, US-10.2 override handler, US-11.1 approval screen, or per-slot modality under this story | **REJECT** (siblings) |
| Reopen US-3.1 allowlist schema / consent gates for “convenience” | **REJECT** |
| Put `@supabase/supabase-js` or service-role in Client Components | **REJECT** |
| Add public Route Handler that returns or mutates disclosure flags by tenant id | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-4.x per-slot Modalidad:** When slot-level generic assignment lands, agents/QA must accept a **per-job** `mustDiscloseNotOwner` derived from slot modality (server-side), not browser input. Allowlist-level DTO flag remains “Cliente permits generic modality” until then. Do not remove allowlist derivation — compose with slot flag (logical AND or slot overrides).
- **US-5.1 Script agent:** Must read `visualModeSummary.mustDiscloseNotOwner` from `getBusinessProfileForAgents` and inject disclosure obligations into prompts — never from script request payload. Optional `buildGenericDisclosurePromptHint` export is server-only.
- **US-10.1 QA agent:** Must import `evaluateGenericAvatarNotOwnerCheck` (CONTRACT name) + `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` + `QA_CHECK_SEVERITY.blocking`. LLM layer may add checks but cannot downgrade this check to overridable.
- **US-10.2 override handler:** Must reject override requests when any failed check has `severity === 'blocking'`, including `generic_avatar_not_owner` and missing/revoked consent — **403** regardless of Operator UI. Import shared `check-classes` module from 3.4.
- **US-11.1 approval UI:** Reuse disclosure preview i18n keys / server helper; approval gate re-checks QA state server-side (future story).
- **Multi-tenancy / RLS:** deny-by-default + server `client_id` remains IDOR defense; disclosure flags are never a separate tenant-scoped write API.
- **Do not** later add a “Cliente opts out of disclosure” toggle — legal class is non-negotiable when generic modality is in use.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-3.4/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Reuse `deriveVisualPreferencesRules`; upsert persists exact derived `rules`; no client `rules` in input schema
- [ ] FORBIDDEN strip list documented (extend US-3.1); nested `rules.*` rejected if applicable
- [ ] Read paths: loader + mapper surface `rules.must_disclose_not_owner`; drift → derive for display/DTO + log
- [ ] `visualModeSummary` Zod widen: `{ allowedModes, mustDiscloseNotOwner }`; `.strict()`; null when no row
- [ ] `getBusinessProfileForAgents` loads allowlist + sets `mustDiscloseNotOwner` server-side only
- [ ] QA stub: module path, `checkKey`, `blocking` severity, input/output types, EN/ES fixture phrases frozen
- [ ] `lib/qa/check-classes.ts` shared enum/constants for US-10.2
- [ ] FE: warning severity/copy; `GenericAvatarDisclosurePreview` props; placement; read-only; no rules write
- [ ] i18n keys: shared disclosure string for warning + preview (PO lean `legal.genericAvatarDisclosure`)
- [ ] No migration (unless CHECK constraint added — PO lean none)
- [ ] Non-goals: US-10.1 job, US-10.2 handler, US-11.1 screen, US-4.x slot assignment, catalog picker
- [ ] Tests listed for SEC rows: FORBIDDEN, derivation toggle, DTO flag, QA stub pass/fail, blocking constant

---

## CONTRACT freeze list (binding summary)

1. **Derivation:** `generic_avatar` ∈ `allowed_modes` ⇒ `rules.must_disclose_not_owner = true`; else `false`. Single function `deriveVisualPreferencesRules`. Upsert always persists derived `rules`.  
2. **Client writability:** **None.** Reject `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` on Preferencias upsert. No other client write surface for disclosure flags.  
3. **Read authority:** On mismatch between stored `rules` and derivation, **prefer derivation** for `mustDiscloseNotOwner` exposed to UI/agents when `generic_avatar` ∈ allowlist; log drift.  
4. **Agents DTO:** `visualModeSummary: { allowedModes, mustDiscloseNotOwner: boolean } | null` — server-only population; omit consent; no raw `rules` jsonb in DTO (PO lean).  
5. **QA stub:** `checkKey = 'generic_avatar_not_owner'` (CONTRACT freezes exact string); `severity = blocking` from `lib/qa/check-classes.ts`; deterministic evaluator; EN/ES fixtures in CONTRACT.  
6. **V1 trigger:** Allowlist-level proxy until US-4.x; documented in CONTRACT non-goals / future hook.  
7. **FE:** Warning when generic selected (draft or persisted); disclosure preview stub read-only; EN/ES; PrimeReact `Message` warn when generic checked.  
8. **DB:** Reuse `neuramark_visual_preferences.rules` jsonb; no migration PO lean; RLS unchanged.  
9. **Boundaries:** No Ficha viva PATCH widen; no browser Supabase; no public tenant Route Handler; XSS text nodes only.

---

## Open questions — SECURITY resolutions

| # | Question (TASKS.md) | Resolution |
|---|---|---|
| 1 | Allowlist vs per-slot trigger | **APPROVE PO lean (V1 proxy).** Allowlist-level flag; US-4.x adds per-job/server slot flag. Document conservative residual risk. |
| 2 | Agents DTO field name | **APPROVE** flat `visualModeSummary.mustDiscloseNotOwner` (camelCase TS). No nested `rules` in DTO. |
| 3 | QA stub strictness | **APPROVE deterministic only.** No LLM in 3.4. US-10.1 imports stub. |
| 4 | Owner-claim heuristics | **Freeze minimal EN/ES list + optional profile display name** in CONTRACT with pass/fail fixtures. Avoid overly broad regex that blocks legitimate third-person copy. |
| 5 | Disclosure pass phrases | **Freeze whitelist** in CONTRACT (e.g. “not the business owner”, “AI presenter”, ES equivalents). Legal review async — does not block CONTRACT. |
| 6 | Disclosure preview placement | **APPROVE PO lean** Preferencias subsection. Must include copy that this is **not** the final approval package (US-11.1). |
| 7 | Warning severity info vs warn | **APPROVE** `warn` when `generic_avatar` checked in draft; may use `info` for edge persisted-only cases — CONTRACT freezes. |
| 8 | Corrupt `rules` row repair | **APPROVE re-derive on read** for display/DTO; log; upsert repairs persist. **Never** expose `mustDiscloseNotOwner: false` to agents when generic ∈ allowlist. |
| 9 | i18n key structure | **APPROVE** shared `legal.genericAvatarDisclosure` (or CONTRACT-frozen key) for warning + preview + US-11.1 reuse. |
| 10 | QA check export surface | **APPROVE** function + `checkKey` + severity constants; registry table deferred to US-10.1. |
| 11 | Script agent hint helper | **APPROVE optional** `buildGenericDisclosurePromptHint(mustDiscloseNotOwner)` server-only export for US-5.1 — not required for 3.4 AC if CONTRACT documents consumer obligation. |
| 12 | Blocking class module location | **APPROVE** shared `lib/qa/check-classes.ts` — US-10.2 imports same module. **Required**, not optional. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (non-blocking for CONTRACT start):** CONTRACT must freeze QA phrase lists + fixtures; document V1 allowlist proxy vs SPEC per-slot wording; disclosure preview must not impersonate final approval UI; US-5.1 / US-10.1 integration points documented as consumer obligations in CONTRACT module headers.

---

## BUILD vetoes (summary)

1. Client-writable `rules` / `must_disclose_not_owner` / `mustDiscloseNotOwner` on any surface.  
2. Agents DTO or QA fed from request/LLM rule flags instead of server profile/derivation.  
3. Trusting corrupt stored `rules` that clears disclosure while `generic_avatar` ∈ allowlist.  
4. QA stub not classified `blocking` or not using shared `check-classes` module.  
5. Ficha viva PATCH or new endpoint accepting disclosure flags from browser.  
6. Full US-10.1 / US-10.2 / US-11.1 / US-4.x scope creep.  
7. XSS via `dangerouslySetInnerHTML`; browser Supabase; public tenant disclosure API.  
8. Reopen US-3.1 allowlist/consent schema for disclosure bypass.
