# Security Design Review — US-4.2

**Story:** US-4.2 — Review and adjust strategy before scripting  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-4.2, US-5.1 `[SEC]`), `plan/stories/US-4.1/SECURITY.md` + `CONTRACT.md` (inherit floors), `plan/stories/US-14.5/SECURITY.md` (`requireOperator` floor), `lib/content-strategy/` (US-4.1 BUILD), `lib/contracts/content-strategy.ts`, `supabase/migrations/20260830130000_neuramark_content_strategies.sql`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and continues the US-4.1 trust model: **Operator-gated** Server Actions mutate an existing **`draft`** strategy row in place (brief jsonb UPDATE) and transition **`draft` → `approved`** through a **dedicated approve path** with a **server-side state machine** — the client never supplies `status`, `approved_by`, or `approved_at`. **`approved_by`** is set from **`getCurrentUser()`** after **`requireOperator()`**; brief edits run through the same **Zod `.strict()` + allowlist validation** as generation; row access is **IDOR-safe** via `(strategyId, server-resolved client_id)`; and a **lock-after-scripts floor** blocks brief mutation once **`neuramark_reel_scripts`** references the strategy (configurable, default **on**) so US-5.1 can rely on immutable approved input.

No REDESIGN. No veto of PO lean defaults (edit latest viewed draft row; approve sets audit columns; hardcoded local user OK for `approved_by` display until auth is universal; Cliente read remains out of this story). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-4.1 / US-14.5 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; `client_id` server-resolved only (V1: `getCurrentUser().id` after operator gate); RLS deny-by-default on `neuramark_*` tables; service-role Node only; no `@supabase/supabase-js` in Client Components; US-4.1 generate still INSERT-only versioning; never DELETE strategy history; `validateBriefAgainstAllowlists()` post-Zod; forbidden-field rejection on smuggled authority keys.

**This story owns:** migration adding `approved_by` / `approved_at`; Operator-gated **`updateContentStrategyBrief`** and **`approveContentStrategy`** Server Actions; server-only row load/update helpers with IDOR scoping; extended forbidden-key list for edit/approve inputs; **`strategyHasScripts()`** lock helper (table may not exist until US-5.1 — helper returns `false` when table absent, **must** enforce once table exists); extended read DTO with approval metadata; security tests for operator gate, state machine, IDOR, brief validation, lock, forbidden fields.

**This story does not own:** Video Script agent jobs (US-5.1 — but must consume the lock floor defined here); Cliente read-only brief UI; strategy history list UI; un-approve / revert to draft; cron automation; cost policy; new LLM spend paths.

**Terminology:** **Estrategia semanal** · **brief** (technical jsonb) · **Operator** · **Approve strategy** (product CTA). Technical names `contentStrategyBriefSchema`, `validateBriefAgainstAllowlists`, `requireOperator` are canonical.

---

### Threat Summary (US-4.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator edits or approves strategy** | Cliente alters production plan or bypasses human review | **`updateContentStrategyBrief`** and **`approveContentStrategy`** call `requireOperator("handler")` as **first** await; failure → 401/403, **no UPDATE** |
| **Client sets `status: "approved"` or arbitrary enum** | Skip human review; poison downstream Script agent | Request schemas **exclude `status`**; approve transition **only** via `approveContentStrategy`; UPDATE statements set status in code, never from input |
| **Client forges `approved_by` / `approved_at`** | False audit trail | Columns set **only** in approve handler from `getCurrentUser()` after gate; body fields **rejected** via forbidden-key list |
| **IDOR via `strategyId`** | Operator reads/edits another tenant's brief | Every load/update: `WHERE id = $strategyId AND client_id = $serverResolvedClientId`; wrong/missing → **404** uniform |
| **Smuggled `client_id` on PATCH** | Cross-tenant write | Same forbidden-key floor as US-4.1; tenancy from session after `requireOperator()` |
| **Unvalidated brief jsonb on edit** | Slot injection, slug escape, modalidad outside allowlist breaks Script agent / compliance | Full `contentStrategyBriefSchema.strict()` + `validateBriefAgainstAllowlists()` with fresh Playbook/Trend/profile context **before** UPDATE |
| **Edit approved or script-backed strategy** | Scripts generated from stale brief; audit integrity loss | **`status = 'approved'`** rows: brief **immutable** (409/422). **`strategyHasScripts(strategyId)`** → **`STRATEGY_LOCKED`**, no brief UPDATE (default **on**) |
| **Approve non-draft row** | Double-approve, state confusion | Approve UPDATE includes `WHERE status = 'draft'`; 0 rows → **`STRATEGY_NOT_DRAFT`** / **`INVALID_STATE_TRANSITION`** |
| **Direct PATCH Route Handler bypassing gate** | Unauthenticated mutation | **No** public REST PATCH; Server Actions only, same envelope as US-4.1 |
| **Partial jsonb merge allowing extra keys** | Hidden instruction payloads in brief | **Replace entire `brief`** with validated object — no deep-merge from untrusted partial patches |

**Residual risk accepted:** Operator trust model — an Operator can approve their own edits (intended). Multiple **`approved`** rows may coexist per `(client_id, week_start)` when a new draft is approved after an older approved version; US-5.1 must target an explicit **`strategy_id`** and verify **`approved`** server-side (already in US-5.1 `[SEC]`). Semantic sanitization of Operator-edited free text is not attempted — containment matches US-4.1 (schema bounds only).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_content_strategies.brief` jsonb | Medium–High — authoritative input to Script agent | Operator-edited via gated Server Action; Zod + allowlist before persist; locked after scripts |
| `status` | High — publish-pipeline gate | Server state machine only; never client input |
| `approved_by`, `approved_at` | Medium — audit / accountability | Server-set on approve from `getCurrentUser()` |
| `strategyId` in action input | Medium — row pointer, not authority | Must pair with server-resolved `client_id` on every query |
| Operator session | High — can alter weekly production plan | `requireOperator()` on edit + approve + extended read |

**Boundaries:**

1. **Browser (Operator) → edit/approve Server Actions** — Untrusted. Sends `strategyId` + full validated brief shape (edit) or `strategyId` only (approve). No `status`, no audit fields, no `client_id` authority.
2. **Server Action → `requireOperator()` → load row scoped by `client_id`** — Gate before SELECT/UPDATE.
3. **Server Action → Zod + allowlists → UPDATE** — Same validation stack as US-4.1 generate persist path.
4. **Server Action → Postgres** — Parameterized UPDATE; service-role; RLS deny-by-default unchanged.
5. **US-5.1 (downstream) → strategy row** — Must re-verify `status = 'approved'` and `client_id`; must not trust caller assertion alone (US-5.1 `[SEC]` — referenced as lock consumer, not implemented here).

---

## Abuse Cases Considered

- *As a Cliente, I can PATCH the strategy brief or approve it* → **Blocked:** `requireOperator("handler")` first; 403, no UPDATE.
- *As a malicious actor, I can POST `{ strategyId, status: "approved" }`* → **Blocked:** `status` in forbidden-key list; approve only via `approveContentStrategy`.
- *As a malicious actor, I can POST `{ approved_by: "<victim uuid>" }`* → **Blocked:** forbidden keys; server sets `approved_by = operator.id` from `getCurrentUser()`.
- *As a malicious actor, I can PATCH another client's strategy by UUID* → **Blocked:** SELECT/UPDATE scoped by server-resolved `client_id`; foreign id → **404**.
- *As a malicious actor, I can smuggle `client_id` to edit a victim brief* → **Blocked:** forbidden fields; tenancy from session only.
- *As a malicious actor, I can inject invalid `formatoPlaybookSlug` or disallowed `modalidad` via edit* → **Blocked:** Zod + `validateBriefAgainstAllowlists()` before UPDATE.
- *As a malicious actor, I can shrink slots to 0 or add 20 slots* → **Blocked:** `contentStrategyBriefSchema` min/max slot bounds (≥3, ≤7).
- *As a malicious actor, I can edit an already-approved strategy after scripts exist* → **Blocked:** approved rows immutable; `strategyHasScripts()` → **`STRATEGY_LOCKED`** on brief UPDATE.
- *As a malicious actor, I can call US-5.1 script generation with a `draft` strategy id* → **Blocked in US-5.1** (verify `approved` server-side); US-4.2 ensures approve path is the only way to reach `approved`.
- *As a malicious actor, I can approve a strategy without Operator role by hitting a Route Handler* → **Blocked:** no unauthenticated PATCH Route Handler in BUILD.
- *As a malicious actor, I can revert `approved` → `draft`* → **Blocked:** no transition defined; enum write rejected.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-4.2 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken US-4.1 / auth paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_content_strategies`; privileged access via Node service-role only *(US-4.1)*
- [ ] **[SEC] Target `client_id` is server-resolved only** — V1: `getCurrentUser().id` after `requireOperator()`; request body **must not** carry authoritative `client_id` *(US-4.1)*

**US-4.2 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] Status transitions (`draft` → `approved`) are enforced server-side as a state machine; the client cannot set an arbitrary status value, and script generation endpoints verify `approved` status themselves rather than trusting the caller** *(USER_STORIES US-4.2)*

**Added in this review (binding for US-4.2 BUILD):**

- [ ] **[SEC] (added) `updateContentStrategyBrief` Server Action** calls `requireOperator("handler")` as its **first** await before validation, row load, or UPDATE; failure → 401/403, **no side effects**
- [ ] **[SEC] (added) `approveContentStrategy` Server Action** calls `requireOperator("handler")` as its **first** await before validation, row load, or UPDATE; failure → 401/403, **no side effects**
- [ ] **[SEC] (added) Client request schemas exclude authoritative fields:** `status`, `approved`, `approved_by`, `approved_at`, `approvedBy`, `clientId`, `client_id`, `version`, `weekStart` (as tenancy override), and all US-4.1 forbidden provider/auth keys. Presence → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Status state machine — allowed writes:**
  - **`draft` brief edit:** `updateContentStrategyBrief` may UPDATE `brief` (+ `updated_at`) **only** when current row `status = 'draft'` and lock check passes
  - **`draft` → `approved`:** **only** `approveContentStrategy` may set `status = 'approved'` with `WHERE status = 'draft'`
  - **Forbidden:** client-supplied status; `approved` → `draft`; `approved` → `approved`; arbitrary enum values; UPDATE `status` inside brief-edit action
- [ ] **[SEC] (added) `approved_by` and `approved_at` are server-authoritative:** on successful approve, set `approved_by = (await requireOperator("handler")).id` and `approved_at = now()` in the same UPDATE; never read these fields from the request; never accept Operator impersonation via body
- [ ] **[SEC] (added) Brief validation on edit (PATCH equivalent):** parse submitted brief with `contentStrategyBriefSchema.strict()`; run `validateBriefAgainstAllowlists()` using `getPlaybookForAgents()`, `getTrendSnapshotForWeek(row.week_start)`, and `getBusinessProfileForAgents(serverClientId).visualModeSummary.allowedModes`; on failure → **`VALIDATION_ERROR`** / **`AGENT_OUTPUT_INVALID`**, **no UPDATE**
- [ ] **[SEC] (added) IDOR-safe strategy row access:** load/update by `strategyId` **always** includes `AND client_id = $serverResolvedClientId`; missing or cross-tenant → **`NOT_FOUND` (404)** with uniform envelope (no existence oracle)
- [ ] **[SEC] (added) Approved rows are immutable:** `updateContentStrategyBrief` against `status = 'approved'` → **`STRATEGY_NOT_DRAFT`** or **`INVALID_STATE_TRANSITION`**; no brief UPDATE
- [ ] **[SEC] (added) Lock-after-scripts floor (US-5.1 handoff):** before brief UPDATE, call server helper `strategyHasScripts(strategyId)` (checks `neuramark_reel_scripts.strategy_id` when table exists). When **true** and config **`NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== 'false'`** (default **locked**), return **`STRATEGY_LOCKED`**, **no UPDATE**. US-5.1 must INSERT scripts referencing `strategy_id` only after strategy is `approved`
- [ ] **[SEC] (added) Approve preconditions:** row must exist, belong to server client, `status = 'draft'`, and **`strategyHasScripts` must be false** (cannot approve after scripts — edge guard). Concurrent approve: single-row UPDATE with status guard; 0 rows updated → typed conflict, not silent success
- [ ] **[SEC] (added) Operator read DTO** (extend `getLatestContentStrategy` or sibling loader): when `status = 'approved'`, expose **`approvedAt`** (ISO8601) and **`approvedByDisplayName`** (from server join / user lookup — hardcoded local user OK in dev); **never** expose internal auth tokens; **`approved_by` uuid** optional in DTO (Operator audit UI only)
- [ ] **[SEC] (added) No public Route Handler** for strategy edit/approve (`PATCH /api/content-strategies/*` forbidden). Server Actions under `lib/content-strategy/actions/` only
- [ ] **[SEC] (added) Full-brief replace semantics:** edit action replaces entire validated `brief` jsonb — no untrusted deep-merge of partial slot objects
- [ ] **[SEC] (added) Logging:** log `strategyId`, `clientId`, action (`update` \| `approve`), error **codes** only — never full brief bodies in production logs
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator edit/approve → 403 no UPDATE; smuggled `status` / `approved_by` → `FORBIDDEN_FIELDS`; foreign `strategyId` → 404; edit on approved row → rejected; invalid brief → no UPDATE; approve on draft sets `approved_by` from session mock; approve on non-draft → rejected; lock helper blocks edit when scripts exist (mocked); state machine rejects arbitrary status writes

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Two Server Actions — edit vs approve (APPROVE)

| Surface | Gate | Purpose |
|---|---|---|
| `updateContentStrategyBrief` | `requireOperator("handler")` first | Replace `brief` on **`draft`** row |
| `approveContentStrategy` | `requireOperator("handler")` first | Atomic **`draft` → `approved`** + audit columns |
| Strategy page RSC | `requireOperator("page")` | UX only |

Do **not** combine approve into a generic PATCH with a client `status` field. Do **not** allow approve inside the edit action via a boolean flag without a separate explicit action name — CONTRACT must freeze **two** actions so intent is auditable.

#### 2. Status state machine (APPROVE WITH CONDITIONS)

| From | To | Action | Owner |
|---|---|---|---|
| `draft` | `draft` | `updateContentStrategyBrief` (brief UPDATE) | US-4.2 |
| `draft` | `approved` | `approveContentStrategy` | US-4.2 |
| `approved` | * | **Forbidden** — immutable | US-4.2 |
| * | * (client POST) | **Forbidden** — no `status` in body | US-4.2 |

**Condition:** CONTRACT must document error codes: **`STRATEGY_NOT_DRAFT`**, **`INVALID_STATE_TRANSITION`**, **`STRATEGY_LOCKED`**.

#### 3. Audit columns — server-only (APPROVE)

Migration (new file, do not edit US-4.1 migration in place):

```sql
ALTER TABLE public.neuramark_content_strategies
  ADD COLUMN approved_by uuid NULL REFERENCES public.neuramark_clients(id),
  ADD COLUMN approved_at timestamptz NULL;

-- Enforce: approved_at/by present iff status = approved (CHECK or app-layer — CONTRACT picks one; lean: app-layer + test)
```

| Rule | Detail |
|---|---|
| Set on | **`approveContentStrategy` success only** |
| `approved_by` | `(await requireOperator("handler")).id` — maps to operator's `neuramark_clients.id` |
| `approved_at` | Server `now()` |
| Client input | **Rejected** if present |

#### 4. Brief validation on edit (APPROVE)

Same stack as US-4.1 generate persist:

1. `contentStrategyBriefSchema.strict().parse(brief)`
2. Load allowlist context (profile, playbook, trend for row's `week_start`)
3. `validateBriefAgainstAllowlists()` → map violations to fields
4. Only then `UPDATE neuramark_content_strategies SET brief = $1, updated_at = now() WHERE id = $2 AND client_id = $3 AND status = 'draft'`

Operator-editable fields (product): **`pillars`**, **`themes`**, slot **`tema`**, **`angle`**, **`ctaHint`** — all already in schema; no parallel untyped edit path.

#### 5. IDOR-safe access (APPROVE)

```ts
// Frozen pattern — CONTRACT exact helper name
async function loadStrategyRowForOperator(params: {
  strategyId: string;
  clientId: string; // server-resolved
}): Promise<ContentStrategyRow | null> {
  // SELECT ... WHERE id = strategyId AND client_id = clientId
  // null → NOT_FOUND (404 envelope)
}
```

Edit and approve **must** use this helper (or equivalent). Never SELECT by `strategyId` alone.

#### 6. Lock-after-scripts floor for US-5.1 (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Helper | `strategyHasScripts(strategyId: string): Promise<boolean>` in `import "server-only"` module |
| Query | `EXISTS (SELECT 1 FROM neuramark_reel_scripts WHERE strategy_id = $1)` when table exists |
| Pre-US-5.1 | If table missing in test env, return `false`; migration US-5.1 adds FK `strategy_id → neuramark_content_strategies.id` |
| Config | `process.env.NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== 'false'` → default **locked** |
| Effect | Blocks **`updateContentStrategyBrief`**; approve should also fail if scripts already exist (data inconsistency guard) |
| US-5.1 obligation | Script batch job verifies **`status = 'approved'`** AND **`client_id`** match before agent invoke *(existing US-5.1 `[SEC]`)* |

**Condition:** US-5.1 CONTRACT must reference this helper and never skip lock check when regenerating scripts against an approved strategy without a dedicated supersede story.

#### 7. Forbidden fields — extend US-4.1 set (APPROVE)

Add to forbidden-key detection for edit/approve actions:

`status`, `approved`, `approved_by`, `approved_at`, `approvedBy`, `approvedAt`, `weekStart` (when used to override tenancy), `strategy_id` (snake_case alias smuggle).

Reuse US-4.1 forbidden keys for provider/auth smuggling.

#### 8. Regenerate interaction (APPROVE — informational)

US-4.1 **Generate** still **INSERT**s a new **`draft`** version. US-4.2 edits **UPDATE** the selected draft row in place. Approving v2 while v1 remains **`approved`** is allowed (history preserved). US-5.1 must accept explicit **`strategyId`**. US-4.2 UI should make clear which version is being approved — product/FE concern; security requires explicit id in approve action input.

---

## Future-Proofing Notes

- **US-5.1** re-verifies `approved` + `client_id` on every script job — US-4.2 approve path is necessary but not sufficient alone.
- **Un-approve / supersede approved** is out of scope — would need new enum value and audit story; do not smuggle via edit.
- **Cliente read** (SPEC) remains a separate story with `requireActive()` + tenancy — not Operator DTO reuse without review.
- **Multi-client Operator picker:** when it lands, `client_id` resolution must come from server-validated job context, not POST body — same floor as US-4.1.
- **Real auth:** `approved_by` FK to `neuramark_clients.id` survives; display name from profile lookup, not client input.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-4.2/CONTRACT.md` exists, spot-check before BUILD:

- [ ] `updateContentStrategyBrief` + `approveContentStrategy` frozen; both start with `requireOperator("handler")`
- [ ] Input schemas: edit = `{ strategyId, brief }`; approve = `{ strategyId }` — `.strict()`, no `status`
- [ ] Forbidden-key list extended; `FORBIDDEN_FIELDS` envelope
- [ ] State machine table + error codes: `STRATEGY_NOT_DRAFT`, `INVALID_STATE_TRANSITION`, `STRATEGY_LOCKED`
- [ ] Migration for `approved_by`, `approved_at` frozen
- [ ] `loadStrategyRowForOperator({ strategyId, clientId })` IDOR pattern
- [ ] Brief validation pipeline identical to US-4.1 (Zod + allowlists)
- [ ] `strategyHasScripts()` + `NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS` default
- [ ] Read DTO: `approvedAt`, `approvedByDisplayName` when approved
- [ ] No Route Handler PATCH; no Client Component Supabase
- [ ] US-5.1 cross-ref: script gen verifies `approved`; lock floor referenced
- [ ] Out of scope: Cliente read, un-approve, history UI, LLM regenerate

---

## CONTRACT freeze list (binding `[SEC]` summary)

Paste into CONTRACT **Security** section — do not reopen without security-architect review.

1. **Gate:** `requireOperator("handler")` **first** on **`updateContentStrategyBrief`** and **`approveContentStrategy`**; 401/403, no UPDATE on failure.
2. **Tenancy:** `client_id` **server-resolved only**; every SELECT/UPDATE includes `strategyId` **+** `client_id`; IDOR → **404**.
3. **State machine:** **`draft` → `approved`** **only** via **`approveContentStrategy`**; brief edit **only** on **`draft`**; **`approved` immutable**; client **`status` forbidden**.
4. **Audit:** `approved_by` = operator session id; `approved_at` = server timestamp; **never** from request body.
5. **Brief edit validation:** `contentStrategyBriefSchema.strict()` + **`validateBriefAgainstAllowlists()`** before UPDATE; full-brief replace, no partial merge.
6. **Lock-after-scripts:** `strategyHasScripts(strategyId)` blocks brief UPDATE when scripts exist; default **on** via env; US-5.1 must FK `strategy_id` and verify **`approved`** independently.
7. **Forbidden fields:** extended list includes `status`, audit columns, `client_id`, provider/auth smuggles.
8. **Surfaces:** Server Actions only — **no** public PATCH Route Handler.
9. **Read DTO:** expose approval metadata for Operator UI; no token leakage.
10. **Logging:** ids + codes only — no full brief in prod logs.
11. **Tests:** operator gate, IDOR, state machine, validation reject, lock, forbidden fields.
12. **Out of scope:** Cliente read, un-approve, US-5.1 agent implementation, new LLM paths.

---

## BUILD vetoes (summary)

1. **Edit or approve without `requireOperator()`** (including dev bypass).
2. **Accepting `status`, `approved_by`, or `approved_at` from the request.**
3. **SELECT/UPDATE by `strategyId` without server-resolved `client_id` filter.**
4. **Persisting brief edits without Zod `.strict()` + allowlist validation.**
5. **Updating brief on `approved` rows or when `strategyHasScripts()` is true (with lock enabled).**
6. **Generic PATCH Route Handler exposing strategy mutation without operator gate.**
7. **Deep-merge partial brief from client** (must replace whole validated brief).
8. **RLS policies granting `authenticated` access** to `neuramark_content_strategies`.
9. **Approve path that skips `WHERE status = 'draft'` guard.**
10. **Logging full brief bodies in production.**

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | One action or two (edit vs approve)? | **Two Server Actions** — auditable intent; no client `status` |
| 2 | Edit UPDATE vs INSERT new version? | **UPDATE selected `draft` row in place**; US-4.1 regenerate still INSERTs new draft version |
| 3 | Multiple approved rows per week? | **Allowed** (history preserved); US-5.1 uses explicit **`strategyId`** + server `approved` check |
| 4 | Lock configurable how? | **Env `NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS`** — default locked (`!== 'false'`) |
| 5 | `approved_by` FK target? | **`neuramark_clients.id`** of Operator session (same as `getCurrentUser().id`) |
| 6 | Un-approve? | **Out of scope** — no `approved` → `draft` transition in V1 |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff after CONTRACT (Operator editable brief + Approve CTA consume gated actions only; display `approvedByDisplayName` / `approvedAt` from server DTO).
