# Security Design Review — US-8.9

**Story:** US-8.9 — Operator B-roll generate UI (P1)  
**Date:** 2026-08-31  
**Branch:** `feature/US-8.9-broll-operator-generate-ui`  
**Reviewer:** security-architect  
**Sources:** `plan/stories/US-8.9/README.md`, `plan/stories/US-8.9/TASKS.md`, `plan/USER_STORIES.md` (US-8.9 AC), `plan/SECURITY_BASELINE.md` § Video Provider, `plan/stories/US-8.7/SECURITY.md` (HeyGen Operator generate pattern — **primary mirror**), `plan/stories/US-8.5/SECURITY.md` (Wan B-roll orchestrator), `plan/stories/US-8.8/SECURITY.md` (LTX high-tier B-roll), `plan/stories/US-8.4/SECURITY.md` (`requireOperator`, forbidden job authority fields), `plan/stories/US-7.2/SECURITY.md` (tier floor, forbidden client `providerKey`), `plan/stories/US-7.1/SECURITY.md` (budget estimate), `components/scripts/HeygenGenerateConfirmDialog.tsx` (reference FE pattern), `lib/video-jobs/actions/create-broll-video-jobs.ts` (existing create action)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementer:** **nextjs-frontend** (`BrollGenerateControl`, `BrollGenerateConfirmDialog`, EN/ES i18n). **nextjs-backend** co-authors `CONTRACT.md` for `previewBrollVideoJobsEstimate` Server Action, schema extension, and security tests.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: an **Operator-only B-roll generate control** on `/operator/scripts` that **mirrors the US-8.7 HeyGen trigger pattern** — server **`previewBrollVideoJobsEstimate`** for eligibility + cost display, confirm dialog shows **server-computed** cost / clip count / provider label, submit calls the **existing** **`createBrollVideoJobs`** Server Action with **`{ reelScriptId, clientId }` only**. Policy selects **Wan (`siliconflow_wan21_turbo`, low)** or **LTX (`ltx_broll_high`, high)** — no client authority fields. **No new adapter or orchestrator logic** — backend orchestrator shipped in US-8.5 / US-8.8.

No REDESIGN / VETO. The five primary US-8.9 threats — **non-operator trigger abuse**, **authority smuggling on preview/create**, **IDOR / cross-tenant reel access**, **client-computed cost or provider display**, **preview over-exposure or secret leak in DTOs** — are addressable by mirroring the proven HeyGen Operator UI + existing B-roll orchestrator gates. Orchestrator may proceed to **CONTRACT.md** after encoding the items below.

**Condition count:** **10** binding conditions (must land in CONTRACT + BUILD; see § Conditions before BUILD).

**Primary threats modeled:**

| Threat | Abuse class |
|---|---|
| **Non-operator trigger abuse** | Cliente invokes preview or create to burn Wan/LTX budget |
| **Authority smuggling** | Body forces `provider_key`, tier, prompts, `clipCount`, `operatorClientId`, or cost drivers on preview/create |
| **IDOR / tenancy bypass** | Operator POSTs another client's `clientId` or unknown `reelScriptId` to create jobs cross-tenant |
| **Client-computed cost / provider** | FE displays or submits cost, clip count, or provider from client state instead of server preview |
| **Preview over-exposure** | Preview DTO leaks vendor API keys, raw errors, prompts, reference still URLs, or internal stack traces |
| **Tier-floor UI bypass** | Low-tier client sees LTX label or triggers high-tier path via forged preview response handling |
| **In-flight / double-submit** | Duplicate B-roll job spam while jobs `queued`/`processing`; race between preview eligibility and create |
| **Preview/create divergence** | Stale preview estimate; create skips budget/policy because preview was trusted as authority |

**Inherited floors (US-8.5 / US-8.8 / US-8.4 / US-8.7 / US-7.2 / US-7.1 — do not weaken):** existing **`createBrollVideoJobs`** orchestrator unchanged — `requireOperator`, `findForbiddenVideoJobKeys`, strict `{ reelScriptId, clientId }` body, `clientId === operator.id`, policy-owned `provider_key`, per-clip budget, server-authored prompts, server-resolved still, graceful degrade, `asset_role = broll`, tier floor (low never LTX), vendor keys server-only in adapters; interim hardcoded user is sanctioned — not a finding.

**This story owns:** **`previewBrollVideoJobsEstimate`** Server Action; extend **`previewBrollVideoJobsEstimateSuccessSchema`** for **`ltx_broll_high`**; **`BrollGenerateControl`** + **`BrollGenerateConfirmDialog`**; EN/ES i18n; preview + action security tests; CONTRACT freeze for visibility rules and DTO shapes.

**This story does not own:** Wan / LTX adapter bodies (US-8.5 ✅ / US-8.8 ✅); **`createBrollVideoJobs` orchestrator changes** (reuse as-is); new DB migrations; B-roll job list panel; Cliente-facing trigger; assembly UI; cron automation.

---

### Threat Summary (US-8.9–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator preview/create** | Cliente burns B-roll budget at Wan/LTX rates | **`requireOperator("handler")` first** on preview action; existing create action already gated; Cliente → **403** / `FORBIDDEN`; FE hide is non-authoritative |
| **Authority smuggling on preview** | Force LTX, clip spam, or skip budget via extra body keys | **`findForbiddenVideoJobKeys`** before parse (mirror HeyGen preview); **`.strict()`** request schema — only `reelScriptId`, `clientId`; reject `operatorClientId`, `provider_key`, `tier`, `prompt`, `clipCount`, cost fields → **`FORBIDDEN_FIELDS`** |
| **Authority smuggling on create** | Same on submit | **No signature change** to `createBrollVideoJobs`; existing gates unchanged; FE submits **`{ reelScriptId, clientId }` only** — never `options` / `operatorClientId` from browser |
| **IDOR — forged `clientId`** | Cross-tenant job creation | Preview + create: **`input.clientId !== operator.id` → `FORBIDDEN`** (existing create pattern); mirror in preview |
| **IDOR — unknown reel** | Probe reel existence across tenants | **`loadReelScriptForVideoJob({ reelScriptId, clientId })`** → **`NOT_FOUND`** when script not owned (404-style mutation error — same as HeyGen preview) |
| **Client-computed cost / provider in UI** | Operator misled; margin breach if create trusted FE math | Confirm dialog displays **only** preview DTO fields (`estimatedCostCents`, `clipCount`, `providerKey`); **never** client-side cost math or provider pickers; create **re-runs** orchestrator gates — preview is presentation-only |
| **Preview leaks vendor secrets** | `SILICONFLOW_API_KEY` / `FAL_API_KEY` in preview errors | Preview wraps orchestrator estimate helpers; **`blockedReasonKey`** = i18n key strings only — **never** raw vendor bodies, env values, or stack traces in success/error DTOs |
| **Preview over-exposes prompts / still URLs** | Beat text or signed URLs exfil via preview | Preview success schema **closed** — cost, clip count, `needsBroll`, `providerKey`, optional `blockedReasonKey` only; **no** prompt text, reference still id/url, or beat content in DTO |
| **Tier-floor UI bypass** | Low-tier Operator UI shows LTX | Preview delegates to **`resolveProviderForJob`** — low tier → **`siliconflow_wan21_turbo` only**; `providerKey: ltx_broll_high` **only** when policy tier is `high`; control hidden when preview blocked; test both tiers |
| **In-flight job bypass** | Duplicate B-roll jobs while processing | Preview queries broll jobs for script; returns **`blockedReasonKey`** (or `needsBroll: false` signal) when any broll row **`queued` \| `processing`** — mirror HeyGen `jobInFlight`; create path may still race — acceptable if orchestrator idempotent per beat index (CONTRACT confirms) |
| **Double-submit spam** | Many creates from rapid confirm clicks | FE disable while pending (HeyGen pattern); create orchestrator max clip cap + per-clip budget (US-8.5) remains authoritative |
| **Preview/create gate bypass** | Preview says eligible; create skips budget | Create **must not** trust preview token; **`createBrollVideoJobs`** re-executes policy, budget, provider availability — preview is non-authoritative |

**Residual risk accepted:** Preview→create TOCTOU (budget consumed between preview and confirm) — mitigated by create-time **`assertReelBudgetAllowsSpend`** (US-8.5). Operator trust — Operators may intentionally trigger B-roll within budget (product intent). Compromised Operator session can create jobs for their own `clientId` only — same as HeyGen. Interim hardcoded local user is sanctioned.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Preview request `{ reelScriptId, clientId }` | Low — identifiers only | Strict schema; forbidden-key scan; operator-scoped |
| Preview response (cost, clip count, provider label) | Medium — margin visibility | Operator-gated serializer; closed schema; no secrets |
| `createBrollVideoJobs` mutation body | Low — same narrow shape | Existing US-8.5 action — unchanged |
| B-roll orchestrator internals (policy, budget, prompts) | **High** — spend authority | Server-only; preview **delegates** — no duplicate math in FE |
| Wan / LTX vendor keys | **Critical** | **Out of scope** — remain in adapters (US-8.5 / US-8.8); preview must not surface |
| `neuramark_video_jobs` broll rows | **High** — spend + production | Created only via existing orchestrator after Operator confirm |
| Browser B-roll generate UI | Low — presentation | Hide for ineligible; server enforces all gates |

**Boundaries:**

1. **Browser (Cliente) → preview / create** — Untrusted. **`requireOperator` first** → **403**. No B-roll trigger for Cliente sessions.
2. **Browser (Operator) → preview** — Untrusted intent only. Eligibility and cost are **server-computed**; FE never sends `provider_key`, tier, prompts, or cost drivers.
3. **Browser (Operator) → create** — Untrusted. Submit **`{ reelScriptId, clientId }` only**; orchestrator re-validates everything preview showed.
4. **Preview action → orchestrator helpers** — Server delegates to shared policy + estimate logic (CONTRACT freezes extraction — **no forked provider math in FE or duplicate divergent helper**).
5. **Create action → `createBrollVideoJobs` core** — Unchanged US-8.5 / US-8.8 path; US-8.9 adds **no** new write surface beyond wiring existing action.

---

## Abuse Cases Considered

- *As a Cliente, I call `previewBrollVideoJobsEstimate` or `createBrollVideoJobs`* → **Blocked:** `requireOperator` → **403**; FE must not render control for non-operator (non-authoritative).
- *As a malicious actor, I POST `{ provider_key: "ltx_broll_high" }` on preview while tier is `low`* → **Blocked:** `findForbiddenVideoJobKeys` → **`FORBIDDEN_FIELDS`**; strict schema rejects unknown keys.
- *As a malicious actor, I POST `{ operatorClientId: "<other-uuid>" }` on preview or create* → **Blocked:** forbidden-key scan + strict schema; create already rejects via `.strict()`.
- *As a malicious actor, I POST `{ clientId: "<victim-uuid>" }` as Operator* → **Blocked:** `clientId !== operator.id` → **`FORBIDDEN`** (mirror create).
- *As a malicious actor, I POST a valid `reelScriptId` belonging to another client* → **Blocked:** `loadReelScriptForVideoJob` scoped by `clientId` → **`NOT_FOUND`**.
- *As a malicious actor, I rely on FE-computed cost in the confirm dialog and expect create to honor it* → **Blocked:** create re-estimates; client cost fields forbidden.
- *As a malicious actor, I trigger B-roll for a non-faceless / no-beats script* → **Blocked:** preview returns `needsBroll: false` or `blockedReasonKey`; control hidden; create returns `skippedNoNeedsBroll`.
- *As a malicious actor, I spam create while broll jobs are in flight* → **Mitigated:** preview hides control when `queued`/`processing`; FE disable on pending; orchestrator clip cap remains.
- *As a malicious actor, I read vendor API keys from preview error responses* → **Blocked:** `blockedReasonKey` = i18n keys only; no raw vendor JSON in preview DTO.
- *As a malicious actor, I read B-roll prompts or reference still signed URLs from preview* → **Blocked:** closed preview success schema — no prompt/still fields.
- *As a malicious actor, I expect low-tier preview to show LTX after catalog activation* → **Blocked:** policy tier floor — preview `providerKey` is Wan only on low; automated test required.
- *As a malicious actor, I import server preview helpers in a Client Component* → **Blocked:** `"use server"` action boundary; shared estimate helpers **`import "server-only"`** if extracted to `lib/video-jobs/**`.

---

## Security Acceptance Criteria

Story AC from `plan/USER_STORIES.md` → US-8.9 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] All US-8.5 B-roll orchestrator floors** — graceful degrade, `asset_role = broll`, per-clip budget, server-resolved still, server-authored prompts, forbidden client authority on create *(US-8.5)*
- [ ] **[SEC] All US-8.8 LTX tier floors** — `ltx_broll_high` only when policy tier is `high`; low never LTX *(US-8.8)*
- [ ] **[SEC] All US-8.4 orchestration floors** — closed write surface, forbidden job authority fields, Operator-only mutations *(US-8.4)*
- [ ] **[SEC] `provider_key` chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation** *(US-7.2)*
- [ ] **[SEC] Budget gate runs server-side before vendor I/O** *(US-7.1)*

**US-8.9 story AC security mapping (existing in USER_STORIES.md):**

- [ ] **[SEC] Non-operator sessions receive 403; request body rejects forbidden authority fields (`provider_key`, tier, prompts, `operatorClientId`); no new adapter or orchestrator logic** *(USER_STORIES US-8.9)*

**Added in this review (binding for US-8.9 BUILD):**

- [ ] **[SEC] (added) Preview action operator gate:** **`previewBrollVideoJobsEstimate`** calls **`requireOperator("handler")` first**; auth failure → **`UNAUTHENTICATED` / `FORBIDDEN`** mutation error (mirror **`previewHeygenTalkingHeadEstimate`**)
- [ ] **[SEC] (added) Preview forbidden-key scan:** **`findForbiddenVideoJobKeys(rawInput)`** before Zod parse; any hit → **`FORBIDDEN_FIELDS`** (same set as create — includes `provider_key`, `tier`, `prompt`, `clipCount`, `operatorClientId`, cost drivers)
- [ ] **[SEC] (added) Preview strict request schema:** **`previewBrollVideoJobsEstimateRequestSchema`** — **only** `reelScriptId`, `clientId`; **`.strict()`**; no optional authority fields
- [ ] **[SEC] (added) Preview IDOR parity with create:** **`clientId !== operator.id` → `FORBIDDEN`**; unknown / cross-tenant reel → **`NOT_FOUND`** via **`loadReelScriptForVideoJob`**
- [ ] **[SEC] (added) Preview closed success schema:** extend **`providerKey`** union to **`siliconflow_wan21_turbo | ltx_broll_high`** (optional when blocked); fields limited to **`estimatedCostCents`**, **`unitCostCentsPerClip`**, **`clipCount`**, **`needsBroll`**, optional **`blockedReasonKey`** — **no** prompts, still ids/urls, vendor errors, or API key material
- [ ] **[SEC] (added) Preview delegates to orchestrator logic:** policy resolution + clip count + estimate **shared with or thin-wrapped from `createBrollVideoJobs` helpers** — CONTRACT forbids divergent duplicate math in FE or a second policy path
- [ ] **[SEC] (added) Tier floor in preview:** when effective tier is **`low`**, preview **`providerKey`** must be **`siliconflow_wan21_turbo`** only; **`ltx_broll_high`** only when tier is **`high`**; automated tests for both paths
- [ ] **[SEC] (added) In-flight broll hide:** preview returns blocked/hidden signal when any broll job for script is **`queued` or `processing`** (mirror HeyGen **`jobInFlight`**); FE hides **`BrollGenerateControl`**
- [ ] **[SEC] (added) Create submit surface unchanged:** **`createBrollVideoJobs`** Server Action accepts **`unknown` body only** — **`{ reelScriptId, clientId }`**; FE never passes `options`, `operatorClientId`, or provider fields (regression test)
- [ ] **[SEC] (added) FE presentation-only:** confirm dialog cost, clip count, and provider label rendered **only** from preview response; no client-side provider picker; no `"use client"` import of server estimate helpers
- [ ] **[SEC] (added) `blockedReasonKey` hygiene:** values are **i18n key strings** (e.g. `scripts.broll.blocked.*`) — never raw vendor messages, env names, or stack traces
- [ ] **[SEC] (added) Automated security tests cover at least:** (1) preview non-operator → **403**; (2) preview forbidden `provider_key` → **`FORBIDDEN_FIELDS`**; (3) preview forged `clientId` → **`FORBIDDEN`**; (4) preview unknown reel → **`NOT_FOUND`**; (5) low tier preview → Wan provider key only; (6) high tier preview → LTX provider key when active; (7) non-faceless → `needsBroll: false` / hidden; (8) in-flight broll → blocked; (9) create still rejects forbidden fields (regression); (10) preview success parse rejects extra secret-like fields if present in test fixtures

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate — **`requireOperator` on preview + create** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Preview | **`requireOperator("handler")` first** — mirror **`previewHeygenTalkingHeadEstimate`** |
| Create | Existing **`createBrollVideoJobs`** action — no regression |
| Cliente | **403** on both paths |
| FE | Hide control when not operator — **non-authoritative** |

**Condition:** CONTRACT documents action export path and auth error mapping identical to HeyGen preview.

#### 2. Narrow request body — **no authority smuggling** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Preview body | `{ reelScriptId, clientId }` only — **`.strict()`** |
| Create body | Unchanged — same narrow shape |
| Forbidden scan | **`findForbiddenVideoJobKeys`** on preview (including `operatorClientId`, `provider_key`, `tier`, `prompt`, `clipCount`, cost fields) |
| FE submit | Never send provider, tier, prompts, or cost from client state |

**Condition:** CONTRACT lists forbidden keys explicitly; regression test on create unchanged.

#### 3. IDOR — **`clientId === operator.id` + scoped reel load** (APPROVE)

| Rule | Detail |
|---|---|
| Tenancy | **`input.clientId !== operator.id` → `FORBIDDEN`** |
| Reel scope | **`loadReelScriptForVideoJob({ reelScriptId, clientId })` → `NOT_FOUND`** when not owned |
| Response | Use mutation error codes — do not leak cross-tenant reel existence beyond existing patterns |

#### 4. Server-authoritative preview — **no client cost or provider** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Display | Cost, clip count, provider label from preview DTO only |
| Policy | **`resolveProviderForJob`** + adapter **`estimateCost`** — same as orchestrator |
| Create | Re-runs full gates — preview is **not** a capability token |
| Schema | Extend **`providerKey`** for **`ltx_broll_high`** |

**Condition:** CONTRACT freezes shared helper extraction (single source of truth with orchestrator).

#### 5. Closed preview DTO — **no prompt/still/secret leak** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Success fields | Cost, clip count, `needsBroll`, `providerKey`, optional `blockedReasonKey` |
| Forbidden in DTO | Prompts, beat text, reference still id/url, vendor raw errors, env key names |
| Errors | **`blockedReasonKey`** = i18n keys; generic mutation errors elsewhere |

**Condition:** CONTRACT includes Zod `.strict()` success schema and redaction test.

#### 6. Eligibility + in-flight — **mirror HeyGen visibility** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Show button | Faceless + `needs_broll` + active provider + no `blockedReasonKey` + no in-flight broll jobs |
| Hide | Non-faceless, no beats, preview blocked, broll `queued`/`processing` |
| FE | **`BrollGenerateControl`** `useEffect` calls preview — same structure as **`HeygenGenerateControl`** |

**Condition:** CONTRACT freezes in-flight query (server-side in preview action per PO lean).

#### 7. No orchestrator fork — **reuse `createBrollVideoJobs`** (APPROVE)

| Rule | Detail |
|---|---|
| Scope | **No** changes to orchestrator core unless minimal shared-helper extraction for preview |
| Adapters | Wan / LTX unchanged |
| DB | None |

---

## Future-Proofing Notes

- **Real auth / multi-tenant Operators:** When auth lands, `requireOperator` remains the single gate; preview/create must not accept impersonation fields (`operatorClientId`, `actingAsClientId`) from the browser.
- **RLS:** Preview and create already scope by `clientId`; future RLS on `neuramark_video_jobs` must align with **`asset_role = broll`** rows created here.
- **B-roll status panel:** A future list UI must reuse US-8.4 IDOR-safe poll DTOs — no raw vendor fields.
- **Cliente B-roll trigger:** Out of scope — would require separate SECURITY review; do not expose preview action to Cliente routes.

---

## CONTRACT Spot-Check Checklist (when CONTRACT.md exists)

Before BUILD starts, verify CONTRACT:

- [ ] `previewBrollVideoJobsEstimate` path + `"use server"` + `requireOperator` first
- [ ] Strict request schema `{ reelScriptId, clientId }` + forbidden-key scan
- [ ] IDOR rules: `clientId === operator.id`; scoped reel load → `NOT_FOUND`
- [ ] Extended success schema: `providerKey` union Wan | LTX; closed fields
- [ ] Shared estimate/policy helper — no divergent FE math
- [ ] Tier floor tests: low → Wan; high → LTX when active
- [ ] In-flight broll detection in preview
- [ ] `createBrollVideoJobs` unchanged signature and forbidden-field behavior
- [ ] FE props/copy keys; confirm dialog uses preview DTO only
- [ ] `blockedReasonKey` i18n namespace (`scripts.broll.*`)
- [ ] Security test matrix (403, forbidden fields, IDOR, tier paths, in-flight)
- [ ] Explicit out-of-scope: adapter changes, migrations, Cliente trigger, orchestrator fork

---

## Verdict for CONTRACT

**Pre-CONTRACT (this review): APPROVE WITH CONDITIONS** — **nextjs-backend** may author `plan/stories/US-8.9/CONTRACT.md`. **nextjs-frontend** reviews FE surface (control + dialog). Proceed only if CONTRACT encodes the frozen items in **Design Concerns** and **Security Acceptance Criteria** above.

**Post-CONTRACT spot-check (binding):**

| CONTRACT outcome | When |
|---|---|
| **APPROVE WITH CONDITIONS** | CONTRACT includes: (1) **`requireOperator` preview gate**; (2) **strict body + forbidden keys**; (3) **IDOR parity**; (4) **closed preview DTO**; (5) **shared orchestrator estimate**; (6) **tier floor in preview**; (7) **in-flight hide**; (8) **unchanged create action**; (9) **FE presentation-only**; (10) security test matrix |
| **REDESIGN** | CONTRACT adds client `provider_key` / tier to preview or create; preview returns prompts/still URLs; preview trusted as create capability token; divergent FE cost math; Cliente-accessible preview |
| **VETO (do not BUILD)** | Preview callable without `requireOperator`; create accepts `operatorClientId` from browser; preview exposes vendor keys or raw errors; orchestrator fork duplicates policy with client-influenceable inputs |

### Conditions before BUILD (binding — condition count = 10)

1. **Anti–non-operator-abuse:** `requireOperator` on preview; create regression intact; Cliente **403**.
2. **Anti–authority-smuggling:** forbidden-key scan + strict schemas on preview; create unchanged; FE submit narrow body only.
3. **Anti–IDOR:** `clientId === operator.id`; scoped reel load → `NOT_FOUND`.
4. **Anti–client-cost-authority:** preview/orchestrator-owned estimate; FE display from preview DTO only.
5. **Anti–preview-over-exposure:** closed success schema; no prompts/stills/secrets; i18n `blockedReasonKey` only.
6. **Anti–tier-floor-bypass:** preview `providerKey` matches policy tier; tests for Wan vs LTX.
7. **Anti–in-flight-bypass:** preview detects broll `queued`/`processing`; FE hides control.
8. **Anti–orchestrator-fork:** shared estimate/policy helper with `createBrollVideoJobs` — no duplicate math.
9. **Anti–create-surface-expansion:** no new fields on create action; no browser `options` / `operatorClientId`.
10. **Anti–module-leak:** server actions and extracted helpers stay server-only; security test matrix lands in BUILD.

When CONTRACT.md lands, security-architect re-runs the spot-check checklist; **expected result: APPROVE WITH CONDITIONS** if all rows pass. Any REDESIGN finding blocks BUILD until CONTRACT revision.

---

## CONTRACT freeze list (binding summary)

1. **Auth:** `requireOperator` on preview; create unchanged.
2. **Body:** `{ reelScriptId, clientId }` only; forbidden-key scan on preview.
3. **IDOR:** `clientId === operator.id`; scoped reel → `NOT_FOUND`.
4. **Preview DTO:** cost, clip count, `needsBroll`, `providerKey`, optional `blockedReasonKey` — closed.
5. **Policy:** server `resolveProviderForJob`; tier floor Wan vs LTX.
6. **Estimate:** shared with orchestrator — preview non-authoritative for create.
7. **Visibility:** faceless + needs_broll + no in-flight + no blocked reason.
8. **FE:** mirror HeyGen control/dialog; presentation only.
9. **Create:** reuse existing action — no orchestrator fork.
10. **Tests:** 403, forbidden fields, IDOR, tier paths, in-flight, create regression.

---

## BUILD vetoes (summary)

1. **`previewBrollVideoJobsEstimate` callable without `requireOperator("handler")`.**
2. **Preview or create accepts client `provider_key`, `tier`, `prompt`, `clipCount`, or `operatorClientId`.**
3. **Preview omits `findForbiddenVideoJobKeys` scan (create regression also fails).**
4. **Preview returns prompts, reference still URLs, or vendor API key material.**
5. **FE confirm dialog computes cost or selects provider client-side.**
6. **Low-tier preview returns or displays `ltx_broll_high` as resolved provider.**
7. **Preview uses divergent policy/estimate logic from orchestrator (CONTRACT must single-source).**
8. **`createBrollVideoJobs` signature expanded to accept browser-supplied `options` / authority fields.**
9. **Control visible to Cliente sessions without server 403 on preview/create.**
10. **Missing security tests for operator gate, forbidden fields, IDOR, tier floor, and in-flight hide.**

---

## Verdict Rationale

**APPROVE WITH CONDITIONS** — not REDESIGN because US-8.9 correctly **closes the deferred FE gap** for an orchestrator already secured in US-8.5 / US-8.8, using the **proven US-8.7 HeyGen Operator trigger pattern** (preview → confirm → narrow create). Incremental risk is limited to **new preview Server Action surface** and **FE wiring** — manageable when preview mirrors create's auth, forbidden keys, IDOR rules, and closed DTOs, and when create remains the sole authoritative mutation.

**Recommended action:** Proceed to **CONTRACT.md** with **nextjs-backend** (+ **nextjs-frontend** review for control/dialog); security-architect post-CONTRACT spot-check expected **APPROVE WITH CONDITIONS** when the freeze list is encoded.

---

## Gate summary

| Field | Value |
|---|---|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Condition count** | **10** |
| **Veto** | No |
| **Next gate** | CONTRACT.md |
