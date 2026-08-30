## Spec Review — US-4.2

### Verdict: GAPS

US-4.2 intent — **Operator** reviews and edits a **draft Estrategia semanal**, persists corrections, transitions **`draft` → `approved`** with audit metadata, and gates **US-5.1** script generation on **`approved` status** — is **directionally aligned** with SPEC §3 **Content Strategy Agent** (“Operator puede ver/editar/regenerar”), frozen **US-4.1** brief schema (`contentStrategyBriefSchema`, allowlist validation, `neuramark_content_strategies` versioning), CONTEXT canon (**Estrategia semanal**, **Formato de Reel**, **Modalidad de producción**, **Operator**), and downstream **US-5.1** `[SEC]` (verify `approved` server-side).

**Gaps** sit between `plan/USER_STORIES.md` § US-4.2 acceptance criteria / owner table and what SPEC, US-4.1 CONTRACT, and ADR-0001 require. Until USER_STORIES (or frozen CONTRACT) closes them, implementation risks a strategy gate that contradicts **auto-avance**, silently drops **Cliente** brief visibility, or breaks **INSERT-only regenerate** semantics with an unscoped `PATCH`.

**Upstream (US-4.1) is CLOSED:** `neuramark_content_strategies` migration with `status` enum (`draft` | `approved`); monotonic `version` per `(client_id, week_start)`; frozen slot shape; `validateBriefAgainstAllowlists()`; Operator generate/read on `/operator/strategy`; `approved_by` / `approved_at` **not** in schema (explicit US-4.2 deferral).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **SPEC auto-avance vs mandatory Operator approval.** SPEC §3 Content Strategy: “**Auto-avance:** tras estrategia válida, el ciclo continúa a guiones/generación **sin approve Operator obligatorio**.” ADR-0001: System runs **Ciclo semanal automatizado** (Estrategia → … → Aprobación) without Operator. USER_STORIES US-4.2 AC: “**Approved strategy required before batch script generation**.” These conflict unless paths are split. | SPEC §3 Content Strategy; ADR-0001; SPEC §1 disparo ciclo; USER_STORIES US-4.2 AC | Freeze in CONTRACT **dual-path gate:** (A) **System/cron path** — valid `draft` may auto-set `approved` or US-5.1 accepts `draft` when `invokedBy: "system"` (pick one; document in CONTRACT + PO signoff on SPEC interpretation); (B) **Operator/manual script path** — explicit **Approve strategy** required. Do not ship a single global gate that blocks ADR-0001 automation without SPEC amendment. |
| **High** | **Edit persistence model undefined vs US-4.1 INSERT-only versioning.** USER_STORIES BE: “`PATCH` strategy.” US-4.1 CONTRACT freeze: regenerate **INSERT** new `version`; **never UPDATE** prior `brief` on regenerate; **`approved` rows immutable**; new regenerate INSERTs new `draft`. Unclear whether edits UPDATE the current draft row or INSERT. | US-4.1 CONTRACT § State transitions, § Frozen decisions #8; migration comment “INSERT-only versioning” | CONTRACT: **save edits** = `UPDATE brief` (and `updated_at`) on the **latest `draft` row only**; **approve** = `UPDATE status` + `approved_by` / `approved_at` on that same row; **regenerate** (US-4.1) remains INSERT; **never UPDATE** an `approved` row’s `brief`; reject edit/approve on non-latest draft or `approved` row. Prefer Server Action over public Route Handler per AGENTS.md. |
| **High** | **Editable field allowlist under-specified.** USER_STORIES FE: “themes, angles, CTAs.” US-4.1 frozen slot schema requires `tema`, `formatoPlaybookSlug`, `modalidad`, `goal`; optional `tacticaTendenciaSlug`, `angle`, `ctaHint`; brief has `pillars`, `themes`. SPEC: Operator edits strategy; **modalidad por slot ⊆ allowlist** must hold after edit. AC does not state whether Operator may change **Formato de Reel**, **Modalidad de producción**, **Táctica de tendencia**, **pillars**, or **goal** per slot. | SPEC §3 Content Strategy + Avatar/Visual; US-4.1 CONTRACT § Per-slot brief shape; CONTEXT **Modalidad de producción (por slot)** | CONTRACT: explicit **editable allowlist** (recommend: pillars, themes, slot `tema`, `angle`, `ctaHint`, and Operator-safe slug/modalidad fields with dropdowns sourced from helpers); **re-run** `contentStrategyBriefSchema` + `validateBriefAgainstAllowlists()` on every save; reject save if modalidad ∉ allowlist or slugs invalid. |
| **Medium** | **Cliente read-only Estrategia semanal still absent.** SPEC §3: “**Cliente: lectura del brief en V1** (ve formato y modalidad por Reel; no edita estrategia).” US-4.1 SPEC-REVIEW deferred to US-4.2 / follow-on. US-4.2 USER_STORIES has **no** Cliente FE/BE AC — only Operator edit/approve. | SPEC §3 Content Strategy; US-4.1 SPEC-REVIEW; US-4.1 CONTRACT “Cliente read deferred US-4.2” | Add AC: Cliente read-only view (EN/ES) via `requireActive()` + server `client_id`; show approved (or latest) brief with formato/modalidad labels — **or** spin explicit follow-on story and cross-reference in CONTRACT so SPEC Cliente visibility is not dropped a second time. |
| **Medium** | **Approval metadata columns missing from shipped schema.** AC: “Shows **who approved and when** (hardcoded user OK in local dev).” Migration `20260830130000_neuramark_content_strategies.sql` has no `approved_by` / `approved_at`. US-4.1 TASKS: “No `approved_by` / `approved_at` in 4.1 (US-4.2).” | USER_STORIES US-4.2 AC; US-4.1 TASKS.md; US-4.1 CONTRACT state machine | US-4.2 migration: add nullable `approved_by uuid REFERENCES neuramark_clients(id)`, `approved_at timestamptz`; set on `draft` → `approved` from `getCurrentUser()` after `requireOperator()`; expose in Operator read DTO only. |
| **Medium** | **Read helpers conflate “latest row” vs “latest draft” vs “approved for scripting”.** US-4.1 `getLatestContentStrategy` returns `ORDER BY version DESC LIMIT 1` (any status). After regenerate, latest is `draft` while older `approved` may exist. Approve/edit must target **latest draft**; US-5.1 must resolve **approved** row for `(client_id, week_start)` — not assume latest row is approved. | US-4.1 CONTRACT § Read scope; USER_STORIES US-4.2 + US-5.1 AC | CONTRACT: `getLatestDraftStrategy({ weekStart })` for edit UI; `getApprovedStrategyForWeek({ weekStart })` for script gate; approve rejects if no draft or draft `version` ≤ max approved `version` without explicit supersede rules (document). |
| **Medium** | **Lock-after-scripts rule in owner table but not in AC.** USER_STORIES BE: “lock after scripts generated (**configurable**).” DESIGN_PROMPTS §5 state (c): “approved & locked… Scripts already generated — editing requires regeneration.” No US-4.2 AC; `neuramark_reel_scripts` does not exist yet (US-5.1). | USER_STORIES US-4.2 BE row; DESIGN_PROMPTS.md §5; USER_STORIES US-5.1 | Add AC or CONTRACT deferral: when `neuramark_reel_scripts.strategy_id` exists, block `brief` UPDATE (or require new draft version + re-approve); default **locked** in V1 unless PO marks “configurable” as P2. |
| **Low** | **Strategy history list UI deferred from US-4.1, not in US-4.2 AC.** US-4.1 CONTRACT: “History list deferred US-4.2.” USER_STORIES US-4.2 silent. | US-4.1 CONTRACT § Out of scope / Read scope | Explicit out-of-scope in US-4.2 CONTRACT unless PO adds AC; optional version dropdown is P2. |
| **Low** | **DB owner row still says `content_strategies.status`.** USER_STORIES table uses unprefixed name; shipped table is `neuramark_content_strategies`. | AGENTS.md; SPEC §1 prefijo; US-4.1 CONTRACT | Rename in USER_STORIES / CONTRACT to `neuramark_content_strategies.status`. |
| **Info** | **Operator-only gate — aligned.** AC + US-4.1 pattern: `requireOperator()` on edit/approve/read mutations; 403 for Cliente sessions on Operator surfaces. Cliente read (if added) uses separate `requireActive()` path. | SPEC §2 Operator-only actions; US-4.1 SECURITY; USER_STORIES [SEC] | CONTRACT mirrors US-4.1 forbidden fields (`status`, `clientId` smuggling) on save input; approve is dedicated action, not client-writable status. |
| **Info** | **State machine [SEC] AC — aligned with US-5.1 handoff.** Server enforces `draft` → `approved` only; US-5.1 verifies `approved` + tenancy — matches SPEC agent pattern and USER_STORIES US-5.1 `[SEC]`. | USER_STORIES US-4.2, US-5.1 [SEC]; SPEC §3 Video Script | CONTRACT: error codes `INVALID_STATUS_TRANSITION`, `STRATEGY_NOT_APPROVED`, `STRATEGY_LOCKED`; no DELETE of approved rows. |
| **Info** | **Playbook vs Trend not conflated.** Edits must preserve slug validation against `getPlaybookForAgents()` / `getTrendSnapshotForWeek()` — same as US-4.1 generate path. | SPEC §3 Playbook vs Trend; US-4.1 CONTRACT | Reuse `validateBriefAgainstAllowlists()` on save; Operator UI uses playbook/trend labels from server maps (US-4.1 `playbookLabels` pattern). |
| **Info** | **ADRs respected.** Edit/approve stays on Vercel app layer (no Fly worker — ADR-0003); no IG publish (ADR-0002); cron consumer may later auto-approve or bypass Operator gate per dual-path resolution (ADR-0001). | ADR-0001–0003 | Do not add publish, FFmpeg, or public cron HTTP in US-4.2. |
| **Info** | **Out of scope held:** Video Script jobs (US-5.1), Caption, cost engine (US-7.2), Cliente **Aprobación** de piezas, multicanal, Stories, ads, RBAC UI, LLM regenerate (US-4.1). | SPEC §1; USER_STORIES phase split | US-4.2 = edit draft + approve + metadata + gates; not script generation. |

---

### US-4.1 handoff alignment (implemented baseline)

| US-4.1 artifact | US-4.2 obligation |
|-----------------|-------------------|
| `contentStrategyBriefSchema` + slot shape | Reuse for edit save validation — do not fork schema |
| `validateBriefAgainstAllowlists()` | **Mandatory** on Operator save (not only LLM output) |
| `neuramark_content_strategies` + `version` | Edit/approve target **draft** rows; preserve version history |
| `contentStrategyStatusSchema` (`draft` \| `approved`) | US-4.2 may write `approved`; US-4.1 never did |
| `/operator/strategy` read-only UI | Extend with inline edit + **Approve strategy** CTA (DESIGN_PROMPTS §5 states b/c) |
| `getLatestContentStrategy` | Split or extend for draft vs approved semantics |
| Forbidden: `approved` writes in US-4.1 | US-4.2 owns first `approved` transition |

---

### Terminology violations (CONTEXT)

| Location | Issue | Prefer |
|----------|-------|--------|
| USER_STORIES title “weekly brief” (EN slug) | CONTEXT _Evitar_ for **Estrategia semanal**: *weekly brief (salvo que se unifique)* | Product chrome: **Estrategia semanal** / **Weekly content strategy**; `brief` OK as technical/jsonb |
| USER_STORIES FE “CTAs” | Acceptable if mapped to slot `ctaHint` + goal enum labels | UI: **CTA** / **Indicación de CTA** tied to `ctaHint`, not generic “call to action” blob |
| — | No use of admin/staff, viral playbook, production mode, approval decision (Cliente piece approval ≠ strategy approve) | **Operator**, **Formato de Reel**, **Modalidad de producción**, **Aprobación** reserved for Cliente piece flow |

Technical enums (`draft`, `approved`, `formatoPlaybookSlug`, `faceless`) OK in code/DB per US-4.1 CONTRACT.

---

### Blocking gaps (must close before CONTRACT freeze)

| # | Gap | Blocks |
|---|-----|--------|
| 1 | **Auto-avance (SPEC/ADR-0001) vs mandatory approval before scripting (US-4.2/US-5.1)** | Weekly automation path; US-5.1 gate design |
| 2 | **Edit/approve persistence model** (UPDATE draft vs INSERT; immutability of `approved`) | DB mutations; regenerate coexistence |
| 3 | **Editable field allowlist + post-edit allowlist validation** (incl. modalidad/formato slugs) | SPEC slot model; US-5.1 input integrity |
| 4 | **`approved_by` / `approved_at` migration + AC** | “Who approved and when” AC |
| 5 | **Draft vs approved read surfaces** (`getLatestDraft` / `getApprovedForWeek`) | Approve UX; US-5.1 consumer |
| 6 | **Cliente read-only Estrategia semanal in V1 (SPEC)** — missing from US-4.2 AC | SPEC §3 Cliente visibility; SC-4 transparency |

**Non-blocking (resolve in CONTRACT or PO lean):** lock-after-scripts default vs “configurable”; strategy history list UI; USER_STORIES `content_strategies` → `neuramark_content_strategies` naming; PATCH → Server Action naming.

---

### Recommended action

1. **Amend `plan/USER_STORIES.md` § US-4.2** (or document overrides in CONTRACT with PO signoff) to close blocking gaps **1–6** above.
2. Proceed to **SECURITY.md** then **CONTRACT.md** with frozen:
   - **Dual-path approval gate** (System cron vs Operator manual) reconciling SPEC auto-avance with US-5.1 `approved` check.
   - **Server Actions:** `saveContentStrategyDraft({ weekStart, brief })`, `approveContentStrategy({ weekStart })` — `requireOperator()`; strict input; no client-supplied `status` / `clientId`.
   - **Persistence:** UPDATE `brief` on latest `draft` only; UPDATE `status` + approval columns on approve; regenerate unchanged (US-4.1 INSERT).
   - **Migration:** `approved_by`, `approved_at` on `neuramark_content_strategies`.
   - **Validation:** reuse `contentStrategyBriefSchema` + `validateBriefAgainstAllowlists()` on save.
   - **Read APIs:** latest draft for edit UI; approved row for US-5.1; optional Cliente read DTO (strip Operator-only fields).
   - **Lock rule:** document V1 default when scripts exist (US-5.1 FK).
   - Explicit out of scope: script generation, regenerate LLM (US-4.1), cron Route Handler, Cliente piece Aprobación, multicanal.

Do not check off USER_STORIES acceptance criteria in this gate. Do not write application code.
