## Spec Review — US-6.2

### Verdict: GAPS

US-6.2 intent — **Operator** selects one **variante CTA** from the stored `cta_variants` array (US-6.1), persists **`selected_cta_index`** on **`neuramark_reel_captions`**, shows **preview in context** on the existing `/operator/scripts` Caption tab, and exposes server-derived **`selectedCtaText`** for **Flujo de aprobación** and **export** downstream — is **directionally aligned** with SPEC §3 **Caption Agent** (S3.M7: variantes CTA in `neuramark_reel_captions`), SPEC §3 **Approval Flow** / §4 Flujo 3 (Cliente previews caption + CTA before **Aprobación**), SPEC §1 SC-1/SC-4 (Reels ready for review without Cliente writing copy), hard rules (no publish without **Aprobación** — ADR-0002), DESIGN_PROMPTS §6 (Operator radio-cards + preview) and §9 (Cliente sees **selected CTA**, not a variant lab), frozen **US-6.1 CONTRACT** (variants generated 2–4, read-only until US-6.2, `selectedCtaIndex` forbidden on generate/regenerate), and NFR (`neuramark_*`, server-only mutation, `requireOperator`, plain text, EN/ES).

**Gaps** sit between `plan/USER_STORIES.md` § US-6.2 acceptance criteria / owner table and what SPEC, TASKS.md, DESIGN_PROMPTS, and the frozen **US-6.1 CONTRACT** require for approval/export plumbing. Until CONTRACT closes them, implementation risks a selection UX that contradicts SPEC “elegir variante CTA al aprobar,” an export/publish path that omits the chosen CTA line, or approval-queue Reels with NULL selection and no defined gate.

**Upstream dependency satisfied:** US-6.1 ✅ (`neuramark_reel_captions`, `cta_variants` jsonb 2–4, Caption tab seam, `getReelScriptsForWeek`, `requireOperator`, forbidden-key scan including `selectedCtaIndex`).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **SPEC selection actor ambiguous.** SPEC §3 Caption Agent: “Cliente/Operator: ver en Aprobación; **elegir variante CTA al aprobar**.” TASKS.md Fase 3: “selección en Aprobación.” USER_STORIES US-6.2 FE = Operator radio/select on Caption tab; README scope-out Cliente UI. DESIGN_PROMPTS §9 shows Cliente **selected CTA** (read-only), not a picker. Without freeze, BUILD may ship Operator-only selection while SPEC text implies Cliente picks at approval. | SPEC §3 Caption Agent; TASKS.md L87; DESIGN_PROMPTS §6, §9; USER_STORIES US-6.2 / US-11.1 | **CONTRACT:** Freeze V1 lean — **Operator** selects via `selectReelCaptionCta` before queue; **Cliente** sees `selectedCtaText` in US-11.1 package (approve/reject/changes only). Document as PO interpretation of “al aprobar” = approves the package including Operator-chosen CTA. Cliente variant picker = **out of scope** unless PO amends SPEC. |
| **High** | **Export / publish caption composition undefined.** AC: “Selected CTA flows to Approval Flow and **final export**.” USER_STORIES BE: “persist `selected_cta_index` **on approval**” (misleading — no approval mutation in 6.2). No shared helper for effective IG caption text (body + separator + selected CTA + hashtags). US-11.3 download and ADR-0002 Graph publish both need the same server-owned string; preview-in-context is FE-only today. | SPEC §3 Caption Agent; SPEC §3 Instagram Publish; ADR-0002; US-11.3 AC “Caption + video downloadable”; US-6.1 CONTRACT preview seam | **CONTRACT:** Add server-only **`buildEffectiveInstagramCaption({ caption, selectedCtaText, hashtags?, separator })`** (or equivalent) in `lib/contracts/reel-caption.ts`; freeze separator (README lean: `\n\n`); document US-11.1 / US-11.3 / US-12.x **must import** — never concatenate in FE for export/publish. |
| **High** | **Combined caption + CTA length vs IG limit unset.** Stored `caption` max 2200 (US-6.1). Appending selected CTA in preview/export can exceed 2200. No AC or US-6.1 bound on **effective** publish length. | SPEC §3 “límites IG”; US-6.1 `IG_CAPTION_MAX_CHARS` | **CONTRACT:** Define **`effectiveCharCount`** = `caption.length + separator.length + selectedCtaText.length` (hashtags separate per IG publish pattern). FE preview warns when over 2200; export/publish helper rejects or flags **`EFFECTIVE_CAPTION_TOO_LONG`** — pick one and freeze. |
| **Medium** | **Approval-queue gate when `selected_cta_index` IS NULL.** README PO: NULL until Operator selects; no auto-select index 0. AC requires CTA in Approval Flow but does not say whether unselected captions block queue creation (US-11.1) or QA (US-10.1). | SPEC §3 Approval Flow gate; USER_STORIES US-6.2 AC “flows to Approval Flow” | **CONTRACT:** Freeze gate owner — **US-11.1** (recommended): approval package creation returns **`CAPTION_CTA_NOT_SELECTED`** when `selectedCtaIndex === null` and caption exists; US-6.2 only persists selection + DTO. Document seam; no `approvals` table in 6.2 BUILD. |
| **Medium** | **Regenerate caption resets selection — not in USER_STORIES AC.** README PO #8: `regenerateReelCaption` UPSERT sets `selected_cta_index = NULL` (variants may change). US-6.1 persist path does not yet reset column. | US-6.1 CONTRACT UPSERT; USER_STORIES US-6.2 Depends US-6.1 | **CONTRACT:** Extend US-6.1 **`persist-reel-caption` UPSERT** to **`selected_cta_index = NULL`** on caption regen/generate replace; FE “selection cleared” copy (`scripts.caption.ctaSelect.clearedOnRegen`). |
| **Medium** | **DB owner table uses wrong table name.** USER_STORIES DB: `reel_captions.selected_cta_index` — missing `neuramark_` prefix. README correctly targets **`neuramark_reel_captions`**. | SPEC §5–§6; AGENTS.md | Migration adds column to **`neuramark_reel_captions.selected_cta_index`** nullable integer; optional CHECK `>= 0`; upper bound enforced in BE against `jsonb_array_length(cta_variants)`. |
| **Medium** | **BE owner “Store variants” is US-6.1 scope.** USER_STORIES BE row duplicates generation/storage already closed in US-6.1. Risk of re-implementing agent output or variant array writes in 6.2. | US-6.1 CONTRACT § CTA variants | CONTRACT explicit: US-6.2 **does not** mutate `cta_variants` or re-run Caption Agent; only **`selected_cta_index`** UPDATE via dedicated action. |
| **Medium** | **List DTO handoff shape incomplete in USER_STORIES.** AC “flows to Approval Flow and final export” needs frozen fields beyond index: **`selectedCtaIndex`**, **`selectedCtaText`** (server-derived), optional **`effectiveCaptionPreview`** for Operator only. | US-6.1 `reelCaptionSummarySchema`; DESIGN_PROMPTS §9 | Extend **`reelCaptionSummarySchema`** (or nested record) in CONTRACT; **`selectedCtaText`** never client-supplied; US-11.1 serializer reads same module. |
| **Low** | **AC “At least 2 CTA variants per Reel” is US-6.1, not 6.2.** Already enforced at generation (`CTA_VARIANT_MIN = 2`). Redundant as 6.2 AC; selection assumes variants exist. | US-6.1 CONTRACT; USER_STORIES US-6.2 AC #1 | Treat as **dependency assertion** in CONTRACT (select action returns **`CAPTION_NOT_GENERATED`** / **`SCRIPT_PENDING`** when no caption row or empty variants) — do not re-test generation in 6.2 BUILD. |
| **Low** | **QA agent CTA check source unset.** SPEC §3 QA: checks include CTA. US-10.1 not built. Unclear whether QA validates script CTA, caption body, or **selected** CTA line. | SPEC §3 QA/Compliance; US-10.1 | CONTRACT documents handoff: US-10.1 **should** treat **`selectedCtaText ?? script.package.cta`** as the CTA under test once 6.2 ships — no QA job in 6.2 BUILD. |
| **Low** | **[SEC] AC aligned with US-6.1 pattern.** Index-only mutation; bounds check; no free-text CTA field. | USER_STORIES US-6.2 [SEC]; US-6.1 SECURITY forbidden keys | CONTRACT: `selectReelCaptionCtaInputSchema` accepts **`{ weekStart, slotIndex, selectedCtaIndex }` only**; reject `ctaText`, `caption`, `ctaVariants`; error **`CTA_INDEX_OUT_OF_BOUNDS`**. |
| **Info** | **Roles unchanged.** Operator selects + previews; Cliente **Aprobación** deferred to US-11; System does not auto-select. | SPEC §3 roles; CONTEXT **Operator** / **Cliente** / **Aprobación** | No Cliente route or approval state machine in 6.2. |
| **Info** | **ADRs respected.** Selection is DB UPDATE on Vercel — no Fly worker (ADR-0003), no IG publish (ADR-0002), no cron (ADR-0001). | ADR-0001–0003 | Publish/export consume DTO only; no Graph API in 6.2. |
| **Info** | **Out of scope held:** caption regen/agent changes, Cliente approval UI, publish, multicanal, Stories, ads, RBAC UI, Operator free-text CTA edit, A/B analytics dashboard. | SPEC §1; US-6.1 out of scope | Matches README scope-out table. |

---

### US-6.1 handoff alignment

| Upstream artifact | US-6.2 obligation |
|-------------------|-------------------|
| `neuramark_reel_captions.cta_variants` (2–4 strings) | Read-only source for index validation; **never** PATCH variants from select action |
| Caption tab read-only variant lines | **Replace** with PrimeReact radio/select + preview block (DESIGN_PROMPTS §6) |
| `getReelScriptsForWeek` → `items[].caption` | Extend summary with `selectedCtaIndex`, `selectedCtaText` |
| `generateReelCaptions` / `regenerateReelCaption` | Unchanged; regen UPSERT **must reset** `selected_cta_index` to NULL |
| Forbidden `selectedCtaIndex` on generate/regenerate | Unchanged; **new** dedicated `selectReelCaptionCta` action |
| `requireOperator("handler")` | Required on select mutation; read gates unchanged |
| `reelCaptionRecordSchema` | Unchanged; selection metadata lives on **summary**, not inside `record` |

---

### Terminology violations (CONTEXT)

| Location | Issue | Prefer |
|----------|-------|--------|
| USER_STORIES DB `reel_captions` | Missing `neuramark_` prefix | **`neuramark_reel_captions.selected_cta_index`** |
| Story goal “client can pick the best conversion line” | Implies Cliente variant picker; US-6.2 scope-out Cliente UI | ES product: Operator elige **variante CTA** para el paquete; Cliente **aprueba** el paquete en **Aprobación** (US-11.1) |
| USER_STORIES BE “persist on approval” | Suggests write at approval event | **Persist on Operator select**; value **flows to** Flujo de aprobación / export |
| README “A/B test dashboard” in _Evitar_ | Fine; avoid “A/B test” in UI copy | **Variantes CTA** · **selección de variante** |

No _Evitar_ role synonyms (admin, prestador, cron in UI, “approval decision”) required in technical story text if i18n uses **Aprobación**.

---

### Blocking gaps (CONTRACT must resolve)

| # | Gap | CONTRACT resolution |
|---|-----|---------------------|
| 1 | **Selection actor vs SPEC “elegir variante CTA al aprobar”** | Freeze V1: Operator selects on Caption tab; Cliente sees fixed `selectedCtaText` in US-11.1; Cliente picker out of scope unless SPEC amended |
| 2 | **Effective IG caption for approval/export/publish** | Server-only `buildEffectiveInstagramCaption` (or frozen name) + separator; US-11.3 / US-12 import; FE preview uses same helper or mirrored constants |
| 3 | **Effective length bound** (caption + CTA ≤ 2200 or explicit warn/reject policy) | Shared validation on preview DTO and export helper; frozen error/warn code |
| 4 | **NULL `selected_cta_index` gate before approval queue** | Document US-11.1 rejects package when null; US-6.2 exposes nullable DTO only |
| 5 | **Regenerate caption clears `selected_cta_index`** | US-6.1 persist UPSERT sets NULL; FE cleared copy |
| 6 | **`selectReelCaptionCta` contract** | Input schema, IDOR chain (week + slot → script → caption), bounds validation, error codes, `revalidatePath`, forbidden keys |
| 7 | **List DTO extension** | `selectedCtaIndex`, `selectedCtaText` on `reelCaptionSummarySchema`; migration `selected_cta_index` on `neuramark_reel_captions` |

**Non-blocking (document in CONTRACT):** QA CTA check reads `selectedCtaText` (US-10.1); redundant AC #1 as dependency check; i18n `scripts.caption.ctaSelect.*`; optimistic vs wait-for-server on radio select.

---

### Recommended action

1. Proceed to **SECURITY.md** then **CONTRACT.md** (extend US-6.1 contract) with the seven resolutions above frozen.
2. Amend **`plan/USER_STORIES.md` § US-6.2** (or CONTRACT override with PO signoff): fix DB table name; clarify BE = **select + persist index**, not “on approval” event; note AC #1 is satisfied by US-6.1 dependency.
3. Do **not** check off USER_STORIES acceptance criteria in this gate. Do **not** write application code.

---

### Spec alignment summary

| Checklist item | Status |
|----------------|--------|
| Vision SC-1..SC-4 | ✅ CTA selection completes caption package for review; no publish change |
| Roles (Operator select, Cliente approve package, System no auto-select) | ⚠️ Align once gap #1 frozen |
| Modalidades / playbook / trend | ✅ No change |
| Playbook vs Trend | ✅ Not conflated |
| ADR-0001/0002/0003 | ✅ No breach — export/publish seams only |
| NFR i18n, server-only, `neuramark_`, multi-tenant | ⚠️ Gap on USER_STORIES table name until CONTRACT |
| Out of scope v1 | ✅ Held (no Stories, multicanal, ads, RBAC UI, Cliente picker in 6.2) |
