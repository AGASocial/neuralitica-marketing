# Security Design Review — US-11.1

**Story:** US-11.1 — Present Reel package for client approval  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-11.1 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` (§5 state machines, Top 5 #2 approval-gate bypass), `plan/stories/US-11.1/README.md` + `TASKS.md` (PREP `00e1d5a`), `plan/stories/US-10.1/SECURITY.md` + gate helper, `plan/stories/US-10.2/SECURITY.md` (gate extension + override audit handoff), `plan/stories/US-9.2/SECURITY.md` (media serve matrix — widen `assembled_reel`), US-14.5 `requireActive` / `requireOperator`, US-6.2 CTA selection seam  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (DDL, ensure/list/get/decide, gate re-check, media serve widen, DTOs, security tests). **nextjs-frontend** (`/approvals` list + detail, i18n — presentation only; no gate or decision authority). **No** content-agents-engineer · **No** media-pipeline · **No** integrations.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and closes SECURITY_BASELINE Top 5 #2 for the **Cliente Aprobación** half of the publish gate: **Cliente-gated** package surfaces under **`requireActive("handler")`**; packages are created only when assembly branding + **`getQaGateStatusForAssembledReel` → ready** + selected CTA are satisfied **server-side**; **approve / reject** re-checks the same gate before any status write; **no** client-supplied `qaPassed` / `ready` / `passed` / override spoof fields; **IDOR → 404** on foreign approval / assembled-reel / media asset ids; **`assembled_reel` media serve** widened carefully to owning Cliente (Operator path retained); **reject feedback** length-capped plain text. Request-changes / `changes_requested` writes remain **US-11.2**. Publish-queue polish / download UX remain **US-11.3** (Phase A may still set `approved`).

No REDESIGN. No veto of PO freezes #1–#18 in PREP `00e1d5a`. Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-10.1 / US-10.2 / US-9.2 / US-6.2 / US-14.5 / SECURITY_BASELINE — do not weaken):** gate helper is `import "server-only"` and DB-only; ready = `passed` **or** (`failed` ∧ no blocking ∧ full overridable override coverage); `requireActive()` first on Cliente surfaces; role and `client_id` never from request; foreign UUID → **404** (not 403); RLS deny-by-default; service-role Node only; no `@supabase/supabase-js` in Client Components; do **not** widen `generated_video` / `voiceover` to Cliente; interim hardcoded user sanctioned — not a finding.

**This story owns:** `neuramark_approvals` DDL + RLS; `ensureApprovalPackageForAssembledReel` / `listPendingApprovals` / `getApprovalPackage` / `decideApproval`; gate re-check on create **and** decide; package DTO (video preview URL, caption, hashtags, disclosure, qaOverrides audit); Cliente `assembled_reel` media-serve branch; `/approvals` FE; security tests for gate purity, IDOR, media tenancy, forbidden fields, state machine, feedback caps.

**This story does not own:** US-11.2 `changes_requested` / revision_count / change-request form; US-11.3 ready-to-publish list polish / download export UX; Cliente CTA picker; Cliente QA override writes; QA run / catalog mutation; branding FFmpeg; Instagram publish; weekly cron enqueue; RBAC beyond `requireActive()`; auth redesign.

**Terminology:** **Aprobación** · **Paquete** · **Cliente** · **Operator** · **Ensamblado** · **caption de Instagram** · **disclosure** · **Veredicto QA**. Technical names `ensureApprovalPackageForAssembledReel`, `decideApproval`, `getQaGateStatusForAssembledReel` are canonical. Do not expose override as a Cliente capability; “approval decision” is not a product noun.

---

### Threat Summary (US-11.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **POST decide with `{ qaPassed: true }` / `{ ready: true }`** | Approval-gate bypass (baseline Top 5 #2) | Schemas **reject** readiness fields; handler calls **`getQaGateStatusForAssembledReel`** on create **and** decide — DB only |
| **Decide on ungated / blocking / uncovered Reel** | Content reaches `approved` without QA resolution | Gate `ready !== true` → typed **`QA_GATE_NOT_READY`**, **no** status write |
| **Create package without branding / CTA / gate** | Cliente sees incomplete or ungated Paquete | Ensure requires assembly `completed` + `branding_status = completed` + non-null branded output + gate ready + non-null `selected_cta_index` |
| **IDOR via `approvalId` / `assembledReelId` / media `assetId`** | Cross-tenant preview or decision | All loads **`WHERE … AND client_id = $serverClientId`**; foreign → **404** uniform |
| **Inactive / anonymous Cliente hits approvals** | Unauthorized gate / media access | **`requireActive("handler")` first** on every Cliente action + media branch |
| **Widen media serve too broadly** | Leak `generated_video` / `voiceover` / foreign MP4 | Widen **only** `assembled_reel`; ownership `row.client_id === session.id`; keep Operator path; do **not** widen other types |
| **Smuggle `status: approved` / `clientId` / `decidedBy`** | Forge decision or tenancy | `.strict()` decision input; actor + `client_id` from `getCurrentUser()`; status only via state machine |
| **Double-decide / skip `pending_client`** | Replay approve after reject or race | Server state machine: only `pending_client` → `approved` \| `rejected`; else **`INVALID_TRANSITION`** |
| **Write `changes_requested` in Phase A** | Scope creep / US-11.2 bypass | Phase A decision enum **`approved` \| `rejected` only**; hide request-changes UI |
| **XSS via `clientFeedback` / override reason / caption** | Script on `/approvals` | Length caps; plain text / React text / i18n; **no** `dangerouslySetInnerHTML` |
| **Oversized reject feedback** | Storage / prompt fuel DoS (US-11.2 later) | Trim + **0–500** chars (empty OK on reject) |
| **Package DTO over-exposure** | Leak `storage_key`, spend, prompts, foreign ids | Minimal DTO: preview URL via authenticated route only; no cost / keys / raw LLM / storage paths |
| **Cliente calls override / sets gate ready** | Soft-pass legal class | No Cliente override action; audit is **read-only** render of server DTO |

**Residual risk accepted:** Cliente trust for own content — owning Cliente can approve/reject gated packages (product intent). Ensure-on-list may create `pending_client` rows for any of the client's gated assemblies (no Operator “send” button) — bounded by gate prerequisites. Override `reason` visible to Cliente as plain text (US-10.2 handoff). Hardcoded local user until auth universal is sanctioned. Phase A does not re-check live consent at decide beyond what the QA gate already encodes — publish (ADR-0002) must still re-check `approved` + any future live gates.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_approvals.status` | **Highest** — publish / Aprobación gate | Service-role Node writes only; state machine; gate re-check before decide |
| Gate readiness (`getQaGateStatusForAssembledReel`) | **Highest** — create + decide authority | DB report + overrides ledger only; never request flags |
| Branded `assembled_reel` MP4 bytes | **High** — tenant likeness/content | Authenticated media route; ownership match; `Cache-Control: private, no-store` |
| Package caption / hashtags / CTA / disclosure | Medium–High — public-facing brand voice | Loaded server-side from owned caption/assembly/profile; display only |
| `qaOverrides[]` audit (reason text) | Medium — Operator rationale visible to Cliente | Read-only; length-capped plain text; no Cliente write |
| `client_feedback` | Medium — future US-11.2 prompt fuel | Optional; trim 0–500; plain text |
| `client_id` / `decided_by` | High — tenancy + attribution | From `getCurrentUser()` only — never body |

**Boundaries:**

1. **Browser (Cliente) → `ensureApprovalPackageForAssembledReel` / list / get / `decideApproval`** — Untrusted: UUIDs + optional feedback + decision enum only. **`requireActive("handler")` first**. Gate and tenancy resolved server-side. No Operator-only path required for Phase A Cliente surfaces.
2. **Browser (Cliente) → `/approvals` UI** — Presentation only. Disabled buttons are **not** controls; server gate + state machine remain authority.
3. **Browser (Cliente or Operator) → `GET /api/media/assets/[assetId]` for `assembled_reel`** — Untrusted UUID. Session → ownership → stream. Cliente: **`requireActive` + `row.client_id === user.id`**. Operator: existing **`requireOperator` + ownership** retained. Foreign → **404**.
4. **Handlers → `getQaGateStatusForAssembledReel`** — Trusted server import; must not pass HTTP body readiness into the helper.
5. **Handlers → Postgres `neuramark_approvals`** — Parameterized INSERT/UPDATE; `client_id` from session; RLS deny-by-default.
6. **Cliente → override / QA run** — **No write boundary:** audit render only.

---

## Abuse Cases Considered

- *As a malicious actor, I POST `decideApproval({ approvalId, decision: "approved", qaPassed: true })`* → **Blocked:** forbidden fields; gate re-check ignores request; ungated → **`QA_GATE_NOT_READY`**.
- *As a malicious actor, I POST `{ ready: true }` / `{ overrides: […] }` / `{ status: "approved" }` on ensure or decide* → **Blocked:** `.strict()` + forbidden-key scan; status only via state machine after gate.
- *As a malicious actor, I decide on `{ approvalId: "<victim-uuid>" }`* → **Blocked:** load scoped by server `client_id`; foreign → **404**.
- *As a malicious actor, I GET `/api/media/assets/<victim-assembled-reel-uuid>` as Cliente* → **Blocked:** ownership mismatch → **404**.
- *As a malicious actor, I GET a `generated_video` or `voiceover` asset as Cliente after this widen* → **Blocked:** those branches stay Operator-only; this story does not widen them.
- *As an inactive user, I call list/decide/media* → **Blocked:** `requireActive` → **401/403**, no side effects.
- *As a malicious actor, I ensure a package for an ungated / unbranded / CTA-missing assembly* → **Blocked:** prerequisites + gate; typed errors; no `pending_client` INSERT when not ready.
- *As a malicious actor, I re-approve an already `rejected` / `approved` row* → **Blocked:** **`INVALID_TRANSITION`**; no write.
- *As a malicious actor, I POST `decision: "changes_requested"` in Phase A* → **Blocked:** decision schema allows **`approved` \| `rejected` only**.
- *As a malicious actor, I set `decidedBy` / `clientId` in the body* → **Blocked:** forbidden; actor from session.
- *As a malicious actor, I inject HTML/script in `clientFeedback` or rely on override reason XSS* → **Contained:** length cap; React text nodes; no HTML sink.
- *As a malicious actor, I spam ensure/decide to create noise* → **Bounded:** light rate limit recommended (`approval_ensure` / `approval_decide` — CONTRACT freezes keys); UI debounce is not a control.
- *As UI, I hide Approve when gate stale but call decide anyway* → **Blocked:** server re-checks gate on decide (UI non-authoritative).
- *As a Cliente, I call `overrideQaCheck` to open the gate* → **Blocked:** US-10.2 Operator-only (unchanged); this story adds no Cliente override path.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-11.1 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding — do not weaken adjacent paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)* — Operator media path retained
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on new `neuramark_*` tables; privileged access via Node service-role only *(US-14.5)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components *(US-14.5)*
- [ ] **[SEC] QA verdicts are computed and stored server-side; no endpoint accepts a client-supplied "passed" flag, and the approval gate (US-11.1) reads QA status from the DB, not from the request** *(US-10.1 — enforced here on create + decide)*
- [ ] **[SEC] Gate extension purity:** `getQaGateStatusForAssembledReel` readiness remains DB-only; never honors caller-supplied `passed` / `ready` / override flags from HTTP *(US-10.2)*
- [ ] **[SEC] Media serve ownership:** authenticated route; foreign asset → **404**; never expose `storage_key` in URL *(US-9.2 / US-3.3)*

**US-11.1 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] The gate "assembly complete + QA passed or validly overridden" is re-checked server-side when the approval package is created AND when a decision is submitted — a direct POST to the decision endpoint for an ungated Reel is rejected**
- [ ] **[SEC] Approval package lookups are scoped to the current client; a Reel/approval ID belonging to another client returns 404 (IDOR guard)**

**Added in this review (binding for US-11.1 BUILD):**

- [ ] **[SEC] (added) Every Cliente approval Server Action / Route Handler calls `requireActive("handler")` as its first await** before validation, assembly/approval load, gate check, or write; failure → 401/403, **no side effects**
- [ ] **[SEC] (added) Gate purity on create and decide:** both `ensureApprovalPackageForAssembledReel` and `decideApproval` must call **`getQaGateStatusForAssembledReel(assembledReelId)`** (server import) and require **`ready === true`** before INSERT/`pending_client` create side effects (ensure) or status UPDATE (decide). If not ready → typed **`QA_GATE_NOT_READY`** (CONTRACT exact), **no** status write. **Never** accept or honor request `qaPassed`, `qa_passed`, `passed`, `ready`, `gate`, `overrides`, `overriddenCheckKeys`, `uncoveredFailedCheckKeys`, `hasBlockingFailures`
- [ ] **[SEC] (added) Assembly prerequisites on ensure (server-side):** load `neuramark_assembled_reels` with **`WHERE id = $assembledReelId AND client_id = $serverClientId`**; require `status = 'completed'` **and** `branding_status = 'completed'` **and** non-null branded `output_media_asset_id`; else typed error — **no** approval row. Caption must have non-null **`selected_cta_index`** else **`CAPTION_CTA_NOT_SELECTED`** (or CONTRACT-exact)
- [ ] **[SEC] (added) Pointer-only / minimal inputs:** ensure accepts **`{ assembledReelId: uuid }` only** (`.strict()`). Decide accepts **`{ approvalId: uuid, decision: 'approved' | 'rejected', clientFeedback?: string }` only** (`.strict()`). Reject forbidden fields including: `qaPassed`, `qa_passed`, `passed`, `ready`, `status` (as write authority), `clientId`, `client_id`, `decidedBy`, `decided_by`, `decidedAt`, `assembledReelId` (on decide — resolve from owned approval row), `overrides`, `overrideAll`, `checks`, `severity`, `storage_key`, `previewUrl`, cost fields, `force` → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Decision authz + state machine (Phase A):** only **`pending_client` → `approved` \| `rejected`**. Actor `decided_by` = `getCurrentUser().id`. Already-decided or non-pending → **`INVALID_TRANSITION`**. Schema **must not** accept `changes_requested` as a Phase A decision value. No publish writes
- [ ] **[SEC] (added) Tenancy on `neuramark_approvals`:** column `client_id` NOT NULL, set from session at INSERT (denormalized from owned assembly). Every SELECT/UPDATE scoped by server `client_id`. Foreign `approvalId` or `assembledReelId` → **404** uniform (not 403 with body leak)
- [ ] **[SEC] (added) List / get scoping:** `listPendingApprovals` returns only current client's `pending_client` rows (or empty). `getApprovalPackage` loads by `approvalId` + `client_id` → foreign **404**
- [ ] **[SEC] (added) Media serve widen — `assembled_reel` only:** extend `GET /api/media/assets/[assetId]` so **`assembled_reel`** may be served when **`requireActive("handler")` succeeds and `row.client_id === user.id`**. Retain existing Operator path (`requireOperator` + ownership). **Do not** widen `generated_video` or `voiceover` to Cliente. UUID validation; ownership mismatch → **404**; **`Cache-Control: private, no-store`**; never put `storage_key` in the URL or DTO
- [ ] **[SEC] (added) Package video URL:** DTO `previewUrl` must be the authenticated media route (`/api/media/assets/{assetId}`) for the **server-resolved** branded `output_media_asset_id` — never a Storage public URL, signed long-lived URL in client HTML, or static `/public` path
- [ ] **[SEC] (added) Reject feedback cap:** `clientFeedback` optional; after trim, length ∈ **[0, 500]**; over-max → validation error; empty/whitespace may store NULL. Plain text only
- [ ] **[SEC] (added) Package DTO minimal:** `approvalId`, `assembledReelId`, `status`, `video.{ assetId, previewUrl }`, caption fields, `hashtags`, `disclosure`, `qaOverrides` audit (`checkKey`, `reason`, `createdAt` — US-10.2 shape), timestamps — **no** `storage_key`, prompts, raw LLM JSON, spend/cost fields, service keys, foreign writeable `clientId`
- [ ] **[SEC] (added) XSS:** caption, hashtags, disclosure, override reasons, `clientFeedback` rendered as plain text / i18n / PrimeReact only — **no** `dangerouslySetInnerHTML`
- [ ] **[SEC] (added) No Cliente override / QA authority:** no Cliente-callable override or “mark QA passed” action; qaOverrides on the package are **read-only**
- [ ] **[SEC] (added) DDL:** `neuramark_approvals` with `neuramark_` prefix; FK `assembled_reel_id` → `neuramark_assembled_reels`; **UNIQUE (`assembled_reel_id`)**; FK `client_id` / `decided_by` → `neuramark_clients`; CHECK status enum includes `pending_client` \| `approved` \| `rejected` \| `changes_requested`; RLS **enabled, zero policies**. No US-11.2 revision columns in this migration
- [ ] **[SEC] (added) Rate limit (light):** reuse `neuramark_agent_rate_limits` with keys such as **`approval_ensure`** / **`approval_decide`** (CONTRACT exact); over-limit → **429**, no write. UI debounce is not a control
- [ ] **[SEC] (added) Automated security tests cover at least:** `requireActive` failure → no write; ungated ensure → no row / `QA_GATE_NOT_READY`; ungated decide → no status change; smuggled `qaPassed`/`ready`/`status`/`clientId` → `FORBIDDEN_FIELDS`; foreign `approvalId` / `assembledReelId` → **404**; Cliente `assembled_reel` own asset → 200; Cliente foreign `assembled_reel` → **404**; Cliente `generated_video` / `voiceover` still denied; double-decide → `INVALID_TRANSITION`; `changes_requested` decision rejected; feedback >500 rejected; CTA null on ensure → `CAPTION_CTA_NOT_SELECTED`; gate helper not passed request flags (unit/integration); RLS enabled zero policies; grep — no public static serve of assembled MP4

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Auth — **Cliente `requireActive` first** (APPROVE)

| Surface | Gate |
|---|---|
| ensure / list / get / decide | **`requireActive("handler")` first** |
| `assembled_reel` media (Cliente) | **`requireActive("handler")` + ownership** |
| `assembled_reel` media (Operator) | **`requireOperator("handler")` + ownership** (retain) |

**Condition:** No identity from headers/body; `client_id` / `decided_by` from session only.

#### 2. Gate re-check — **create AND decide** (APPROVE — USER_STORIES [SEC])

| Hook | Rule |
|---|---|
| Ensure | Call `getQaGateStatusForAssembledReel`; `ready` required before INSERT |
| Decide | Call again on the approval’s `assembled_reel_id`; `ready` required before UPDATE |
| Purity | Import helper; **never** trust request readiness / override flags |

**Condition:** CONTRACT freezes error code `QA_GATE_NOT_READY` and documents that UI disable is non-authoritative.

#### 3. Inputs — **minimal + forbidden-key scan** (APPROVE)

| Action | Allowed fields |
|---|---|
| Ensure | `{ assembledReelId }` |
| Decide | `{ approvalId, decision: 'approved' \| 'rejected', clientFeedback? }` |
| List / get | `{ approvalId }` on get only |

**Condition:** CONTRACT documents `findForbiddenApprovalKeys` (mirror US-10.1/10.2 pattern).

#### 4. State machine Phase A (APPROVE)

```ts
// Frozen intent — CONTRACT exact
// pending_client → approved | rejected only
// changes_requested reserved for US-11.2 — not writable here
// decided_by / decided_at set server-side on successful decide
```

#### 5. Media serve widen (APPROVE WITH CONDITIONS)

| `asset_type` | Auth after US-11.1 |
|---|---|
| `assembled_reel` | **Cliente `requireActive` + ownership** **or** **Operator `requireOperator` + ownership** |
| `generated_video` / `voiceover` | **Operator only** (unchanged) |
| `client_logo` / `cover_frame` | Unchanged (already Cliente-capable) |

**Condition:** Prefer try-Cliente-then-Operator **or** unified “active session + ownership, Operator role optional for same-tenant” — CONTRACT freezes exact branch order without weakening 404 uniformity. **Do not** serve without ownership match.

#### 6. Feedback length (APPROVE PO lean)

Optional reject notes: trim, **0–500**, empty → NULL. Constants in CONTRACT (may reuse or sibling `APPROVAL_FEEDBACK_MAX_LENGTH = 500`).

#### 7. Package DTO (APPROVE)

Server-composed only; preview via authenticated route; qaOverrides read-only audit; no cost/storage_key/raw LLM.

#### 8. Ensure-on-list (APPROVE PO lean)

Batch-ensure for current client's gated assemblies is allowed; still must pass gate + branding + CTA per reel; no Operator send button required Phase A.

#### 9. No new packages

Zod already sanctioned. No browser Supabase. Reuse media route + gate helper + rate-limit table.

---

### Open questions — SECURITY resolutions

| # | Question (PREP) | Resolution |
|---|---|---|
| 1 | Ensure-on-list vs Operator “Send to approval”? | **APPROVE ensure-on-list/detail** — still gate-bound; not a bypass |
| 2 | Reject feedback required? | **APPROVE optional 0–500** |
| 3 | Show decided history on `/approvals`? | **APPROVE No Phase A** — pending only (reduces IDOR surface on list) |
| 4 | Cliente CTA picker at approve? | **APPROVE defer** — display Operator-selected CTA only |
| 5 | Minimal download on approve? | **APPROVE defer to US-11.3** — preview via media route only |
| 6 | Rate limit ensure/decide? | **APPROVE light yes** — do not waive |
| 7 | Re-check live consent at decide beyond QA gate? | **APPROVE rely on gate helper for Phase A**; ADR-0002 / publish must still re-check `approved` (+ any future live consent). Do not invent a second consent path that forks US-3.2 here |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Skip gate re-check on ensure **or** decide | **REJECT** |
| Honor request `qaPassed` / `ready` / client override flags | **REJECT** |
| Accept client-writable `status` / `decidedBy` / `clientId` | **REJECT** |
| Return foreign approval/reel/media as **403** with distinguishing body (use **404**) | **REJECT** |
| Widen `generated_video` / `voiceover` to Cliente | **REJECT** |
| Serve `assembled_reel` without `requireActive`/`requireOperator` + ownership | **REJECT** |
| Put branded MP4 under `/public` or unauthenticated Storage URL | **REJECT** |
| Write `changes_requested` in Phase A decide | **REJECT** (US-11.2) |
| Ship Cliente override / “mark QA passed” action | **REJECT** |
| Skip `requireActive` on Cliente approval surfaces | **REJECT** |
| Put `@supabase/supabase-js` or service-role in Client Components | **REJECT** |
| Expose `storage_key`, spend, or raw LLM in package DTO | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-11.2:** Request-changes must enforce revision limit atomically; treat `client_feedback` / change text as untrusted prompt fuel; still re-check gate before leaving `pending_client` if product requires re-queue. Do not weaken Phase A decision schema by allowing `changes_requested` early without SECURITY revisit.
- **US-11.3 / ADR-0002 publish:** Re-check `status === 'approved'` (and any live consent/QA) server-side; download only via authenticated ownership-checked routes — never static paths.
- **Multi-tenancy / RLS:** `client_id` + deny-by-default now; additive policies later.
- **Media serve:** Cliente widen is additive for `assembled_reel` only; keep type-specific matrix so future asset types default to deny.
- **Do not** later add Cliente self-serve “force ready”, Operator SQL-less approve-for-client without session tenancy, or unauthenticated preview links for marketing shares without a new story (signed, expiring, scoped).

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-11.1/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `requireActive("handler")` first on ensure/list/get/decide
- [ ] Ensure + decide both call `getQaGateStatusForAssembledReel`; `QA_GATE_NOT_READY` documented
- [ ] Forbidden-keys lists for ensure + decide (includes readiness / tenancy / status spoof)
- [ ] Assembly branding + CTA prerequisites + error codes
- [ ] `neuramark_approvals` DDL: columns, UNIQUE, CHECKs, FKs, indexes, RLS zero policies, `client_id`
- [ ] State machine: `pending_client` → `approved` \| `rejected` only; `INVALID_TRANSITION`
- [ ] Feedback 0–500 trim rules
- [ ] Package DTO fields; no `storage_key` / cost / raw LLM
- [ ] Media serve matrix: Cliente+Operator `assembled_reel`; Operator-only generated/voiceover
- [ ] Rate-limit keys `approval_ensure` / `approval_decide` (or CONTRACT-exact)
- [ ] Non-goals: US-11.2 changes_requested writes, US-11.3 download polish, Cliente CTA picker, Cliente override
- [ ] Tests listed for all SEC rows above
- [ ] **Reviewed by FE** line present before BUILD

---

## CONTRACT freeze list (binding summary)

1. **Auth:** `requireActive("handler")` first on all Cliente approval actions; media Cliente branch same.  
2. **Gate:** Re-check `getQaGateStatusForAssembledReel` on **create and decide**; DB-only; never request `passed`/`ready`.  
3. **Inputs:** Ensure `{ assembledReelId }`; decide `{ approvalId, decision, clientFeedback? }` — forbidden-key scan.  
4. **Tenancy:** `client_id` on approvals; IDOR → **404** for approval/reel/media.  
5. **State machine:** `pending_client` → `approved` \| `rejected` only; actor from session.  
6. **Media:** Widen **`assembled_reel`** to owning Cliente; do **not** widen `generated_video` / `voiceover`.  
7. **Feedback:** Optional reject text, trim **0–500**.  
8. **DTO:** Minimal package; authenticated `previewUrl` only; qaOverrides read-only.  
9. **DDL:** `neuramark_approvals`, UNIQUE assembled reel, RLS zero policies.  
10. **Tests:** Gate fail on decide; IDOR; media tenancy; forbidden fields; double-decide; CTA null.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (non-blocking for CONTRACT start):** CONTRACT must freeze forbidden-keys lists, gate re-check on both ensure and decide, media serve matrix (Cliente `assembled_reel` only), state machine + feedback cap, DDL, and explicit non-goals (no `changes_requested` write, no generated/voiceover widen, no Cliente override).

---

## BUILD vetoes (summary)

1. Skipping gate re-check on package create or decision.  
2. Honoring client-supplied `qaPassed` / `ready` / override / status authority fields.  
3. IDOR responses that leak existence via 403 bodies — use **404**.  
4. Serving `assembled_reel` without auth + ownership, or widening `generated_video` / `voiceover`.  
5. Cliente approval actions without `requireActive`.  
6. Phase A writes of `changes_requested` or Cliente override/QA pass.  
7. DTO/`previewUrl` exposing `storage_key`, public Storage URLs, or cost fields.  
8. Browser Supabase / service-role in Client Components.
