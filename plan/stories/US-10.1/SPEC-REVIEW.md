## Spec Review — US-10.1

### Verdict: GAPS

US-10.1 intent — **System** runs post-**Ensamblado** (branded) compliance checks on **Paquete de guion**, **caption de Instagram**, and production metadata; persists a server-owned **Veredicto QA** in `neuramark_qa_reports`; surfaces pass/fail + **blocking** / **overridable** severity on Operator `/operator/scripts`; exports a DB-only gate helper for **US-11.1**; defers Operator override UI/`qa_overrides` to **US-10.2** — is **directionally aligned** with SPEC §3 **QA/Compliance Agent** (S3.M11), SPEC §1 SC-1/SC-2 (Reels listos sin grabarse; no path to Aprobación/publish without QA resolution), SPEC §2 roles (System runs checks; Operator overrides later; Cliente decides in Aprobación), SPEC §4 error paths (**QA blocking legal** → no Aprobación; no legal override), SPEC §5–§6 (`neuramark_*`, server-only LLM/secrets, multi-tenant `client_id`, EN/ES), SECURITY_BASELINE §7 (non-overridable legal class: consent + generic-avatar impersonation), USER_STORIES § US-10.1 AC, and frozen upstream **US-9.2** ✅ (branded `assembled_reel` + `branding_status`) · **US-6.1** ✅ (captions) · **US-3.4** ✅ (`evaluateGenericAvatarNotOwnerCheck` + `QA_CHECK_SEVERITY.blocking`) · **US-5.1** ✅ (per-slot `modalidad` + `mustDiscloseNotOwner` on script row) · **US-X.4** ✅ (`resolveProvider` `llm`) · **US-7.1** ✅ (budget) · **US-14.5** ✅ (`requireOperator()`).

**Gaps** are soft SPEC/AC phasing and CONTRACT freezes — not product-direction drift. No CONFLICT with CONTEXT, ADRs, or hard rules. **No SPEC amendment required** for Phase A to proceed; optional USER_STORIES hygiene amendments listed below.

**Upstream dependencies satisfied:** US-9.2 ✅ · US-6.1 ✅ · US-3.4 ✅ · US-5.1 ✅ (slot modalidad for disclosure/consent checks) · US-X.4 ✅ · US-7.1 ✅ · US-14.5 ✅ · US-3.2 ✅ (consent ledger for `own_avatar_consent`) · US-8.3 ✅ (manual path still enters QA — no bypass).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Medium** | **“Video” QA ≠ vision model.** USER_STORIES title says “script, caption, **and video**”; SPEC S3.M11 lists post-ensamblado checks (tono, claims, claridad, CTA, disclosure IA, avatar) — **not** frame OCR / vision LLM. PREP PO #5 freezes metadata + text + branded-assembly prerequisite. Correct V1 read; ambiguous AC wording could tempt BUILD to add vision. | SPEC S3.M11; README PO #5; USER_STORIES US-10.1 title/BE | CONTRACT: **no** vision/frame LLM in Phase A; “video” coverage = `branding_status = completed` + modality/TTS/consent metadata + script/caption text. Optional PO amend USER_STORIES BE row when next edited. **No SPEC amendment.** |
| **Medium** | **AC “until resolved or overridden” vs Phase A.** USER_STORIES AC: failed critical checks block Aprobación until resolved **or** Operator override. Phase A ships gate `ready` **iff** `status = 'passed'`; override = **US-10.2**. Overridable failures leave report `failed` → gate not ready — correct interim. VALIDATION must not claim full AC “overridden” path closed. | USER_STORIES US-10.1 AC; S3.M11 gate a Aprobación; US-10.2 | CONTRACT + VALIDATION: Phase A closes server verdicts + gate helper + Operator panel; document override path as **US-10.2** dependency for full AC. Do not ship override endpoints in 10.1. |
| **Medium** | **Slot modalidad vs allowlist proxy for legal checks.** US-3.4 stub historically used profile `mustDiscloseNotOwner` (allowlist proxy). US-5.1 now persists **per-slot** `modalidad` + `mustDiscloseNotOwner` on `neuramark_reel_scripts`. SPEC S3.M4 regla clave: modalidad **por slot**. QA must drive `generic_avatar_not_owner`, `own_avatar_consent`, and `ai_disclosure` triggers from **script-row slot fields** (+ live consent ledger), not allowlist alone. | SPEC S3.M4; S3.M11; US-3.4 SPEC-REVIEW tracked gap; US-5.1 persist | CONTRACT: load script `modalidad` / `mustDiscloseNotOwner`; consent check only when `modalidad === own_avatar`; generic-avatar check when slot is genérico (import US-3.4 evaluator with slot-derived flag); TTS/avatar → `ai_disclosure` evidence context. |
| **Medium** | **Auto-chain hook placement unset at contract level.** PO: auto-chain when `branding_status → completed` (mirror US-9.2). US-9.2 owns branding status writer — QA enqueue must hook the **sole branding-complete path** without forking status semantics or reverting branding on QA failure (README OQ3). | S3.M11 auto en ciclo; US-9.2 CONTRACT branding applier; README PO #6 | CONTRACT: freeze `onBrandingCompleted(assembledReelId)` (or equivalent) — enqueue/run QA; failure → report `failed`/`pending` + log; **never** revert `branding_status`. |
| **Low** | **Soft gap: weekly ciclo cron.** SPEC S3.M11 / S3.M14 “auto en ciclo”; ADR-0001 System cron → Aprobación. PREP ships Operator trigger + branding auto-chain; weekly cron = integrations-engineer (same pattern as US-6.1 / US-9.2). | S3.M11; S3.M14; ADR-0001 | Document `invokedBy: 'system' \| 'operator'` seam; **no** cron HTTP in US-10.1 BUILD. Not a PREP/SPEC veto. |
| **Low** | **USER_STORIES DB shorthand omits `neuramark_`.** Row lists `qa_reports`; canonical **`neuramark_qa_reports`**. Columns omit denormalized `client_id` / `updated_at` that PREP correctly adds. | SPEC §1 prefix; §6; AGENTS.md | CONTRACT uses prefixed names + `client_id`; amend USER_STORIES DB row when PO next edits. |
| **Low** | **`ai_disclosure` classified `overridable`.** SPEC legal non-override set = consent + impersonación only (S3.M11; SECURITY_BASELINE §7). Disclosure is a required check but not in the non-overridable set — PREP classification **ALIGNED**. SECURITY may still harden evidence/gating rules. | S3.M11; SECURITY_BASELINE §7; README PO #2–3 | No SPEC change. SECURITY confirms disclosure fail stays overridable; US-10.2 must still 403 only `blocking` keys. |
| **Info** | **Check catalog keys map to SPEC checks.** tono→`tone`; claims→`dangerous_claims`; claridad→`clarity`; CTA→`cta_presence`; disclosure IA→`ai_disclosure`; avatar→`generic_avatar_not_owner` (+ `own_avatar_consent` legal). USER_STORIES “avatar misuse” = single key (PO #1). | S3.M11; US-3.4; README PO #1 | CONTRACT freezes exact `checkKey` constants; import US-3.4 key — do not fork. |
| **Info** | **Severity split ALIGNED.** `blocking`: `own_avatar_consent`, `generic_avatar_not_owner`. `overridable`: claims/tone/clarity/disclosure/CTA. Code/config only — matches [SEC] AC + SECURITY_BASELINE §7. | S3.M11; USER_STORIES [SEC]; US-10.2 | SECURITY owns bypass tests; US-10.2 imports same catalog. |
| **Info** | **Roles / surfaces ALIGNED.** Operator QA panel on `/operator/scripts`; Cliente Aprobación = US-11.1; System auto-chain; no Cliente-writable pass flag. | SPEC §2; S3.M11–M12 | No new Operator nav route; no Cliente QA panel in 10.1. |
| **Info** | **ADRs respected.** LLM QA on Vercel app layer (like strategy/script/caption) — **not** Fly FFmpeg (ADR-0003). No IG publish (ADR-0002). Cron deferred (ADR-0001). | ADR-0001–0003 | Do not add Graph publish or Fly worker for QA. |
| **Info** | **Hard rules intact.** No publish without Aprobación (SC-2); no human recording; no Stories/multicanal/ads/RBAC UI; Playbook ≠ Trend untouched. Manual upload still enters QA (US-8.3). | SPEC §1; S3.M9; US-8.3 | SECURITY documents downstream gate continuity. |
| **Info** | **NFR / stack.** `neuramark_*`; RLS deny-by-default; server-only verdicts; i18n EN/ES `scripts.qa.*`; budget before LLM; rate limit `qa_run`; multi-tenant `client_id` from session — never body. | SPEC §5–§6; AGENTS.md | CONTRACT freezes error codes + DTO fields. |

---

### TASKS open questions — resolved against SPEC

| # | Question (README / TASKS) | Resolution | SPEC / ADR basis |
|---|---------------------------|------------|------------------|
| 1 | One report UPSERT vs append-only history | **UPSERT one current row** per `assembled_reel_id` (UNIQUE + replace on re-run). Override audit = **US-10.2** `qa_overrides`, not full QA history. | S3.M11 `neuramark_qa_reports`; no history mandate in SPEC |
| 2 | Caption missing at QA time | **Hard reject** run (`CAPTION_REQUIRED` or equivalent) — prefer over soft-failing CTA only. Cycle order is Caption → … → Assembly → QA; missing caption is ops error. | S3.M7 then S3.M10→M11; SC-1 package completeness |
| 3 | Auto-chain failure UX | Branding stays **`completed`**; QA failure → Operator-visible report status + log; **no** branding revert. | SPEC §4 ciclo parcial / Operator exceptions; US-9.2 lineage |
| 4 | LLM returns severity | **Ignore agent severity** — server overwrites from check catalog (code). | USER_STORIES [SEC] classification code/config; SECURITY_BASELINE §7–§8 |
| — | Vision / frame LLM? | **Out of V1** for this story. | S3.M11 check list (text/compliance); SPEC §1 no edición avanzada |
| — | Weekly cron auto-QA? | **Out of BUILD** — document system seam; Operator + branding auto-chain only. | ADR-0001; S3.M14 (integrations later) |
| — | Phase A gate ready when? | **`status = 'passed'` only.** Future: passed **or** all overridable fails overridden + no blocking (US-10.2). | S3.M11–M12; US-11.1 |
| — | Report status `blocked` vs `failed` | **`blocked`** = any blocking fail; **`failed`** = only overridable fails; **`passed`** = all pass. Spec-OK enum refinement. | S3.M11 blocking vs overridable |

**No SPEC amendment required** for the resolutions above. They complete S3.M11 Phase A without reopening override (US-10.2) or Aprobación UI (US-11.1).

**Recommended USER_STORIES amendments** (non-blocking hygiene when PO next edits):

1. Clarify BE/title “video” → branded Ensamblado prerequisite + text/metadata checks (no vision).
2. DB row → `neuramark_qa_reports` + `client_id`.
3. Note Phase A gate = passed-only; override path = US-10.2 for full “or overridden” AC.

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS (uses **Veredicto QA**, **Ensamblado**, **Paquete de guion**, **caption de Instagram**, **Aprobación**, **Operator**, **Cliente**, **Avatar genérico profesional**; correctly scopes _Evitar_ “QA verdict” as product noun).

Product-facing EN/ES for US-10.1 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Veredicto QA** | QA verdict (as primary product noun) |
| **Aprobación** | approval decision (as primary ES noun) |
| **Paquete de guion** | script package |
| **Reel ensamblado** / **Ensamblado** | assembled reel (user-facing ES) |
| **Avatar genérico profesional** | generic_avatar (in Cliente copy) |
| **disclosure** (presenter is not the owner) | impersonation (in Cliente-facing copy) |
| **Cliente** | prestador, dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Consentimiento de avatar** | consent ledger (in business glossary UI) |

Technical enums (`checkKey`, `blocking`, `overridable`, `branding_status`, `qa_run`) OK in code/DB and Operator diagnostics; map to localized labels in FE. Do **not** expose raw LLM dumps as primary UI; do **not** label a failed legal block as Operator-overridable.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-10.1 CONTRACT.md (DDL, actions, Zod `checks`, gate helper, auto-chain) | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| Check catalog + severity map (immutable runtime) | **Yes — [SEC] AC** | Code/config only; import US-3.4 `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` + `QA_CHECK_SEVERITY`. |
| Server-only verdicts; no client `passed` | **Yes — [SEC] AC** | Gate helper reads DB only; smuggle tests. |
| Slot `modalidad` / consent / disclosure inputs | **Yes — SPEC S3.M4 + AC** | From script row + live ledger; not request body. |
| Budget gate + spend on LLM | **Yes — US-7.1 continuity** | Assert before LLM; no partial `passed` on budget block. |
| Auto-chain on branding `completed` | **Yes — orchestration** | Single-writer hook; no branding revert on QA fail. |
| Caption-missing / branding-incomplete errors | **Yes — freeze codes** | Hard reject; typed errors for FE. |
| Rate limit `qa_run` | **No — but freeze in CONTRACT** | Mirror caption/script window. |
| Report UPSERT cardinality | **No — PO lean accepted** | UNIQUE `assembled_reel_id`; history out. |
| Vision / frame LLM | **No — out of scope** | Do not add. |
| Weekly cron | **No — out of scope** | ADR-0001 integrations-engineer. |
| US-10.2 override body | **No — downstream** | Classification + `failed`/`blocked` semantics only. |
| US-11.1 approval package | **No — downstream** | Consume `getQaGateStatusForAssembledReel` only. |

**SPEC blockers on intent:** none. **ADR breaches:** none if QA LLM stays on Vercel/Next (no Fly FFmpeg for this story) and no IG publish.

**SECURITY can proceed?** **Yes.** [SEC] AC items (server-stored verdicts, no client pass flag, blocking vs overridable code/config, legal class continuity with US-3.4/US-10.2) and SECURITY_BASELINE §5–§8 are specified sufficiently for **security-architect** to author **SECURITY.md** — IDOR on assembled_reel_id, prompt-injection delimiters, severity overwrite, budget/rate limits, auto-chain trust boundary, and gate-helper purity.

**CONTRACT blockers (freeze before BUILD):**

1. Migration — `neuramark_qa_reports` (`id`, `client_id`, `assembled_reel_id` UNIQUE, `checks` jsonb, `status` CHECK, timestamps); RLS enabled, zero policies.
2. **`runQaForAssembledReel({ assembledReelId })`** — `requireOperator`; prerequisites branding completed + caption present; deterministic + LLM merge; persist; never accept client pass.
3. **`getQaGateStatusForAssembledReel(assembledReelId)`** — DB-only; Phase A `ready` iff `passed`.
4. Check catalog module — keys + severity; import US-3.4 evaluator; `own_avatar_consent` live ledger.
5. LLM agent — `resolveProvider(..., llmVariant: 'default')`; Zod `.strict()`; server severity overwrite; budget assert + spend event.
6. Auto-chain hook after branding `completed` + failure UX (no branding revert).
7. Operator DTO + `/operator/scripts` QA panel contract (badges, Run/Re-run, EN/ES); no override modal.
8. Rate limit `agent_key: 'qa_run'`; error codes (`CAPTION_REQUIRED`, branding incomplete, budget, etc.).
9. Phase A acceptance boundary vs US-10.2 / US-11.1 — VALIDATION must not check off override or Cliente Aprobación AC.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-10.1 CONTRACT.md** with the non-negotiable freezes above.

1. **S3.M11 Phase A** — run, store, display, classify, gate helper; override = US-10.2; Cliente package = US-11.1.
2. **Branded Ensamblado only** — `branding_status = completed`; key off `neuramark_assembled_reels.id`.
3. **Legal blocking** — consent + `generic_avatar_not_owner` only; catalog immutable.
4. **Slot modalidad** from script row for consent/disclosure/impersonation triggers.
5. **No vision LLM**; no weekly cron HTTP; no client-supplied QA status.
6. **Explicit out of scope:** US-10.2 override, US-11.1 Aprobación UI, Stories IG, multicanal, ads, RBAC UI, Playbook/Trend edits, Fly FFmpeg for QA.

**Gate status:** SPEC-REVIEW **GAPS** (intent aligned; soft phasing + CONTRACT freezes — not CONFLICT). Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
