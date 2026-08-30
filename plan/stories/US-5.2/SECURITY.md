# Security Design Review — US-5.2

**Story:** US-5.2 — Preview script readability for vertical video  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-5.2 AC), `plan/stories/US-5.1/SECURITY.md` + `CONTRACT.md` (read gate, script DTO, persist bounds), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `plan/DESIGN_PROMPTS.md` §6 (Operator script tab warnings), `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`, `components/scripts/ScriptsPageView.tsx`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: a **read-only Operator UX helper** on **existing** `neuramark_reel_scripts` rows — per-beat on-screen character warnings and voiceover word-count vs target-duration estimate for 9:16 readability. It **must not** introduce a Cliente read path, script inline edit/save, new DB columns, or ungated validation endpoints. **`requireOperator()` on script reads stays unchanged from US-5.1** (`getReelScriptsForWeek` + operator layout page gate).

No REDESIGN. No veto of PO lean scope (warnings are **advisory**, not hard blocks — US-5.1 Zod persist bounds remain authoritative). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-5.1 / US-14.5 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; `client_id` server-resolved only; script reads IDOR-scoped; RLS deny-by-default on `neuramark_reel_scripts`; service-role Node only; no `@supabase/supabase-js` in Client Components; script text rendered as **plain text** (never HTML); generate/regen paths remain the **only** script persist surfaces; forbidden script text fields on generate/regen inputs unchanged.

**This story owns:** frozen readability thresholds module (per-beat max chars, VO words-per-second estimate); pure evaluation helpers (`splitOnScreenBeats`, `evaluateOnScreenReadability`, `evaluateVoiceoverDuration`); optional server-side enrichment of Operator read DTO with warning flags; FE warning UI on Script tab; optional **non-blocking** readability self-check on existing generate/regen persist path (same gates + rate limits as US-5.1); EN/ES product copy for warning states; tests for threshold authority and no new ungated surfaces.

**This story does not own:** Operator inline script edit/save; Cliente script read (US-11.x); caption length limits (US-6.x); video assembly subtitle rendering (US-9.x); tightening US-5.1 hard Zod max lengths; new LLM spend path without US-5.1 rate limit; DB migration.

**Terminology:** **Texto en pantalla** · **Paquete de guion** · **Operator** · **beat** (newline-delimited line within `onScreenText`). Technical names `onScreenText`, `voiceoverText`, `targetDurationSec`, `getReelScriptsForWeek`, `requireOperator` are canonical.

---

### Threat Summary (US-5.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **New ungated validation/read endpoint** | Cliente or anonymous user reads script content or probes thresholds | **No new Route Handler.** Reuse **`getReelScriptsForWeek`** (already `requireOperator("handler")` first) or compute warnings in FE from **shared frozen constants** imported from a non-secret module. Any server-enriched warning DTO stays behind the existing gated read action only |
| **Inline script edit/save introduced under "validation on save"** | Client smuggles hook/body/CTA/on-screen/VO without generate/regen gates, bypassing LLM validation and disclosure injection | **VETO if added.** "Save" in this story means **persist during existing US-5.1 generate/regen only** — not a new mutation. No `updateReelScript*` Server Action in US-5.2 BUILD |
| **Client-supplied readability thresholds** | Attacker relaxes limits to hide unreadable scripts | Thresholds live in **server-frozen module** (`REEL_SCRIPT_READABILITY_THRESHOLDS` or CONTRACT exact). Request schemas **must not** accept `maxCharsPerBeat`, `wordsPerSecond`, `thresholds`, or per-beat overrides. UI reads constants only — never POST thresholds |
| **Hard reject vs warn confusion weakens US-5.1 bounds** | Operators blocked from viewing LLM output that already passed Zod, or conversely unsafe text slips through because warnings replaced schema | Readability checks are **advisory warnings** (AC: "Warn when…"). US-5.1 **`reelScriptPackageSchema`** hard bounds (`onScreenText` max **500**, etc.) **unchanged**. Readability must **not** widen persist limits |
| **Optional agent self-check adds ungated LLM spend** | Budget burn, prompt exfil | Self-check runs **only** inside **`import "server-only"`** `generate-reel-script` path, **after** existing `requireOperator` + rate limit + approved-strategy gates. **No** extra public action. If self-check adds a second LLM call, it counts toward the **same US-5.1 rate-limit bucket** for that job attempt — no bypass |
| **XSS via warning UI embedding script text** | Stored script text executed in Operator browser | Warning labels use **i18n product strings** + numeric counts only. Script field values stay in existing plain-text `ScriptField` rendering — no `dangerouslySetInnerHTML`, no markdown/HTML interpolation of script content |
| **Cross-tenant leakage via warning API** | Foreign script readability metadata exposed | Warnings computed **only** from rows already returned by IDOR-scoped `buildReelScriptListForStrategy` (`client_id` filter). No standalone `scriptId`-only validation endpoint |
| **Logging readable script bodies for "validation failures"** | PII / prompt fuel in logs | Log warning **codes** and counts (`beatIndex`, `charCount`, `wordCount`) — not full `onScreenText` / `voiceoverText` bodies |

**Residual risk accepted:** Operator trust model — Operator sees full script text (US-5.1). Readability heuristics (newline beat split, words/sec estimate) are approximate, not pixel-perfect subtitle fit; security posture does not depend on perfect typography. V1 beat split = **newline-separated lines** in single `onScreenText` string (US-5.1 lean) — no client-provided beat array.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `onScreenText`, `voiceoverText` on script row | Medium — production copy; already exposed to Operator via US-5.1 read | Loaded only through **`requireOperator`-gated** read path; rendered plain text |
| Readability thresholds (chars/beat, WPS) | Low — non-secret product constants | **Server-frozen**; shared to FE via import from constants module — not request parameters |
| Computed warning flags (`beatWarnings[]`, `voiceoverEstimateSec`) | Low — derived metadata | Computed from trusted row fields + frozen constants; no client authority |
| Operator session | High — script read access | Unchanged US-5.1 gate — **`requireOperator("page" \| "handler")`** |

**Boundaries:**

1. **Browser (Operator) → `getReelScriptsForWeek`** — Untrusted input remains **`{ weekStart }` only** (`.strict()`). No new fields. Warnings either returned in success DTO (server-computed) or derived client-side from **`package` + shared constants** — both OK if constants are not client-writable.
2. **Server read path → warning evaluation** — Pure functions over already-tenant-scoped script rows. No extra SELECT without `client_id` filter.
3. **Generate/regen persist (optional self-check)** — Existing US-5.1 chain: `requireOperator` → rate limit → `loadApprovedStrategyForScriptJob` → agent → Zod → INSERT/UPSERT. Self-check is **pre-persist advisory** (log and/or attach to job result for Operator UI) — **must not** skip Zod or disclosure injection.
4. **No new boundary** — Cliente, anonymous, or Operator script **write** via readability story is **forbidden**.

---

## Abuse Cases Considered

- *As a Cliente, I can call a readability validation endpoint with victim script text* → **Blocked:** no standalone validation endpoint; no Cliente script read path.
- *As a malicious actor, I can POST `{ weekStart, maxCharsPerBeat: 9999 }` to relax warnings* → **Blocked:** thresholds not in request schema; forbidden-key rejection if smuggled.
- *As a malicious actor, I can save edited on-screen text without regenerate* → **Blocked:** no script UPDATE Server Action in US-5.2; persist only via US-5.1 gated generate/regen.
- *As a malicious actor, I can read another client's readability warnings by `scriptId`* → **Blocked:** warnings only on rows from tenant-scoped list builder; no orphan scriptId API.
- *As a malicious actor, I trigger agent self-check LLM calls without operator gate* → **Blocked:** self-check only inside server-only generate job after US-5.1 gates.
- *As a malicious actor, I inject HTML in on-screen text and execute it via warning banner* → **Blocked:** plain-text rendering; warning chrome uses static i18n strings.
- *As a malicious actor, I bypass US-5.1 `onScreenText` max 500 by treating warnings as the only limit* → **Blocked:** Zod hard max unchanged; warnings use **stricter per-beat** threshold (≤500 total).

---

## Security Acceptance Criteria

Items marked **(added)** are new in this review — paste into `plan/USER_STORIES.md` when the PO next edits US-5.2.

**Inherited (still binding — do not weaken US-5.1 / auth paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] Script list read path** (`getReelScriptsForWeek`) calls `requireOperator("handler")` as **first** await before validation or SELECT; Cliente → **403** *(US-5.1 — unchanged)*
- [ ] **[SEC] IDOR-safe script reads:** list/load **always** scoped by server-resolved `client_id`; foreign strategy/week → empty or **404** uniform *(US-5.1)*
- [ ] **[SEC] Script text rendered as plain text everywhere** — no HTML rendering of hook/body/CTA/on-screen/VO *(US-5.1)*

**Added in this review (binding for US-5.2 BUILD):**

- [ ] **[SEC] (added) No new script persist surface:** US-5.2 **must not** add Server Actions, Route Handlers, or DB writes that accept Operator-edited script text (`hook`, `body`, `cta`, `onScreenText`, `voiceoverText`, etc.). "Validation on save" applies **only** to the existing US-5.1 **`generateReelScripts` / `regenerateReelScriptSlot` → Zod → persist** chain
- [ ] **[SEC] (added) No new ungated HTTP surface for readability:** no public `GET`/`POST` validation Route Handler. Optional warning enrichment extends **`getReelScriptsForWeek`** success shape **or** FE derives warnings from **`package` + shared constants** — both require Operator to already hold gated read access
- [ ] **[SEC] (added) Readability thresholds are server-authoritative and frozen in CONTRACT:** export `REEL_SCRIPT_READABILITY_THRESHOLDS` (or CONTRACT exact name) from a shared module (lean: `lib/reel-scripts/readability/thresholds.ts`) with at minimum **`maxCharsPerBeat`** (lean: **42**) and **`wordsPerSecond`** for VO estimate (lean: **2.5**). Request schemas for **all** script actions **reject** client threshold overrides (`maxCharsPerBeat`, `wordsPerSecond`, `thresholds`, `readabilityConfig`, etc.) → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Beat split rule is deterministic and non-client-controlled:** split `onScreenText` on `\n` (trim empty lines); each non-empty line is one beat; **no** client-supplied beat array or delimiter parameter
- [ ] **[SEC] (added) Readability evaluation is pure and side-effect-free:** helpers take script field strings + `targetDurationSec` + frozen thresholds only — no network I/O, no DB, no `process.env` overrides in Client Components beyond importing public constants
- [ ] **[SEC] (added) Warnings are advisory, not persist gates:** exceeding per-beat char limit or VO duration estimate **must not** block INSERT/UPSERT when US-5.1 Zod validation passes. Optional self-check may log **`READABILITY_WARN`** codes server-side — **must not** skip persist solely for readability unless PO explicitly moves to hard reject in a future story (out of US-5.2)
- [ ] **[SEC] (added) Optional agent self-check stays inside server-only generate job:** if implemented, lives in `lib/agents/content/generate-reel-script.ts` (or CONTRACT exact) with `import "server-only"`; runs **after** LLM parse, **before or after** Zod (CONTRACT picks), **never** from Client Component; **no** additional LLM round unless counted against US-5.1 **`video_script_generate`** rate-limit bucket for that attempt
- [ ] **[SEC] (added) Warning UI uses i18n product copy only for chrome:** beat index, char count, and estimated seconds may display as numbers; message templates live in EN/ES translation files — **never** concatenate raw script text into warning HTML
- [ ] **[SEC] (added) If read DTO enriched with warnings, extend `reelScriptListItemSchema` strictly:** optional `readabilityWarnings: { onScreenBeats: { lineIndex, charCount, exceedsMax }[], voiceover: { wordCount, estimatedSec, targetDurationSec, exceedsTarget } }` (CONTRACT exact) — `.strict()`; computed server-side from row fields; **no** new identifiers required from client
- [ ] **[SEC] (added) Extend forbidden-key scanner** (`findForbiddenReelScriptKeys`) for any new threshold-smuggle keys introduced by CONTRACT
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator `getReelScriptsForWeek` still → 403; smuggled threshold keys → `FORBIDDEN_FIELDS`; no new `updateReelScript*` / script PATCH action exported; warning helpers do not perform fetch/DB; enriched read DTO omits other tenants' scripts; generate/regen input schemas still reject script text fields (regression)

**US-5.2 story `[SEC]` (recommended for USER_STORIES.md — paste when PO edits):**

- [ ] **[SEC] Readability thresholds and VO duration estimate constants are server-frozen; the client cannot submit override values, and warnings are advisory only — US-5.1 schema bounds and Operator read gates remain unchanged**

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Read gate — unchanged from US-5.1 (APPROVE)

| Surface | Gate |
|---|---|
| `getReelScriptsForWeek` | `requireOperator("handler")` **first** — **no change** |
| Operator scripts page | `operator/layout.tsx` `requireOperator("page")` — **no change** |
| New validation-only endpoint | **Forbidden** in US-5.2 |

#### 2. No script edit/save (APPROVE — binding veto)

| Rule | Detail |
|---|---|
| Persist | **Only** US-5.1 generate/regen paths |
| Forbidden | `updateReelScriptText`, PATCH script rows, Operator textarea save |
| "Validation on save" | Run readability helpers on **agent output immediately before persist** (optional) and/or enrich **read** DTO — not a new mutation |

#### 3. Frozen thresholds module (APPROVE WITH CONDITIONS)

```ts
// Lean — CONTRACT freezes exact numbers and export path
export const REEL_SCRIPT_READABILITY_THRESHOLDS = {
  maxCharsPerBeat: 42, // 9:16 subtitle legibility; must be ≤ reelScriptPackageSchema onScreenText max (500)
  wordsPerSecond: 2.5, // VO duration estimate divisor
} as const;
```

| Rule | Detail |
|---|---|
| Authority | Single module; imported by FE + BE |
| Client override | **Forbidden** on all script action inputs |
| Beat model | Newline-split `onScreenText`; empty lines dropped |
| Warning | `charCount > maxCharsPerBeat` per beat; VO `wordCount / wordsPerSecond` vs `targetDurationSec` |

**Condition:** CONTRACT may tune numbers with product/UX signoff — not per-request.

#### 4. Warning delivery — two allowed patterns (APPROVE)

| Pattern | Security note |
|---|---|
| **A — Server-enriched read DTO** | Extend `getReelScriptsForWeek` success items only; same gate + tenancy |
| **B — Client-side from constants** | FE imports thresholds + pure helpers; no new server call. Acceptable because data already gated by US-5.1 read |

Pick one in CONTRACT; **do not** implement both with divergent logic — single source of truth for formulas.

#### 5. Optional agent self-check (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Scope | Prompt nudge and/or post-parse check inside existing generate job |
| Gate | Inherits full US-5.1 chain — not a standalone feature flag exposed to browser |
| LLM | Optional second pass **discouraged**; if added, same rate-limit bucket |
| Outcome | Warn/log only in US-5.2 — do not reject persist |

**Condition:** Prefer **zero additional LLM spend** — heuristic check on parsed JSON is sufficient for V1.

#### 6. UI — plain text (APPROVE)

| Rule | Detail |
|---|---|
| On-screen field | Existing `ScriptField` + warning badge/message below |
| Voiceover field | Word count + `~{estimatedSec}s of {targetDurationSec}s target` |
| HTML | **Forbidden** for script values |

---

## Future-Proofing Notes

- **US-6.x Caption** char limits are a **separate** threshold set — do not conflate with on-screen beat limits.
- **US-9.x Assembly** may apply different subtitle rendering; readability warnings remain Operator editorial hints.
- **US-11.x Cliente Aprobación** script read needs its own SECURITY review — US-5.2 warnings **must not** ship on Cliente surfaces.
- **Real auth / multi-client Operator:** same `requireOperator` + server-resolved `client_id`; thresholds stay global constants until per-client typography settings exist (future story with Operator settings gate).
- **Inline edit (if ever scoped):** requires full US-5.1-equivalent gates, Zod, disclosure re-derivation, and new SECURITY review — not implied by US-5.2.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-5.2/CONTRACT.md` exists, spot-check before BUILD:

- [ ] No new script UPDATE action or Route Handler
- [ ] `getReelScriptsForWeek` gate unchanged; input still `{ weekStart }` strict
- [ ] `REEL_SCRIPT_READABILITY_THRESHOLDS` frozen with exact numbers
- [ ] Pure helpers documented; beat split = newline
- [ ] Warning delivery pattern (A or B) chosen; formulas single-sourced
- [ ] Forbidden keys extended for threshold smuggles
- [ ] Read DTO extension `.strict()` if pattern A
- [ ] Self-check (if any) inside `server-only` generate module; no extra ungated LLM
- [ ] EN/ES warning copy keys; no HTML script rendering
- [ ] Out of scope: Cliente read, inline edit, DB migration, caption limits

---

## CONTRACT freeze list (binding `[SEC]` summary)

Paste into CONTRACT **Security** section — do not reopen without security-architect review.

1. **Read gate unchanged:** `requireOperator("handler")` **first** on **`getReelScriptsForWeek`**; operator layout page gate unchanged; **403** for non-operator.
2. **No new persist surface:** readability **must not** add script text UPDATE actions or ungated validation HTTP endpoints. "Save" = US-5.1 generate/regen persist chain only.
3. **Threshold authority:** **`REEL_SCRIPT_READABILITY_THRESHOLDS`** (CONTRACT exact) server-frozen — **`maxCharsPerBeat`**, **`wordsPerSecond`**; client override keys → **`FORBIDDEN_FIELDS`**.
4. **Beat model:** newline-split **`onScreenText`**; no client beat array.
5. **Advisory warnings only:** US-5.1 **`reelScriptPackageSchema`** hard bounds unchanged; readability does **not** block persist in US-5.2.
6. **Plain text:** script fields and warning UI — no HTML from script content.
7. **Tenancy:** warnings computed only on tenant-scoped script rows from existing list builder — no orphan `scriptId` validation API.
8. **Optional self-check:** **`import "server-only"`** generate job only; no ungated LLM; rate-limit bucket unchanged if extra LLM call.
9. **Logging:** warning codes + counts — not full script bodies.
10. **Tests:** no new ungated exports; forbidden threshold keys; read gate regression; no script PATCH action.

---

## BUILD vetoes (summary)

1. **Adding Operator script text save/update Server Action or Route Handler** under readability scope.
2. **Public or Cliente-accessible validation endpoint** without `requireOperator`.
3. **Accepting client-supplied readability thresholds** on any script action input.
4. **Replacing US-5.1 Zod hard limits with warning-only checks** (widening persist bounds).
5. **Blocking persist on readability alone** without explicit PO/security story change.
6. **Agent self-check LLM call outside US-5.1 gated generate path** or outside rate-limit accounting.
7. **Rendering script text as HTML** in warning or detail UI.
8. **Standalone `scriptId` validation read** without server-resolved `client_id` scope.
9. **Logging full `onScreenText` / `voiceoverText` on readability warn paths in production.**

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Server vs client warning computation? | **Either A (enriched DTO) or B (shared constants + FE)** — CONTRACT picks one; formulas must match. Both OK security-wise because read is already Operator-gated. |
| 2 | Does "validation on save" mean inline edit? | **No.** Persist validation = generate/regen only. Inline edit remains out of scope (regenerate only). |
| 3 | Hard reject overlong beats? | **No in US-5.2.** Warn only. Hard reject would require US-5.1 schema/CONTRACT amendment + security re-review. |
| 4 | Second LLM self-check pass? | **Optional, discouraged.** Heuristic on parsed package preferred. If LLM, same gates + rate limit. |
| 5 | Per-beat max chars value? | **CONTRACT freezes** (lean **42**). Must be ≤ US-5.1 `onScreenText` max **500**. |
| 6 | Cliente preview warnings? | **Out of scope.** Operator-only until US-11.x review. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). FE consumes gated read DTO and/or shared thresholds module; BE adds pure helpers + optional pre-persist advisory check on existing generate job — **no new mutations, no read gate changes**.
