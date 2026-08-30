# US-4.2 — Review and adjust strategy before scripting

**Priority:** P0  
**Depends on:** US-4.1 ✅ · US-14.5 ✅ (`requireOperator()`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-4.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` PLAN Fase 3). DB migration under BE. No content-agents-engineer — reuse US-4.1 brief schema + allowlist validation only.  
**Canonical terms:** **Estrategia semanal** · **brief** · **Operator**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **INSERT new version on manual save** — edit UPDATEs existing row; only generate/regenerate INSERTs (US-4.1).
- **Edit / un-approve `approved` rows** — immutable; regenerate for new draft.
- **Lock brief after scripts exist** — deferred until `neuramark_reel_scripts` (US-5.1); document extension point only.
- **Cliente** read-only strategy surface.
- **US-5.1** script agent jobs or `neuramark_reel_scripts` table.
- **Editable pillars, tema, formato, modalidad, tactica, goal, day** in V1 — read-only in UI; regenerate if structural change needed.
- **Strategy history list** UI.
- **`approved` → `draft` rollback** or DELETE of strategy rows.
- Multichannel fields.

## Scope split

| Concern | Owner |
|---------|--------|
| Approval columns migration | **US-4.2** |
| UPDATE brief + approve state machine | **US-4.2** |
| Operator edit + approve UI on `/operator/strategy` | **US-4.2** |
| `getApprovedContentStrategy` (or equivalent) for US-5.1 gate | **US-4.2** (BE helper; consumed in US-5.1) |
| Video Script per slot | **US-5.1** (requires `approved`) |
| Lock-after-scripts enforcement | **US-5.1+** (when scripts table exists) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Edit persistence | **UPDATE** existing row by `strategyId`; **same `version`**; touch `updated_at` only (+ `brief`). Never INSERT on save. |
| Generate / regenerate | **Unchanged US-4.1** — INSERT new row, `version = max + 1`, `status = draft`. |
| Editable fields (V1) | `themes[]`, `slots[].angle`, `slots[].ctaHint` only. FE sends editable subset or full brief; BE validates **full** merged brief. |
| Read-only in edit UI | `pillars[]`, `slots[].tema`, `formatoPlaybookSlug`, `modalidad`, `tacticaTendenciaSlug`, `goal`, `dayOfWeek`, `slotIndex`. |
| Save validation | Zod `contentStrategyBriefSchema` + `validateBriefAgainstAllowlists` (playbook slugs, trend slugs, modalidad ⊆ client allowlist) — same as generate path. |
| Approve transition | **`draft` → `approved` only**; server-side state machine; reject if not `draft`; set `approved_by`, `approved_at` in same UPDATE. |
| Forbidden client input | No `status`, `version`, `clientId`, `approved_by`, `approved_at` in mutation bodies — server derives from session + row lookup. |
| Approval identity | `approved_by` = operator `neuramark_clients.id` from `getCurrentUser()`; display name from same helper for FE caption. |
| Edit eligibility | UPDATE brief only when row `status = 'draft'`; return typed error if `approved`. |
| Latest read | `getLatestContentStrategy` returns highest `version` row regardless of status; include approval metadata when `approved`. |
| US-5.1 lookup | **`getApprovedStrategyForWeek({ clientId, weekStart })`** — returns latest **`approved`** row (`ORDER BY version DESC LIMIT 1`) or null; US-5.1 verifies `approved` itself as defense-in-depth. |
| Operator route | **Extend `/operator/strategy`** — inline edit on existing page; no sub-route in V1. |
| Auth | `requireOperator("handler")` on **update** and **approve** Server Actions; page already gated via layout. |
| i18n | EN + ES for Save, Approve, status badges, approval caption, validation errors. |
| Lock after scripts | **Deferred V1.** CONTRACT/SECURITY documents: when US-5.1 adds scripts, optional config may block brief UPDATE if scripts exist for `strategy_id`; **not implemented in US-4.2**. |
| Rate limit | No new rate limit on save/approve (generate rate limit unchanged). |
| Error codes (lean) | Add `STRATEGY_NOT_DRAFT`, `STRATEGY_NOT_FOUND` (or reuse `NOT_FOUND` with distinct messageKey) — CONTRACT freezes. |

## Carry-forwards / reuse (do not reinvent)

- Brief schema + allowlist: `lib/contracts/content-strategy.ts`, `validateBriefAgainstAllowlists`, `allowlistViolationsToFields`.
- Row load: `loadLatestStrategyRow`, `loadOperatorClientsForStrategy`.
- Operator gate: `requireOperator()` from `lib/auth/require-user.ts`.
- Week validation: `trendWeekStartSchema`.
- Allowlist context: load playbook slugs, trend slugs for `weekStart`, `visualModeSummary.allowedModes` from `getBusinessProfileForAgents(clientId)`.
- UI shell: `StrategyPageView`, `StrategyBriefView` — extend, do not replace.
- PrimeReact inputs for editable text fields; existing read-only slot cards as base.
- `revalidatePath('/operator/strategy')` after successful save/approve.

---

## FE checklist

Concrete BE consumers: `updateContentStrategyBrief` Server Action; `approveContentStrategy` Server Action; extended `getLatestContentStrategy` response.

- [ ] **Status badge** on brief header: `draft` vs `approved`.
- [ ] **Approval caption** when `status = 'approved'`: operator display name + localized date/time from `approvedAt`.
- [ ] **Editable themes** list (add/remove/edit theme strings within schema max).
- [ ] **Per-slot editable fields** when draft: `angle`, `ctaHint` (text inputs).
- [ ] **Read-only display** for pillars, tema, formato, modalidad, tactica, goal, day (unchanged from US-4.1 cards).
- [ ] **Save changes** button (draft only); pending/disabled while saving; surfaces field errors from server.
- [ ] **Approve strategy** primary/secondary CTA (draft only); confirm dialog optional — PO lean: direct approve with toast success.
- [ ] **Disable edit + approve** when latest row is `approved`; show regenerate hint if Operator needs new draft.
- [ ] **No edit controls** when no strategy row (empty state unchanged).
- [ ] **EN + ES strings** in `messages/en.json` / `es.json` (save, approve, status labels, approval caption, new errors).
- [ ] **No Supabase in Client Components**; mutations via Server Actions only.
- [ ] **No Cliente** strategy route.

---

## BE checklist

Concrete FE consumers: Operator Strategy page save/approve actions; US-5.1 approved-strategy lookup (helper only, tests in 4.2).

- [ ] **Migration** add `approved_by uuid NULL REFERENCES neuramark_clients(id)`, `approved_at timestamptz NULL` to `neuramark_content_strategies`.
- [ ] **Extend Zod contracts** in `lib/contracts/content-strategy.ts`: update input, approve input, success envelopes, extended draft/approved view with `approvedBy` / `approvedAt`.
- [ ] **`updateContentStrategyBrief({ strategyId, weekStart, brief })`** — `requireOperator("handler")`; load row; verify `status = 'draft'` and tenancy; merge/validate brief; allowlist check; UPDATE `brief` + `updated_at`.
- [ ] **`approveContentStrategy({ strategyId, weekStart })`** — `requireOperator("handler")`; verify `draft`; SET `status = 'approved'`, `approved_by`, `approved_at`; reject smuggled status.
- [ ] **[SEC] State machine** — only server actions perform `draft` → `approved`; no client-settable status.
- [ ] **[SEC] Full brief validation** on save (Zod strict + allowlists); reject unknown keys.
- [ ] **[SEC] Tenancy** — `strategyId` must belong to session `clientId` + `weekStart` (V1 session client).
- [ ] **Extend `getLatestContentStrategy`** — return approval metadata; join or secondary load for approver display name.
- [ ] **`getApprovedStrategyForWeek({ weekStart })`** (or export from load module) — latest approved row for US-5.1 gate.
- [ ] `revalidatePath` for Operator Strategy route after save/approve.
- [ ] **Automated tests** extending `lib/content-strategy/content-strategy.test.ts`: save happy path; save on approved fails; approve happy path; approve twice fails; allowlist rejection on save; non-operator 403.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [ ] **ALTER** `neuramark_content_strategies` add nullable `approved_by`, `approved_at`.
- [ ] FK `approved_by` → `neuramark_clients(id)` ON DELETE RESTRICT (or SET NULL — CONTRACT freezes).
- [ ] Optional CHECK: when `status = 'approved'` then `approved_by IS NOT NULL AND approved_at IS NOT NULL` — CONTRACT/SECURITY decide.
- [ ] **Do not** change UNIQUE `(client_id, week_start, version)` or versioning semantics.
- [ ] **Do not** create `neuramark_reel_scripts` (US-5.1).
- [ ] RLS unchanged: deny-by-default, service-role Node only.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — edit/approve vs SPEC §3; no US-5.1 scope creep; Cliente read still deferred)
- [x] SECURITY.md (security-architect — state machine; no client status; approved immutability; lock deferral documented)
- [x] CONTRACT.md authored (nextjs-backend) — **Reviewed by FE** line required before BUILD
- [ ] BUILD (nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** CONTRACT (2026-08-30). SPEC-REVIEW + SECURITY + CONTRACT frozen. **Next gate:** FE signoff on CONTRACT → BUILD.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Partial vs full brief payload on save** — FE sends full `brief` or PATCH-shaped delta? **PO lean:** full `brief` envelope from client editor state (simplest validation); CONTRACT confirms.
2. **Approve without prior explicit save** — Approve uses last persisted brief only? **PO lean:** yes; no auto-save on approve; Operator must save edits first (FE disables approve while dirty, or approve saves-then-approves — CONTRACT picks one).
3. **Multiple approved versions same week** — v1 approved, v2 draft edited and approved: both `approved` rows exist? **PO lean:** only one transition at a time; latest approved for US-5.1 is highest-version row with `status = 'approved'`. Regenerate after approve always creates new `draft` without mutating approved row.
4. **`approved_by` FK on delete** — RESTRICT vs SET NULL if operator client deleted? **PO lean:** RESTRICT (operators are long-lived seed rows).
5. **Lock-after-scripts config key** — Add env/feature flag stub with no behavior? **PO lean:** omit until US-5.1; mention in SECURITY deferral note only.
6. **Cliente read** — Still deferred; confirm spec-guardian does not pull into US-4.2.

No SPEC amendment assumed in PREP: US-4.2 fulfills SPEC §3 human review before scripting; approval metadata satisfies audit lean for V1.
