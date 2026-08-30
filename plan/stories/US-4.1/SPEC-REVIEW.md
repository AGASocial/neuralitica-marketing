## Spec Review — US-4.1

### Verdict: GAPS

US-4.1 intent — **Operator**-triggered **Estrategia semanal** for **Instagram Reels only** (≥3 slots), server-side LLM job via provider catalog, schema-validated brief storage, regenerate-without-deleting-approved-history, prompt-injection containment, rate-limit — is **directionally aligned** with SPEC §3 **Content Strategy Agent** (S3.M5), SPEC §1 SC-1 (3 Reels/semana), hard rules (no multicanal, no publish, no human recording), SPEC §5–§6 (`neuramark_*`, server-only LLM keys, multi-tenant `client_id`), TASKS.md Fase 3, and closed upstream helpers (US-2.3, US-3.4, US-16.1, US-16.2, US-X.4).

**Gaps** are between `plan/USER_STORIES.md` § US-4.1 acceptance criteria / owner table and what SPEC + TASKS + frozen helper contracts require. Until USER_STORIES (or frozen CONTRACT) closes them, implementation risks shipping a brief that omits Playbook/Trend integration, per-slot modalidad assignment, or a System cron path (ADR-0001).

Dependencies are satisfied: `getBusinessProfileForAgents` (with `visualModeSummary`), `getPlaybookForAgents`, `getTrendSnapshotForWeek`, `getProviderCatalog` + `resolveProvider({ assetRole: "llm", tier: "low", llmVariant: "default" })` are CLOSED.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Playbook + Trend inputs missing from AC.** SPEC requires agent input: Ficha viva + **Playbook** + **Snapshot de tendencias** (if exists) + preferencias allowlist. TASKS.md Fase 3: `input ficha + playbook + tendencias + allowlist`. USER_STORIES AC only mandates `getBusinessProfileForAgents` — no AC for `getPlaybookForAgents()` or `getTrendSnapshotForWeek(weekStart)`. | SPEC §3 Content Strategy Agent; §3 Content Playbook; §3 Trend Intelligence; TASKS.md Fase 3 L70; US-16.1/US-16.2 CONTRACT (sole agent read paths) | Add AC: job **MUST** call `getPlaybookForAgents()` and `getTrendSnapshotForWeek(weekStart)` only — never direct table SELECT or raw interview. Safe empty when no trend snapshot. |
| **High** | **Per-slot brief shape under-specified in AC.** SPEC: each slot includes **tema + `formato_playbook_slug` + modalidad de producción + `tactica_tendencia_slug` (optional)** within Cliente allowlist. USER_STORIES AC mentions pillars/themes/slots and business goals (trust, education, local sale, DM) but not playbook slug, per-slot modalidad, or optional trend slug. | SPEC §3 Content Strategy (S3.M5, ampliado 2026-08-28); CONTEXT **Modalidad de producción (por slot)**; US-16.1/16.2 SECURITY (slug FK validation) | Freeze brief Zod schema in CONTRACT: ≥3 slots; each slot requires tema, `formatoPlaybookSlug`, `productionModality`; optional `tacticaTendenciaSlug`; validate slugs against helper outputs server-side post-LLM. |
| **High** | **Modalidad ⊆ allowlist validation absent from AC.** SPEC: “modalidad por slot ⊆ allowlist”; System schema-validates brief. TASKS.md explicit. Allowlist comes from `getBusinessProfileForAgents().visualModeSummary.allowedModes` (US-3.4 CONTRACT). | SPEC §3 Avatar/Visual + Content Strategy; TASKS.md L72; US-3.4 CONTRACT `visualModeSummary` | Add AC: reject/store-not brief if any slot `productionModality` ∉ `allowedModes`; if `visualModeSummary === null`, fail closed or Operator-only override path documented. |
| **Medium** | **Operator-only AC vs System cron path.** AC: “endpoint/action rejects non-operator (403).” ADR-0001 / SPEC: **System** runs weekly cycle (Estrategia + generation) without Operator. Strategy job must be invocable from trusted server orchestration (cron) **without** `requireOperator()`. | ADR-0001; SPEC §3 Content Strategy “Disparo: Ciclo semanal automatizado”; SPEC §2 System vs Operator | Clarify dual surfaces: **Operator UI** actions → `requireOperator()`; **internal job runner** → trusted `clientId` from cycle context, no session gate on helper. Same pattern as US-2.3 / US-16.1 agent helpers. |
| **Medium** | **DB table name omits `neuramark_` prefix.** USER_STORIES DB row: `content_strategies`. SPEC, TASKS, AGENTS.md: `neuramark_content_strategies`. | SPEC §5–§6; AGENTS.md; TASKS.md L69 | Rename in USER_STORIES and CONTRACT to `neuramark_content_strategies`; index `neuramark_content_strategies_client_id_week_start_idx` (or equivalent). |
| **Medium** | **Cliente brief read in SPEC, absent from US-4.1 FE.** SPEC §3: “Cliente: lectura del brief en V1 (ve formato y modalidad por Reel; no edita estrategia).” TASKS.md: “UI Cliente: lectura brief.” US-4.1 FE owner: Operator generate + brief view only. | SPEC §3 Content Strategy; TASKS.md L73 | Either add FE AC (Cliente read-only **Estrategia semanal** view, EN/ES) to US-4.1 or explicitly defer to US-4.2 / follow-on with cross-reference — do not silently drop SPEC Cliente visibility. |
| **Low** | **BE owner row vs AC tension.** Table says “input profile + visual mode”; AC says `getBusinessProfileForAgents` only. Visual allowlist is **inside** profile DTO via `visualModeSummary` (US-3.4) — not a separate surface. | US-3.4 CONTRACT; US-2.3 CONTRACT | Update USER_STORIES BE row to: “input via four server helpers (profile incl. allowlist, playbook, trend, provider catalog).” |
| **Low** | **Regenerate / versioning.** AC “Regenerate creates new version without deleting approved history” aligns with SPEC versioning intent and US-4.2 approval flow. CONTRACT must define `status` (`draft` default), integer or row `version`, and immutability rules for `approved` rows. | SPEC §3 Content Strategy; USER_STORIES US-4.2 | Freeze in CONTRACT: append new draft row or bump version; never overwrite `approved`; US-4.2 owns edit/approve. |
| **Info** | **Instagram-only / no multichannel — correct.** AC explicit; matches SPEC §1 Fuera de alcance (TikTok, YouTube, LinkedIn, Blog, Stories) and roadmap Instagram-first. Brief schema must not include non-IG channel fields. | SPEC §1; USER_STORIES US-4.1 AC | CONTRACT: brief typed as IG Reels weekly plan only; reject multichannel keys in LLM output. |
| **Info** | **3 Reel slots + messaging goals — aligned.** AC ≥3 slots aligned to trust, education, local sale, inbound DM goals supports SC-1 and local-service positioning. Not contradictory to SPEC. | SPEC §1 SC-1; USER_STORIES US-4.1 AC | Optional CONTRACT fields: `pillar` / `theme` / `ctaGoal` per slot — do not replace required playbook/modalidad/trend slugs. |
| **Info** | **LLM via catalog — aligned.** AC references US-X.4 low-tier LLM; frozen CONTRACT maps Content Strategy → `resolveProvider(..., { llmVariant: "default" })` → `siliconflow_deepseek_flash`. Keys server env only. | SPEC §3 agents “LLM vía catálogo/tier”; US-X.4 CONTRACT LLM routing table | Agent module imports `getProviderCatalog()` + `resolveProvider` only; no hardcoded vendor in strategy job. |
| **Info** | **[SEC] prompt injection + rate-limit — aligned.** Delimited profile data, typed brief validation before persist, debounced generate — matches SPEC server-only agent pattern and Trend/Playbook untrusted-input containment from US-16.x SECURITY. | SPEC §3 Content Strategy; US-16.1/16.2 SECURITY; USER_STORIES [SEC] AC | CONTRACT: delimiter wrapping for profile + playbook/trend hints; strip Operator-only fields already absent from agent DTOs; rate-limit per `client_id`. |
| **Info** | **Playbook vs Trend not conflated.** Upstream stories correctly separated; US-4.1 must attach **Formato de Reel** slug from Playbook and optional **Táctica de tendencia** slug from weekly snapshot — not merge catalogs. | SPEC §3 Playbook vs Trend; CONTEXT canon | Validate `formatoPlaybookSlug` ∈ `getPlaybookForAgents()`; `tacticaTendenciaSlug` ∈ `getTrendSnapshotForWeek()` active entries when present. |
| **Info** | **ADRs untouched for this story.** Strategy LLM job on Vercel app layer — no Fly worker (ADR-0003), no IG publish (ADR-0002), no cron implementation required in US-4.1 (ADR-0001 consumer later). | ADR-0001–0003 | Do not add publish path, FFmpeg, or cron Route Handler in US-4.1 unless explicitly scoped. |
| **Info** | **Out of scope held:** Video Script (US-5.1), Caption, cost policy enforcement (US-7.2), approval edit (US-4.2), Cliente Aprobación, multicanal, Stories, ads, RBAC UI. | SPEC §1; USER_STORIES Phase 2–3 split | US-4.1 = generate + store + Operator brief view; no script/video/caption jobs. |

---

### Helper contract alignment (closed upstream)

| Helper | Story | US-4.1 obligation |
|--------|-------|-------------------|
| `getBusinessProfileForAgents(clientId)` | US-2.3 ✅, widened US-3.4 ✅ | **Required.** Sole Ficha viva + `visualModeSummary` (allowlist, `mustDiscloseNotOwner`) path. **Not** raw `neuramark_interview_sessions`. |
| `getPlaybookForAgents()` | US-16.1 ✅ | **Required.** Sole Playbook read; validate each slot `formatoPlaybookSlug`; consume `modalidades_recomendadas` / rubros for prompt context. |
| `getTrendSnapshotForWeek(weekStart)` | US-16.2 ✅ | **Required** when week has snapshot; safe `{ entries: [] }` when not. Optional `tacticaTendenciaSlug` per slot; validate against active entries only. |
| `getProviderCatalog()` + `resolveProvider(..., llmVariant: "default")` | US-X.4 ✅ | **Required** for LLM call. Content Strategy uses `default` → DeepSeek Flash row. |

---

### Terminology violations (CONTEXT)

**USER_STORIES § US-4.1** uses “weekly brief” in BE/FE descriptions. CONTEXT _Evitar_ for **Estrategia semanal**: *weekly brief (salvo que se unifique)*.

| Prefer (UI copy EN/ES) | _Evitar_ |
|------------------------|----------|
| **Estrategia semanal** | weekly brief (product-facing) |
| **Formato de Reel** | reel template, content format |
| **Táctica de tendencia** | trend tip, viral hack |
| **Modalidad de producción** | production mode, slot visual type |
| **Playbook de formatos** | viral playbook, template library |
| **Operator** | admin, administrador, staff |
| **Ficha viva** | Business Profile as primary ES headline |

Technical enums (`own_avatar`, `generic_avatar`, `faceless`, `formato_playbook_slug`) OK in code/DB per US-16.x CONTRACT.

---

### Blocking gaps (must close before CONTRACT freeze)

| # | Gap | Blocks |
|---|-----|--------|
| 1 | AC missing **`getPlaybookForAgents()` + `getTrendSnapshotForWeek()`** as mandatory inputs | Playbook/Trend integration per SPEC §3 |
| 2 | AC missing **per-slot `formatoPlaybookSlug`, `productionModality`, optional `tacticaTendenciaSlug`** in validated brief schema | SPEC §3 slot model; US-5.1 downstream |
| 3 | AC missing **modalidad ⊆ allowlist** server validation | SPEC §3 Visual + Strategy; TASKS.md |
| 4 | **Operator-only** AC ambiguous vs **System cron** invocation (ADR-0001) | Weekly automation path |
| 5 | DB name **`content_strategies`** → **`neuramark_content_strategies`** | NFR / AGENTS.md prefix rule |

**Non-blocking (resolve in CONTRACT or story split):** Cliente read-only brief UI (SPEC/TASKS vs US-4.1 FE scope); BE owner row wording; brief pillar/theme optional fields; `approved` immutability detail (US-4.2 handoff).

---

### Recommended action

1. **Amend `plan/USER_STORIES.md` § US-4.1** (or document overrides in CONTRACT with PO signoff) to add the five blocking AC items above.
2. Proceed to **SECURITY.md** then **CONTRACT.md** with frozen:
   - Table **`neuramark_content_strategies`** (`client_id`, `week_start`, `brief` jsonb, `status`, `version`, timestamps); multi-tenant; RLS deny-by-default.
   - **Brief Zod schema** (≥3 IG Reel slots; required slug/modalidad fields; optional trend slug).
   - **Four-helper input pipeline** — no direct Supabase reads from agent module bypassing helpers.
   - **Dual invoke paths:** Operator Server Action (`requireOperator`) vs internal cycle runner (trusted `clientId`).
   - **LLM:** `getProviderCatalog()` + `resolveProvider({ assetRole: "llm", tier: "low", llmVariant: "default" })`.
   - **Post-LLM validation:** slugs ∈ helper outputs; modalidad ∈ `visualModeSummary.allowedModes`; malformed output rejected, not stored.
   - **Rate-limit** on Operator generate action per `client_id`.
   - Explicit out of scope: scripts, captions, video, publish, cron Route Handler (unless added to story), Cliente edit, multicanal.

Do not check off USER_STORIES acceptance criteria in this gate. Do not write application code.
