# API Contract — US-10.1 Run automated QA on script, caption, and video

**Story:** US-10.1  
**Status:** Frozen — 2026-08-30 · Reviewed by FE: yes — 2026-08-30 — nextjs-frontend.  
**Security:** `plan/stories/US-10.1/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below)  
**Spec review:** `plan/stories/US-10.1/SPEC-REVIEW.md` (GAPS — resolved by this contract)  
**Pattern:** `plan/stories/US-9.2/CONTRACT.md` · `plan/stories/US-9.1/CONTRACT.md` · `plan/stories/US-6.1/CONTRACT.md`  
**Depends on:** US-9.2 ✅ branded Ensamblado (`branding_status`) · US-6.1 ✅ `neuramark_reel_captions` · US-6.2 ✅ `selected_cta_index` (optional for CTA resolve) · US-5.1 ✅ script package + slot `modalidad` / `mustDiscloseNotOwner` · US-3.4 ✅ `evaluateGenericAvatarNotOwnerCheck` + `QA_CHECK_SEVERITY` · US-3.2 ✅ consent ledger · US-X.4 ✅ `resolveProvider` `llm` · US-7.1 ✅ budget gate / spend · US-14.5 ✅ `requireOperator()`  
**Feature branch:** `feature/US-10.1-automated-qa`  
**Error envelope style:** same class as US-9.2 / US-6.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/qa-report.ts` (committed with this freeze). Orchestration under `lib/qa/**`, agent under `lib/agents/content/run-reel-qa.ts` (or `generate-qa-report.ts`), and migration SQL are specified here and applied during BUILD. Do **not** implement override (US-10.2), approval package UI (US-11.1), vision LLM, or weekly cron HTTP in this story.

**Terminology:** **Veredicto QA** · **Ensamblado** · **Paquete de guion** · **caption de Instagram** · **Aprobación** · **Operator** · **Cliente** · **Avatar genérico profesional** · **disclosure** · **Consentimiento de avatar**. Technical enums (`checkKey`, `blocking`, `overridable`, `qa_run`, `branding_status`) OK in code/DB and Operator diagnostics. Do **not** use CONTEXT _Evitar_ terms in Cliente-facing copy. Do **not** expose raw LLM JSON, prompts, provider keys, `storage_key`, or spend cents on Cliente serializers.

**USER_STORIES surface amendment (binding):** QA badges, per-check rows, and **Run QA** / **Re-run QA** render on **`/operator/scripts`** expand/detail (TabView or Production/QA section — same pattern as Caption / branding panels) — **not** a new Operator route. Cliente QA panel is **out of scope** (US-11.1).

**USER_STORIES AC amendment (binding for VALIDATION):** Phase A closes server verdicts + Operator panel + gate helper. AC phrase “until resolved **or overridden**” — override path = **US-10.2**; Phase A gate ready **iff** `status = 'passed'`. “Video” QA = branded Ensamblado prerequisite + modality/TTS/consent metadata + script/caption text — **no** vision/frame LLM.

---

## SPEC-REVIEW gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-10.1 CONTRACT.md | This document |
| 2 | “Video” QA ≠ vision model | § Video coverage — branded assembly + metadata/text only; no vision SDK |
| 3 | AC “or overridden” vs Phase A | § Phased BUILD · § Gate helper — ready iff `passed`; override = US-10.2 |
| 4 | Slot modalidad vs allowlist proxy | § Deterministic checks — script-row `modalidad` / `mustDiscloseNotOwner` + live consent ledger |
| 5 | Auto-chain hook placement unset | § `onBrandingCompleted` — sole hook inside branding `completed` writer path |
| 6 | Soft gap: weekly ciclo cron | § Non-goals · § `invokedBy: 'system' \| 'operator'` seam — no cron HTTP |
| 7 | USER_STORIES DB shorthand `qa_reports` | § Migration — `neuramark_qa_reports` + `client_id` |
| 8 | Caption missing at QA time | § Prerequisites — hard reject `CAPTION_REQUIRED` |
| 9 | LLM returns severity | § Merge rules — server overwrites from catalog; unknown keys **drop + log** |
| 10 | Report cardinality + fail-closed re-run | § UPSERT UNIQUE · § Status machine — fail closed on incomplete re-run |
| 11 | Check catalog keys + severity | § Check catalog module |
| 12 | Gate helper purity | § `getQaGateStatusForAssembledReel` — DB-only; no request `passed` |

## SECURITY reconciliation (binding)

| Topic | SECURITY condition | **Frozen in this contract** |
|-------|-------------------|----------------------------|
| Run input | `{ assembledReelId }` only | § `runQaForAssembledReel` · § Forbidden request keys |
| Operator gate | `requireOperator("handler")` first | § Orchestrator step 1 |
| Forbidden authority keys | Reject `passed` / `status` / `checks` / severity / budget / provider | § `findForbiddenQaRunKeys` · § `FORBIDDEN_QA_RUN_AUTHORITY_KEYS` |
| Assembly prerequisite | `status = completed` **and** `branding_status = completed` | § Prerequisites — `ASSEMBLY_NOT_READY` / `BRANDING_REQUIRED` |
| Caption required | Hard reject | § Prerequisites — `CAPTION_REQUIRED` |
| Tenancy | `(assembledReelId, client_id)` → **404** | § Orchestrator step 2 · § Report UPSERT / SELECT |
| Verdict write surface | Only `import "server-only"` orchestration under `lib/qa/**` | § Closed write surface |
| Status derivation | blocking fail → `blocked`; else overridable fail → `failed`; else `passed` | § Status derivation |
| Catalog immutable | Code-only keys + severity | § Check catalog — no CRUD endpoint |
| Blocking set | `own_avatar_consent`, `generic_avatar_not_owner` | § Check catalog |
| LLM severity ignored | Catalog wins; unknown keys drop + log | § Merge rules |
| Deterministic legal always run | Even if LLM fails | § Orchestrator steps · § LLM failure policy |
| Budget before LLM | `assertReelBudgetAllowsEstimatedSpend` | § Budget + spend |
| Spend on success | Reel cumulative ledger | § Budget + spend |
| Rate limit | `agent_key: 'qa_run'` | § Rate limit |
| Prompt injection | Delimited untrusted blocks | § LLM agent |
| LLM Zod `.strict()` | Invalid → never `passed` | § LLM agent · § LLM failure policy |
| Provider resolve | `assetRole: 'llm'`, `llmVariant: 'default'` | § LLM agent |
| Gate helper | DB-only; Phase A ready iff `passed` | § `getQaGateStatusForAssembledReel` |
| US-10.2 boundary | No override in 10.1; must 403 `blocking` later | § Non-goals · § Downstream obligations |
| Auto-chain | Server path; no branding revert | § `onBrandingCompleted` |
| Operator DTO minimal | No raw LLM / keys / cost on Cliente | § DTOs |
| DDL + RLS | UNIQUE assembled_reel; CHECK status; RLS zero policies | § Migration |
| Fail-closed re-run | Do not leave prior `passed` if re-run incomplete | § UPSERT / status machine |
| US-3.4 import | Do not fork key/severity | § Deterministic checks |

---

## Phased BUILD acceptance

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-10.1 BUILD — ship first)** | DDL `neuramark_qa_reports`; check catalog; deterministic + LLM checks; `runQaForAssembledReel`; auto-chain after branding `completed`; Operator QA panel; gate helper; budget + rate limit; `[SEC]` server-only verdicts | USER_STORIES § US-10.1 AC rows (Phase A interpretation) |
| **B (US-10.2 — explicit story)** | Override modal · `neuramark_qa_overrides` · reject `blocking` · audit on Aprobación | USER_STORIES § US-10.2 |

**VALIDATION note (binding):** Phase A closes US-10.1 without shipping override. Failed **overridable** checks → report `failed` → gate **not ready** until re-run passes **or** US-10.2 override. Failed **blocking** → `blocked` with no Operator escape until content/consent fixed + re-run. VALIDATION must **not** claim full AC “overridden” path closed. VALIDATION must record: no vision LLM; no weekly cron; gate ready iff `passed`.

---

## Overview

US-10.1 ships **QA/Compliance Agent V1**. After branded **Ensamblado** is ready (`neuramark_assembled_reels.status = completed` **and** `branding_status = completed`), the System (Operator trigger or auto-chain) loads **Paquete de guion**, **caption de Instagram**, slot modality/consent flags, and assembly metadata **server-side**; runs **deterministic** legal/structural checks plus an **LLM** compliance pass via catalog `assetRole: 'llm'`; **derives** report `status` from check outcomes; UPSERTs a server-owned **Veredicto QA** into `neuramark_qa_reports`; surfaces results on **`/operator/scripts`**; exports **`getQaGateStatusForAssembledReel`** for US-11.1 (DB-only).

**Surfaces**

| # | Surface | Kind | Consumer |
|---|---------|------|----------|
| 1 | `runQaForAssembledReel` | Server Action | `/operator/scripts` — **Run QA** / **Re-run QA** |
| 2 | `runQaForAssembledReelForClient` | Server-only orchestrator | Action + `onBrandingCompleted` auto-chain |
| 3 | `onBrandingCompleted` | Server helper | Hook when branding → `completed` (US-9.2 writer path) |
| 4 | `getQaGateStatusForAssembledReel` | Server-only helper | US-11.1 approval gate (consume only) |
| 5 | `getQaReportsForAssembledReels` | Server helper | `getReelScriptsForWeek` batch attach |
| 6 | Check catalog + severity map | Code module | Orchestration · US-10.2 (import) |
| 7 | Deterministic evaluators | Server helpers | Consent · generic-avatar · CTA · branding prereq |
| 8 | `runReelQaAgent` (LLM) | Server-only agent | Orchestrator — content-agents-engineer |
| 9 | Zod + types | `lib/contracts/qa-report.ts` | FE types · BE validation |
| 10 | Migration | `neuramark_qa_reports` | Persistence |
| 11 | `/operator/scripts` QA panel | FE | Badges, rows, Run/Re-run |

**Forbidden surfaces (BUILD veto):**

- Any Server Action / Route Handler that accepts client `passed`, `status`, `checks`, `severity`, `ready`, `qaPassed`, or override payloads as write authority.
- Public Route Handler that sets QA status.
- Override mutation / `neuramark_qa_overrides` (US-10.2).
- Cliente QA panel or Cliente-callable run.
- Check-catalog CRUD endpoint or DB-editable severity.
- Vision / frame OCR / vision LLM SDK.
- Weekly cron HTTP endpoint (ADR-0001 integrations later).
- Client-supplied `clientId`, `provider_key`, `tier`, `estimatedCostCents`, `skipBudgetCheck`, script/caption text bodies, `brandingStatus`, `force`.
- Browser Supabase / `NEXT_PUBLIC_` Supabase keys.
- Forking US-3.4 `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` or reclassifying it as `overridable`.

**Why Server Actions:** UI-coupled Operator run under `/operator/scripts`; CSRF via Next.js origin check. Auto-chain and US-11.1 gate are **server-only** helpers — not browser HTTP.

---

## Migration — `neuramark_qa_reports`

**Migration file (BUILD):** `supabase/migrations/20260831010000_neuramark_qa_reports.sql`

```sql
-- US-10.1: Veredicto QA — one current report per branded assembled reel

CREATE TABLE public.neuramark_qa_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  assembled_reel_id uuid NOT NULL
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL
    CHECK (status IN ('pending', 'running', 'passed', 'failed', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_qa_reports_assembled_reel_id_uq UNIQUE (assembled_reel_id),
  CONSTRAINT neuramark_qa_reports_checks_is_array_chk CHECK (jsonb_typeof(checks) = 'array')
);

CREATE INDEX neuramark_qa_reports_client_id_idx
  ON public.neuramark_qa_reports (client_id);

CREATE INDEX neuramark_qa_reports_client_status_idx
  ON public.neuramark_qa_reports (client_id, status);

CREATE INDEX neuramark_qa_reports_updated_at_idx
  ON public.neuramark_qa_reports (updated_at);

COMMENT ON TABLE public.neuramark_qa_reports IS
  'US-10.1: server-owned Veredicto QA; one current row per assembled_reel (UPSERT on re-run).';
COMMENT ON COLUMN public.neuramark_qa_reports.checks IS
  'Array of { checkKey, status, severity, evidence? } — server-authored only.';
COMMENT ON COLUMN public.neuramark_qa_reports.status IS
  'pending|running|passed|failed|blocked — derived server-side; never client-writable.';

ALTER TABLE public.neuramark_qa_reports ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default for anon/authenticated).

CREATE OR REPLACE FUNCTION public.neuramark_qa_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER neuramark_qa_reports_set_updated_at
  BEFORE UPDATE ON public.neuramark_qa_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_qa_reports_set_updated_at();
```

**Provider / spend refs:** **Not** columns on `neuramark_qa_reports`. LLM cost uses existing US-7.1 **`neuramark_reel_spend_events`** (and catalog resolve) keyed by `reel_script_id` from the assembly row. No `provider_key` / `provider_decision_id` on the QA report table in Phase A.

**Cardinality:** Exactly **one current report** per `assembled_reel_id` (UNIQUE). Re-run **UPSERTs** (replace `checks` + `status` + `updated_at`). Full QA history out of scope (US-10.2 owns override audit, not report history).

---

## Check catalog module

**File (BUILD):** `lib/qa/check-catalog.ts` (may re-export severity from `lib/qa/check-classes.ts`)

**Immutable at runtime.** No endpoint, Operator setting, or DB table edits classification. US-10.2 **must** import the same module for override 403.

### V1 keys (exact)

| `checkKey` | Severity | Execution | Notes |
|------------|----------|-----------|-------|
| `own_avatar_consent` | `blocking` | Deterministic | Live consent ledger when `modalidad === 'own_avatar'`; else `skipped` |
| `generic_avatar_not_owner` | `blocking` | Deterministic | Import US-3.4 evaluator; slot `mustDiscloseNotOwner` from script row |
| `cta_presence` | `overridable` | Deterministic | See CTA input freeze below |
| `dangerous_claims` | `overridable` | LLM-assisted | |
| `tone` | `overridable` | LLM-assisted | |
| `clarity` | `overridable` | LLM-assisted | |
| `ai_disclosure` | `overridable` | LLM-assisted | Evidence context when synthetic avatar and/or TTS used |

**Avatar misuse** (USER_STORIES wording) **aliases** `generic_avatar_not_owner` only — **no** second key.

**Constants (contracts):**

```ts
export const QA_CHECK_KEYS = [
  "own_avatar_consent",
  "generic_avatar_not_owner",
  "cta_presence",
  "dangerous_claims",
  "tone",
  "clarity",
  "ai_disclosure",
] as const;

export const QA_BLOCKING_CHECK_KEYS = [
  "own_avatar_consent",
  "generic_avatar_not_owner",
] as const;

export const QA_OVERRIDABLE_CHECK_KEYS = [
  "dangerous_claims",
  "tone",
  "clarity",
  "ai_disclosure",
  "cta_presence",
] as const;
```

`GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` remains the US-3.4 export (`"generic_avatar_not_owner"`) — import, do not redefine a divergent string.

### CTA presence input (frozen)

Resolve **CTA under test** server-side in order:

1. If caption row has `selected_cta_index` **not null** → `cta_variants[selected_cta_index]` (must be non-empty string).
2. Else if `cta_variants.length > 0` → use first non-empty variant (ops fallback; prefer Operator select via US-6.2 before QA).
3. Else → script package `cta` field (non-empty).

**Fail** `cta_presence` when resolved CTA is missing/blank. **Do not** hard-reject the whole run for empty CTA alone (caption row must still exist — see prerequisites).

### Branding / assembly prerequisite

Not a `checks[]` row. Enforced **before** run persists a terminal verdict as `passed`:

- Assembly `status !== 'completed'` → **`ASSEMBLY_NOT_READY`**
- `branding_status !== 'completed'` → **`BRANDING_REQUIRED`**

No `passed` write on prerequisite fail.

---

## Status derivation

```ts
// Terminal derivation from server-authored checks[] (catalog severity):
// if any check with severity === "blocking" and status === "fail" → "blocked"
// else if any check with severity === "overridable" and status === "fail" → "failed"
// else → "passed"
// status === "skipped" does not fail the report
```

| Report `status` | Meaning |
|-----------------|---------|
| `pending` | Row reserved / enqueue placeholder (auto-chain start) — **not** ready |
| `running` | Orchestration in progress — **not** ready; fail-closed: clears prior terminal readiness |
| `passed` | All non-skipped checks pass |
| `failed` | ≥1 overridable fail; **no** blocking fail |
| `blocked` | ≥1 blocking fail |

**Phase A gate:** `ready === true` **iff** `status === 'passed'`.

---

## Forbidden request keys

Scan raw input with **`findForbiddenQaRunKeys`** before Zod parse → **`FORBIDDEN_FIELDS`**.

```ts
export const FORBIDDEN_QA_RUN_AUTHORITY_KEYS = [
  "passed",
  "status",
  "checks",
  "severity",
  "checkKey",
  "check_key",
  "clientId",
  "client_id",
  "ready",
  "qaPassed",
  "qa_passed",
  "providerKey",
  "provider_key",
  "tier",
  "estimatedCostCents",
  "estimated_cost_cents",
  "skipBudgetCheck",
  "skip_budget_check",
  "override",
  "overrides",
  "blocking",
  "overridable",
  "brandingStatus",
  "branding_status",
  "force",
  "invokedBy",
  "invoked_by",
  "hook",
  "body",
  "cta",
  "caption",
  "scriptText",
  "script_text",
  "onScreenText",
  "on_screen_text",
  "voiceoverText",
  "voiceover_text",
  "mustDiscloseNotOwner",
  "modalidad",
] as const;
```

---

## `runQaForAssembledReel({ assembledReelId })`

**Kind:** Server Action  
**Consumer:** `/operator/scripts` QA panel — **Run QA** / **Re-run QA**  
**Auth:** `requireOperator("handler")` as **first await** — failure → 401/403, **no side effects**, **no LLM**.

### Request

```ts
{ assembledReelId: string /* uuid */ } // .strict() only
```

### Success

```ts
{
  ok: true;
  assembledReelId: string;
  qaReportId: string;
  status: "passed" | "failed" | "blocked";
  checks: QaCheckResult[];
  idempotent?: boolean; // true if same in-flight run short-circuited
}
```

### Error envelope

```ts
{
  ok: false;
  error: {
    code: QaReportErrorCode;
    messageKey?: string;
    fields?: Record<string, string[]>;
    previews?: ReelBudgetPreview[]; // BUDGET_EXCEEDED only
  };
}
```

### Orchestrator steps (`runQaForAssembledReelForClient`)

| Step | Action |
|------|--------|
| 1 | Manual path: `requireOperator("handler")` first. Auto-chain: `invokedBy: 'system'` — **no** browser gate; trusted server only |
| 2 | Forbidden-key scan → `FORBIDDEN_FIELDS` |
| 3 | Zod `.strict()` → `{ assembledReelId }` |
| 4 | Rate limit `qa_run` (manual + system both count) → `RATE_LIMITED` |
| 5 | Load `neuramark_assembled_reels` **`WHERE id = $1 AND client_id = $serverClientId`** — miss → **`NOT_FOUND`** (404) |
| 6 | Prerequisites: assembly `completed` + branding `completed`; else typed error — **no** `passed` |
| 7 | Load script via `reel_script_id` (tenancy); load caption by `reel_script_id` — missing caption → **`CAPTION_REQUIRED`** |
| 8 | Load profile agents DTO + **live** consent when needed; never from request body |
| 9 | **Fail-closed UPSERT:** set report `status = 'running'` (insert or update) with `client_id` from assembly — clears prior `passed` immediately |
| 10 | Run deterministic checks → results array |
| 11 | Budget: `assertReelBudgetAllowsEstimatedSpend({ clientId, reelScriptId, estimatedCostCents })` using **server** catalog estimate for QA LLM — fail → **`BUDGET_EXCEEDED`**, report terminal **non-pass** (`failed` with empty LLM subset **or** leave `running`→`failed` with deterministic-only checks — **never** `passed`); **no LLM** |
| 12 | `resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'default' })` |
| 13 | LLM agent with delimited untrusted blocks; Zod `.strict()` on LLM subset |
| 14 | Merge: deterministic wins for deterministic keys; LLM subset for LLM keys; **overwrite severity from catalog**; **drop + log** unknown LLM keys |
| 15 | Derive terminal `status`; UPSERT `checks` + terminal status |
| 16 | On successful LLM completion: record spend event (US-7.1 pattern) against `reel_script_id` |
| 17 | `revalidatePath("/operator/scripts")` (Operator path) |
| 18 | Return success DTO (minimal) |

**In-flight:** If report already `running` and `updated_at` within **`QA_IN_FLIGHT_TIMEOUT_MS` (5 min)** → return `{ ok: true, idempotent: true, … }` with current status without starting a second LLM. Stale `running` (> timeout) may be reclaimed by Operator re-run (fail-closed).

**Full re-run:** Always re-invokes LLM (PO lean). No input fingerprint idempotency in Phase A.

---

## Auto-chain — `onBrandingCompleted`

**File (BUILD):** `lib/qa/on-branding-completed.ts` (`import "server-only"`)

**Hook placement:** Call from the **sole** branding-complete path (inside / immediately after `applyBrandingJobUpdate` when transitioning to `branding_status = completed` — mirror US-9.2 `onAssemblyJobCompleted` pattern). Do **not** fork branding status semantics.

```ts
export async function onBrandingCompleted(input: {
  assembledReelId: string;
  clientId: string;
}): Promise<void>;
```

| Rule | Detail |
|------|--------|
| Invoke | `runQaForAssembledReelForClient({ assembledReelId, clientId, invokedBy: 'system' })` |
| Failure UX | Branding stays **`completed`** — **never** revert `branding_status` |
| Persist | On enqueue/start: report `pending`/`running`; on failure: Operator-visible `failed`/`blocked` or typed log — **no** silent swallow without report/log |
| Trust | **Not** a browser endpoint; ids from server branding writer only |
| Rate / budget | Same gates as manual run |

**Forbidden:** Cliente-callable auto-chain Route Handler.

---

## `getQaGateStatusForAssembledReel`

**File (BUILD):** `lib/qa/get-qa-gate-status-for-assembled-reel.ts` (`import "server-only"`)

```ts
export async function getQaGateStatusForAssembledReel(
  assembledReelId: string,
): Promise<QaGateStatus>;

// QaGateStatus:
{
  ready: boolean;
  status: QaReportStatus | null; // null if no report row
  hasBlockingFailures: boolean;
  hasOverridableFailures: boolean;
  qaReportId: string | null;
}
```

| Rule | Detail |
|------|--------|
| Tenancy | Resolve assembly + report with **server** `client_id` from `getCurrentUser()` / caller-supplied server context — foreign → treat as missing / not ready (US-11.1 will 404 package) |
| Phase A | **`ready === (status === 'passed')`** |
| Authority | Reads **DB only**. Function **must not** accept `passed` / `ready` / override flags from HTTP. Callers must not pass request body into readiness |
| US-10.2 foresight | Shape includes `hasBlockingFailures` / `hasOverridableFailures` so US-11.1 need not rewrite when overrides land |

**Consumer obligation (US-11.1):** Re-check gate on package create **and** decision submit via this helper (or successor). Never honor `qaPassed` from the client.

---

## Deterministic checks (detail)

### `own_avatar_consent`

- When script `modalidad !== 'own_avatar'` → `{ status: 'skipped', severity: 'blocking' }`.
- When `own_avatar`: re-read **live** consent ledger (US-3.2) for client — **never** cached client flag. Missing/revoked → `fail`; active → `pass`. Severity always `blocking`.

### `generic_avatar_not_owner`

- Import `evaluateGenericAvatarNotOwnerCheck` + `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` + `QA_CHECK_SEVERITY.blocking`.
- Drive `mustDiscloseNotOwner` from **script row** (slot), not request body / allowlist alone.
- Script text = concatenation of package fields used by US-3.4 stub (`hook`/`body`/`cta`/`voiceover`/`on_screen_text` as stub expects — BUILD wires same `scriptText` assembly as stub tests).
- Severity always `blocking` (catalog + stub).

### `cta_presence`

- Resolve CTA per § Check catalog CTA freeze.
- Empty → `fail` / `overridable`; present → `pass`.

---

## LLM agent

**File (BUILD):** `lib/agents/content/run-reel-qa.ts` (content-agents-engineer)

| Rule | Detail |
|------|--------|
| Resolve | `resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'default' })` |
| Input | Script package, caption record, modality/TTS/disclosure context, profile flags from **trusted helpers only** |
| Prompt | Untrusted script/caption/on_screen_text in **delimited** blocks; system rules server-injected |
| Output Zod | `.strict()` subset: array of `{ checkKey, status: pass\|fail, evidence? }` for LLM keys only — **no** trusted `severity` |
| Merge | Server sets `severity` from catalog; drops unknown keys (**drop + log**); never invents `passed` overall from model |
| LLM failure / invalid Zod | Persist deterministic results + terminal **non-pass** (`failed` if only overridable deterministic fails, `blocked` if legal fails, else `failed` with LLM keys marked fail or omitted — **CONTRACT: omit LLM keys and set report `failed` if deterministic all pass but LLM invalid** — never `passed`) |

### `ai_disclosure` context

LLM evaluates disclosure text adequacy when **any** of:

- Script `modalidad` is generic avatar / synthetic presenter path requiring disclosure, **or**
- TTS / synthetic voice used for the Reel (server-detected from production metadata / voiceover job presence).

When neither applies → server may mark `ai_disclosure` as `skipped` **before** LLM (preferred) or instruct LLM N/A — BUILD prefers **server `skipped`** when disclosure not required.

---

## Budget + spend

| Rule | Detail |
|------|--------|
| Before LLM | `assertReelBudgetAllowsEstimatedSpend` with server-estimated cost from catalog cost model for one QA LLM run |
| On block | **`BUDGET_EXCEEDED`** — no LLM; no `passed` report; deterministic-only terminal allowed only as non-pass (see orchestrator step 11) |
| On LLM success | Record spend event on `reel_script_id` (same cumulative ledger as caption/script) |
| Re-run | Each successful LLM completion records spend (full re-run always calls LLM) |
| Forbidden | Client `estimatedCostCents` / `skipBudgetCheck` |

---

## Rate limit

Reuse `neuramark_agent_rate_limits`:

| Constant | Value |
|----------|-------|
| `agent_key` | **`qa_run`** |
| Window | **60 minutes** rolling |
| Max attempts | **5** per `client_id` per window (mirror caption) |
| In-flight timeout | **5 minutes** |
| Over-limit | **`RATE_LIMITED`** (429) — no LLM |

Constants live in `lib/contracts/qa-report.ts`: `QA_RUN_AGENT_KEY`, `QA_RATE_WINDOW_MS`, `QA_MAX_JOBS_PER_WINDOW`, `QA_IN_FLIGHT_TIMEOUT_MS`.

---

## Batch DTO on week load

**Extend** `getReelScriptsForWeek` (via `getQaReportsForAssembledReels`) so each item that has an assembly row can expose nullable QA summary.

```ts
// Attached beside assembly/branding maps — exact field name frozen:
qaByAssembledReelId: Record<string, OperatorQaReportSummaryDto | null>
// and/or on item when assembledReelId known:
qaReport: OperatorQaReportSummaryDto | null
```

**`OperatorQaReportSummaryDto` (list):**

```ts
{
  qaReportId: string;
  assembledReelId: string;
  status: QaReportStatus;
  hasBlockingFailures: boolean;
  hasOverridableFailures: boolean;
  updatedAt: string; // ISO
}
```

**Detail / panel DTO** (expand row — may load from week payload if small ≤3 Reels/week):

```ts
{
  qaReportId: string;
  assembledReelId: string;
  status: QaReportStatus;
  checks: QaCheckResult[];
  updatedAt: string;
  createdAt: string;
}
```

**`QaCheckResult`:**

```ts
{
  checkKey: QaCheckKey;
  status: "pass" | "fail" | "skipped";
  severity: "blocking" | "overridable";
  evidence?: {
    messageKey?: string;
    detail?: string; // plain text, max 500 chars; no HTML
  };
}
```

**Never in DTO:** raw LLM JSON, prompts, provider keys, `storage_key`, cost cents, consent PII beyond message keys.

---

## Operator QA panel contract (FE)

| Element | Behavior |
|---------|----------|
| Surface | `/operator/scripts` expand — QA tab/section |
| Overall badge | Maps `status`: pending / running / passed / failed / blocked |
| Per-check rows | `checkKey` label (i18n) + pass/fail/skipped + severity badge |
| Evidence | `messageKey` → EN/ES; optional capped `detail` as plain text |
| Actions | **Run QA** / **Re-run QA** → `runQaForAssembledReel({ assembledReelId })` |
| Disabled | When branding incomplete / assembly incomplete / running |
| Empty | No report yet — CTA to run when prerequisites met |
| Loading / error | Standard Operator patterns; map error codes to `scripts.qa.errors.*` |
| Override | **Absent** — no modal, no reason field |
| XSS | React text / i18n only — **no** `dangerouslySetInnerHTML` |

**i18n namespace:** `scripts.qa.*` (+ reuse `qa.checks.*` / legal disclosure keys where present).

---

## Error codes

```ts
export const qaReportErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN_FIELDS",
  "ASSEMBLY_NOT_READY",
  "BRANDING_REQUIRED",
  "CAPTION_REQUIRED",
  "SCRIPT_NOT_FOUND",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "BUDGET_EXCEEDED",
  "COST_POLICY_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "QA_OUTPUT_INVALID",
  "INTERNAL_ERROR",
]);
```

| Code | HTTP-ish | When |
|------|----------|------|
| `UNAUTHENTICATED` | 401 | No session |
| `FORBIDDEN` | 403 | Cliente / inactive on manual run |
| `NOT_FOUND` | 404 | Foreign or missing `assembledReelId` |
| `FORBIDDEN_FIELDS` | 400 | Authority key smuggle |
| `ASSEMBLY_NOT_READY` | 409 | Assembly not `completed` |
| `BRANDING_REQUIRED` | 409 | `branding_status !== completed` |
| `CAPTION_REQUIRED` | 409 | No caption row for script |
| `SCRIPT_NOT_FOUND` | 404 | Missing linked script |
| `RATE_LIMITED` | 429 | `qa_run` window exceeded |
| `GENERATION_IN_FLIGHT` | 409 | Optional explicit in-flight reject (prefer idempotent success) |
| `BUDGET_EXCEEDED` | 402/409 | Budget gate |
| `COST_POLICY_UNAVAILABLE` | 503 | Policy load fail |
| `PROVIDER_UNAVAILABLE` | 503 | Catalog resolve fail |
| `QA_OUTPUT_INVALID` | 422 | LLM Zod fail (Operator-visible; report non-pass) |
| `INTERNAL_ERROR` | 500 | Unexpected |

---

## Fixtures (FE mock)

### Run request

```json
{ "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }
```

### Success — passed

```json
{
  "ok": true,
  "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "qaReportId": "ffffffff-0000-4000-8000-111111111111",
  "status": "passed",
  "checks": [
    {
      "checkKey": "own_avatar_consent",
      "status": "skipped",
      "severity": "blocking"
    },
    {
      "checkKey": "generic_avatar_not_owner",
      "status": "pass",
      "severity": "blocking"
    },
    {
      "checkKey": "cta_presence",
      "status": "pass",
      "severity": "overridable"
    },
    {
      "checkKey": "dangerous_claims",
      "status": "pass",
      "severity": "overridable"
    },
    {
      "checkKey": "tone",
      "status": "pass",
      "severity": "overridable"
    },
    {
      "checkKey": "clarity",
      "status": "pass",
      "severity": "overridable"
    },
    {
      "checkKey": "ai_disclosure",
      "status": "pass",
      "severity": "overridable"
    }
  ]
}
```

### Success — blocked (legal)

```json
{
  "ok": true,
  "assembledReelId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "qaReportId": "ffffffff-0000-4000-8000-222222222222",
  "status": "blocked",
  "checks": [
    {
      "checkKey": "own_avatar_consent",
      "status": "fail",
      "severity": "blocking",
      "evidence": {
        "messageKey": "qa.checks.ownAvatarConsent.failMissing"
      }
    },
    {
      "checkKey": "cta_presence",
      "status": "pass",
      "severity": "overridable"
    }
  ]
}
```

### Error — caption missing

```json
{
  "ok": false,
  "error": {
    "code": "CAPTION_REQUIRED",
    "messageKey": "scripts.qa.errors.captionRequired"
  }
}
```

### Error — forbidden fields

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN_FIELDS",
    "messageKey": "scripts.qa.errors.forbiddenFields",
    "fields": { "passed": ["FORBIDDEN"] }
  }
}
```

### Gate helper — Phase A not ready

```json
{
  "ready": false,
  "status": "failed",
  "hasBlockingFailures": false,
  "hasOverridableFailures": true,
  "qaReportId": "ffffffff-0000-4000-8000-333333333333"
}
```

### Gate helper — ready

```json
{
  "ready": true,
  "status": "passed",
  "hasBlockingFailures": false,
  "hasOverridableFailures": false,
  "qaReportId": "ffffffff-0000-4000-8000-111111111111"
}
```

---

## Closed write surface

**Only** these modules may INSERT/UPDATE `neuramark_qa_reports.status` / `checks`:

- `lib/qa/run-qa-for-assembled-reel.ts` (orchestrator) — and tightly coupled helpers it owns under `lib/qa/**`
- **Zero** Route Handlers write QA verdicts
- **Zero** Server Actions accept client verdict fields

---

## Non-goals (explicit)

| Out | Owner / note |
|-----|----------------|
| Operator override UI / reason / `neuramark_qa_overrides` | **US-10.2** |
| Soft-pass or override of `blocking` checks | **Forbidden** forever in 10.1; US-10.2 **403** |
| Cliente approval package / `neuramark_approvals` writes | **US-11.1** |
| Vision / frame-level video LLM | Out of V1 |
| Weekly cron auto-QA HTTP | integrations-engineer (ADR-0001); document `invokedBy: 'system'` only |
| New Operator nav route | Extend `/operator/scripts` only |
| Cliente QA panel | US-11.1 |
| Client-editable check catalog | Never |
| Append-only full QA history | Deferred; UPSERT current only |
| Fly FFmpeg / IG publish for QA | ADR-0003 / ADR-0002 — not this story |

---

## Downstream obligations

| Consumer | Obligation |
|----------|------------|
| **US-10.2** | Import catalog; override **one** `checkKey` on **one** `qaReportId`; reason required; append-only; **403** when severity `blocking` even for Operator; no report-level bypass |
| **US-11.1** | Call `getQaGateStatusForAssembledReel`; Phase A treat `ready` iff `passed`; never request `qaPassed`; IDOR 404 on foreign ids |
| **content-agents-engineer** | Agent Zod + prompt against this contract; severity overwrite is BE merge responsibility |
| **nextjs-frontend** | Display-only badges; Run action pointer-only; no override UI |

---

## Security tests (minimum)

1. Cliente → `runQaForAssembledReel` → **403**, no LLM, no write  
2. Foreign `assembledReelId` → **404**  
3. Smuggled `passed` / `status` / `checks` → **`FORBIDDEN_FIELDS`**  
4. Branding incomplete → **`BRANDING_REQUIRED`**, no `passed`  
5. Missing caption → **`CAPTION_REQUIRED`**  
6. Budget block → no LLM / no `passed`  
7. Status derivation: blocking fail → `blocked`; overridable-only → `failed`; all pass → `passed`  
8. Mock LLM severity `blocking` on overridable key → catalog severity `overridable` wins  
9. Gate helper `ready === false` when `failed` / `blocked` / missing / `running`  
10. Rate limit 6th run → **`RATE_LIMITED`**  
11. Grep: no client-writable QA status Route Handler  
12. RLS enabled, zero policies on `neuramark_qa_reports`  
13. US-3.4 import used (not forked severity string)  
14. Re-run sets `running` before completion — prior `passed` not left readable as ready mid-run  
15. Auto-chain failure does not revert `branding_status`

---

## Module placement (BUILD)

| Module | Path |
|--------|------|
| Contracts | `lib/contracts/qa-report.ts` (+ keep `lib/contracts/qa.ts` US-3.4 stub) |
| Catalog | `lib/qa/check-catalog.ts` |
| Orchestrator | `lib/qa/run-qa-for-assembled-reel.ts` |
| Forbidden keys | `lib/qa/find-forbidden-qa-run-keys.ts` |
| Gate helper | `lib/qa/get-qa-gate-status-for-assembled-reel.ts` |
| Auto-chain | `lib/qa/on-branding-completed.ts` |
| Batch attach | `lib/qa/get-qa-reports-for-assembled-reels.ts` |
| Deterministic consent | `lib/qa/checks/own-avatar-consent.ts` |
| Deterministic CTA | `lib/qa/checks/cta-presence.ts` |
| Generic avatar | existing `lib/qa/checks/generic-avatar-not-owner.ts` |
| LLM agent | `lib/agents/content/run-reel-qa.ts` |
| Server Action | `lib/qa/actions/run-qa-for-assembled-reel.ts` |
| Migration | `supabase/migrations/20260831010000_neuramark_qa_reports.sql` |

---

## Open decisions frozen here (no longer open)

| # | Topic | Frozen choice |
|---|-------|---------------|
| 1 | History | UPSERT one current row |
| 2 | Caption missing | Hard reject `CAPTION_REQUIRED` |
| 3 | Auto-chain failure | Branding stays completed |
| 4 | LLM severity | Ignored; catalog wins |
| 5 | Unknown LLM keys | **Drop + log** |
| 6 | Re-run incomplete | Fail closed via `running` then non-pass |
| 7 | LLM invalid + deterministic pass | Report **`failed`** (omit/fail LLM keys) — never `passed` |
| 8 | CTA resolve order | selected → first variant → script `cta` |
| 9 | Rate limit | `qa_run`, 5 / 60 min |
| 10 | Vision / cron / override | Out |

---

## Disputes / FE review notes

**Resolved by FE signoff (2026-08-30)** — see § Reviewed by FE. Summary:

1. **Panel chrome** — Stacked section after assembly/branding (not TabView).  
2. **Batch shape** — Primary `qaByAssembledReelId` only (detail with checks on week load).  
3. **In-flight UX** — Idempotent success preferred.  
4. **CTA without `selected_cta_index`** — Soft-fail `cta_presence` confirmed.  
5. **No override UI** — confirmed for Phase A fixtures/panel.

**No open PO product disputes** remain after SECURITY APPROVE WITH CONDITIONS; FE preferences above are UX-only and do not reopen DDL, catalog, or gate purity.

---

## Reviewed by FE

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend.

**Verdict:** Accept — Operator QA panel, Run/Re-run action, batch DTO, gate display, and i18n are implementable against existing `/operator/scripts` expand patterns. No forbidden client authority fields in the FE write path.

**FE resolutions (UX disputes — frozen for BUILD):**

| # | Topic | FE choice |
|---|-------|-----------|
| 1 | Panel chrome | **Stacked section** after `OperatorAssemblyPanel` in expand row (same pattern as voiceover / assembly / branding). **Not** a new TabView tab — Caption TabView stays script/caption only. Header: Veredicto QA / QA. |
| 2 | Batch shape | **Primary only:** `qaByAssembledReelId: Record<assembledReelId, … \| null>`. **Do not** dual-ship `item.qaReport`. Lookup key = `assemblyJob.jobId` (= `assembledReelId`). Week load should attach **detail DTO** (with `checks[]`) given ≤3 Reels/week so the panel needs no second fetch; summary flags may be derived FE-side from `checks` or BE may enrich. |
| 3 | In-flight UX | Prefer **idempotent** `{ ok: true, idempotent: true }` (mirror assembly/branding). Disable Run while `pending`/`running`; no error toast on double-click. Treat `GENERATION_IN_FLIGHT` as optional fallback only. |
| 4 | CTA soft-fail | **Confirmed** — empty CTA → `cta_presence` fail badge only; Run still allowed when prereqs met. |
| 5 | Override UI | **Absent** — no modal, reason, or pass control in panel or fixtures. |

**BUILD notes (FE):**

- **Surface:** New client panel (e.g. `OperatorQaPanel`) in `ScriptsPageView` expand — after assembly/branding. Props: `assembledReelId` from `assemblyJob.jobId`, initial report from `qaByAssembledReelId[jobId]`, `copy: scripts.qa.*`.
- **Server Action:** `runQaForAssembledReel({ assembledReelId })` only — never send status/checks/severity/ready/passed/clientId/body text.
- **Badges:** Overall `Tag` from report `status` (`pending` \| `running` \| `passed` \| `failed` \| `blocked`). Per-check rows: i18n `checkKey` label + outcome Tag + severity Tag (`blocking` / `overridable`). Evidence: `messageKey` → EN/ES; optional `detail` as plain text (no HTML).
- **Actions:** Run QA when no report; Re-run when terminal. Disabled when assembly incomplete, branding incomplete, or status `pending`/`running`. Empty CTA when prereqs unmet.
- **Idempotent in-flight:** On `idempotent: true`, merge returned DTO into local/override map; keep button disabled while non-terminal. **BE ask:** widen success `status` to allow `running` \| `pending` when `idempotent: true` (current Zod terminal-only is slightly inconsistent with in-flight short-circuit) — FE can also ignore returned status and keep local `running` until revalidate.
- **Gate (display-only on this story):** Panel may show not-ready when status ≠ `passed`; do **not** call `getQaGateStatusForAssembledReel` from the browser — US-11.1 owns gate consume.
- **Types:** Import from `lib/contracts/qa-report.ts` only (`OperatorQaReportDetailDto`, `RunQaForAssembledReelResult`, check keys/status enums). Reuse `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` / `qa.checks.*` where present.
- **i18n:** Add `scripts.qa.*` (title, status labels, actions, empty/loading, errors for all `QaReportErrorCode`s) EN + ES; check labels under `scripts.qa.checks.*` or reuse `qa.checks.*`.
- **Week payload:** Extend `getReelScriptsForWeek` / page props with `qaByAssembledReelId` (page.tsx already mirrors assembly/voiceover maps).
- **Out of scope:** Override modal; Cliente QA; vision; new Operator route; client-writable pass.

**Disputes:** None blocking BUILD. Soft BE follow-up: success schema status union when `idempotent: true` (running/pending).

---

**Reviewed by FE:** yes — 2026-08-30 — nextjs-frontend.  
**Frozen by:** nextjs-backend — 2026-08-30  
**Zod mirror:** `lib/contracts/qa-report.ts`
