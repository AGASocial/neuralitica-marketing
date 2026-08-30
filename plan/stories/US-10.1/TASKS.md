# US-10.1 — Run automated QA on script, caption, and video

**Priority:** P0  
**Depends on:** US-9.2 ✅ branded Ensamblado · US-6.1 ✅ captions · US-3.4 ✅ generic-avatar check · US-X.4 ✅ LLM catalog · US-7.1 ✅ budget · US-14.5 ✅  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-10.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **content-agents-engineer** (LLM QA agent + check merge) + **nextjs-backend** (DDL, orchestration, gate helper, budget) + **nextjs-frontend** (Operator QA panel). Per `docs/development/AGENT-ROSTER.md` Fase 5. **No** media-pipeline-engineer · **No** integrations-engineer in default BUILD.  
**Canonical terms:** **Veredicto QA** · **Ensamblado** · **Paquete de guion** · **caption de Instagram** · **Aprobación** · **Operator**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-10.2** override modal, reason field, `neuramark_qa_overrides`, Operator override endpoint.
- **US-11.1** Cliente approval package UI / `neuramark_approvals` writes — consume gate helper only.
- **Weekly cron** auto-QA (integrations-engineer) — document system seam only.
- **Vision / frame LLM** on assembled MP4.
- **New Operator nav route** — extend `/operator/scripts` only.
- **Cliente-facing QA panel**.
- **Client-editable** check catalog or severity.
- **RBAC** beyond `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_qa_reports` DDL + RLS deny-by-default | **BE** (nextjs-backend) |
| Check catalog keys + `blocking` / `overridable` map (code) | **BE** (+ content-agents for LLM keys) |
| Import `evaluateGenericAvatarNotOwnerCheck` | **BE** / agents (do not fork US-3.4) |
| Deterministic `own_avatar_consent` check | **BE** |
| LLM QA agent + Zod output schema | **content-agents-engineer** |
| `runQaForAssembledReel` orchestration + persist | **BE** |
| Budget gate + spend event for LLM | **BE** |
| Auto-chain after branding `completed` | **BE** |
| `getQaGateStatusForAssembledReel` (US-11.1 seam) | **BE** |
| Operator QA panel UI + i18n | **FE** (nextjs-frontend) |
| Extend list/detail DTO with QA summary | **BE** + **FE** |
| Override / `qa_overrides` | **US-10.2** |

## Implementer routing

| Agent | Owns |
|-------|------|
| **content-agents-engineer** | `lib/agents/content/*qa*` · prompt · LLM I/O Zod · unit tests with fixtures · merge contract with deterministic results |
| **nextjs-backend** | Migration · Server Actions · `lib/qa/` orchestration · rate limit · budget · gate helper · list DTO fields · auto-chain hook from branding complete |
| **nextjs-frontend** | `/operator/scripts` QA panel · badges · Run/Re-run · EN/ES · loading/empty/error |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-10.1-automated-qa`** |
| Check keys | `dangerous_claims`, `tone`, `clarity`, `ai_disclosure`, `cta_presence`, `generic_avatar_not_owner`, `own_avatar_consent` |
| Avatar misuse | Alias of **`generic_avatar_not_owner`** only |
| `blocking` | `own_avatar_consent`, `generic_avatar_not_owner` — code/config only |
| `overridable` | `dangerous_claims`, `tone`, `clarity`, `ai_disclosure`, `cta_presence` |
| Trigger | Operator run + auto-chain after `branding_status = completed` |
| Surface | **`/operator/scripts` QA panel** — no new route |
| Table | **`neuramark_qa_reports`** lean: `assembled_reel_id`, `checks` jsonb, `status`, timestamps + `id` + `client_id` |
| Report cardinality | **One current row per** `assembled_reel_id` (UNIQUE + replace on re-run) |
| Status enum | `pending` \| `running` \| `passed` \| `failed` \| `blocked` |
| LLM | `assetRole: 'llm'`, `llmVariant: 'default'` via catalog |
| Budget | Gate estimated LLM spend via US-7.1 helpers; record spend |
| US-11.1 gate | Read DB status only; Phase A ready iff `passed` |
| Override | **US-10.2 only** |
| Video QA | Metadata + text — **no** vision |
| Operator gate | **`requireOperator("handler")`** |
| Implementers | content-agents-engineer + nextjs-backend + nextjs-frontend |

### `checks` JSON sketch (CONTRACT freezes Zod)

```ts
// Each element — server-authored only
type QaCheckResult = {
  checkKey: string;
  status: "pass" | "fail" | "skipped";
  severity: "blocking" | "overridable";
  evidence?: { messageKey?: string; detail?: string };
};
```

### Report `status` derivation (CONTRACT freezes)

```ts
// if any blocking check status === "fail" → "blocked"
// else if any overridable check status === "fail" → "failed"
// else → "passed"
// "skipped" checks do not fail the report
```

### Gate helper sketch (US-11.1 consumer)

```ts
// getQaGateStatusForAssembledReel(assembledReelId) →
// { ready: boolean; status: QaReportStatus | null; hasBlockingFailures: boolean }
// ready === true only when status === "passed" in Phase A
// NEVER accepts client-supplied passed flag
```

### Phased BUILD checklist

| Phase | Deliverables |
|-------|----------------|
| **A (US-10.1)** | DDL · catalog · deterministic + LLM checks · run action · auto-chain · Operator panel · gate helper · budget · SEC |
| **B (US-10.2)** | Override modal · `qa_overrides` · reject blocking · audit display |

---

## FE checklist

- [x] QA panel on `/operator/scripts` expand/detail (Tab or section — match Caption/Production patterns)
- [x] Overall Veredicto QA badge (`passed` / `failed` / `blocked` / pending / running)
- [x] Per-check rows: pass/fail + severity badges (blocking vs overridable)
- [x] Evidence copy from message keys (EN/ES) — no raw LLM dump as primary UI
- [x] **Run QA** / **Re-run QA** button (Operator); pending/disabled when branding incomplete
- [x] Empty / loading / error states
- [x] i18n: `scripts.qa.*` (+ reuse `qa.checks.*` / `legal.*` where present)
- [x] No override modal; no client-writable pass control
- [x] Plain text / PrimeReact only — no `dangerouslySetInnerHTML`

## BE checklist

- [ ] Migration: `neuramark_qa_reports` (+ indexes, UNIQUE on `assembled_reel_id`, RLS enabled zero policies)
- [ ] Check catalog module: keys + severity map (immutable at runtime)
- [ ] Wire `evaluateGenericAvatarNotOwnerCheck` from US-3.4
- [ ] Deterministic `own_avatar_consent` (live consent ledger when own avatar)
- [ ] Deterministic `cta_presence` + branding prerequisite
- [ ] Server Action `runQaForAssembledReel` — `requireOperator`; load assembly → script → caption → profile
- [ ] Reject missing branding / missing caption with typed errors (CONTRACT)
- [ ] Invoke content-agents QA LLM via catalog resolve + budget assert
- [ ] Persist checks + derived status; never accept client `passed`
- [ ] Auto-chain hook after branding `completed`
- [ ] Rate limit `qa_run`
- [ ] `getQaGateStatusForAssembledReel` for US-11.1
- [ ] Extend Operator list/detail DTO with QA summary (nullable)
- [ ] `revalidatePath("/operator/scripts")` after run
- [ ] Unit/integration tests: severity map, status derivation, no client pass smuggle, IDOR 404

## DB checklist

- [ ] `neuramark_qa_reports` with `neuramark_` prefix on table, FKs, indexes, constraints
- [ ] Columns: `id`, `client_id`, `assembled_reel_id`, `checks`, `status`, `created_at`, `updated_at`
- [ ] FK `assembled_reel_id` → `neuramark_assembled_reels(id)`
- [ ] UNIQUE `(assembled_reel_id)` for current-report model
- [ ] CHECK on `status` enum values
- [ ] RLS enabled; no policies (service-role Node only)

## content-agents-engineer checklist

- [ ] Agent module under `lib/agents/content/`
- [ ] Zod `.strict()` output for LLM check subset
- [ ] Inputs: script package, caption, profile flags, modality/TTS disclosure context — trusted helpers only
- [ ] Delimited untrusted content blocks in prompt
- [ ] `resolveProvider` `llm` + `default` variant — no hardcoded vendor in agent
- [ ] Server merges LLM results; severity from catalog not model
- [ ] Fixtures: pass/fail samples for dangerous claims, tone, clarity, disclosure
- [ ] Tests without live network (mock provider)

## Dependencies and sequence

1. PREP (this folder) ✅  
2. spec-guardian SPEC-REVIEW  
3. security-architect SECURITY  
4. nextjs-backend CONTRACT → FE review signoff  
5. BUILD parallel: content-agents-engineer ∥ nextjs-backend (DDL first) → nextjs-frontend  
6. requirements-validator → qa-engineer  
7. Soft handoff → US-10.2 / US-11.1  

## Done when

- All USER_STORIES § US-10.1 AC satisfied (validator confirms — do not self-check)  
- Gate helper proven to ignore client-supplied pass  
- Operator can run QA on branded reel and see per-check Veredicto QA  
- US-10.2 / US-11.1 can consume report status without schema churn  
