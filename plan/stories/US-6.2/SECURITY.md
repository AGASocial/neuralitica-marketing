# Security Design Review — US-6.2

**Story:** US-6.2 — CTA variants for caption testing  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-6.2 `[SEC]`), `plan/stories/US-6.1/SECURITY.md` + `CONTRACT.md` (Operator gate, caption tenancy, plain-text rendering, forbidden-key posture, RLS), `lib/contracts/reel-caption.ts` (frozen `CTA_VARIANT_MIN`/`CTA_VARIANT_MAX`/`CTA_VARIANT_ENTRY_MAX_CHARS`, `reelCaptionRecordSchema`, `reelCaptionSummarySchema`), `lib/reel-captions/find-forbidden-keys.ts`, `lib/reel-captions/load-reel-script-for-caption-job.ts`, `lib/reel-captions/persist-reel-caption.ts`, `plan/DESIGN_PROMPTS.md` §6 (Caption tab radio-cards + preview), `plan/stories/US-11.1` (approval package consumes selected CTA — future)  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story correctly extends US-6.1: Operator picks **one index** into the **already-persisted** `cta_variants` array via an Operator-gated Server Action; the server **reloads the caption row under tenancy**, validates `selectedCtaIndex` against **`cta_variants.length` from the DB row** (0-based, integer), persists **only** `selected_cta_index` — never client-supplied CTA text — and exposes the choice in the gated read DTO for plain-text preview and downstream Approval/export (US-11.x).

No REDESIGN. No veto of PO lean defaults (Caption tab on `/operator/scripts`; radio/select among stored variants; client-side “Preview in context” as plain-text concatenation; hardcoded local user OK until auth universal). Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-6.1 / US-14.5 — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory on Operator-facing mutations; `client_id` server-resolved only; caption reads/writes via service-role Node with RLS deny-by-default on `neuramark_reel_captions`; no `@supabase/supabase-js` in Client Components; all caption/CTA strings rendered as **plain text** (never HTML); generate/regenerate actions continue to **reject** `selectedCtaIndex` / `selected_cta_index` via `findForbiddenReelCaptionKeys` — selection is a **separate** action with its own strict input schema.

**This story owns:** migration adding nullable `selected_cta_index` to `neuramark_reel_captions`; Zod input/output extensions in `lib/contracts/reel-caption.ts`; **`selectReelCaptionCta`** Server Action (CONTRACT exact name); server helper to load caption row by id or week+slot with **`client_id` filter**; UPDATE path that writes **index only**; read DTO extension on `getReelScriptsForWeek` / `reelCaptionSummarySchema`; FE radio/select + plain-text preview; security tests for operator gate, IDOR, index bounds, forbidden CTA text smuggling, regen reset, plain-text preview.

**This story does not own:** CTA variant **generation** (US-6.1 agent output); Cliente approval package assembly (US-11.1); publish/export file generation (US-11.3); Operator free-text caption or CTA edit; cost/QA/video paths.

**Terminology:** **CTA variant** · **selected CTA index** · **Preview in context** · **Operator** · **Paquete de caption**. Technical names `selectReelCaptionCta`, `loadReelCaptionForClient`, `requireOperator`, `CTA_VARIANT_MIN`/`CTA_VARIANT_MAX` are canonical.

---

### Threat Summary (US-6.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Non-operator persists CTA selection** | Cliente alters approval-bound copy | `selectReelCaptionCta` calls `requireOperator("handler")` as **first** await; failure → 401/403, **no UPDATE** |
| **IDOR via `captionId` or week/slot for another tenant** | Cross-client CTA selection or read | Load caption with **`WHERE client_id = $serverResolvedClientId`** (+ script/strategy chain if week+slot pointer); foreign/missing → **404** uniform |
| **Index out of bounds (`selectedCtaIndex` ≥ length or negative)** | Array OOB read, wrong CTA in approval/export | After row load, validate **`0 <= selectedCtaIndex < cta_variants.length`** using **DB-stored array length**; else **`CTA_INDEX_OUT_OF_BOUNDS`** / **422**, **no UPDATE** |
| **Client sends arbitrary CTA text instead of index** | Smuggle off-brand or XSS payload into “selected CTA” | Input schema accepts **`selectedCtaIndex` integer only** — no `cta`, `ctaText`, `ctaVariants`, `selectedCtaText`. Resolved CTA string is **never** taken from request; only `cta_variants[selectedCtaIndex]` from loaded row |
| **Client sends `ctaVariants` array to replace stored variants** | Bypass agent validation | Forbidden on select action (same family as US-6.1); **`FORBIDDEN_FIELDS`** |
| **Client sends `captionId` + smuggled `client_id`** | Tenancy bypass | `client_id` **server-resolved only**; forbidden on request |
| **Preview XSS via selected CTA or caption** | Operator browser compromise | Preview renders **plain text** only — React text nodes / `<pre>` with escaped content; **no** `dangerouslySetInnerHTML`, markdown, or `innerHTML` on preview |
| **Stale index after caption regenerate** | Wrong CTA shown in preview/approval | US-6.1 regenerate UPSERT **clears `selected_cta_index` to NULL** when `cta_variants` replaced; Operator must re-select |
| **Selection before caption generated** | Write to non-existent or empty variants | Select action requires existing caption row with **`cta_variants.length >= CTA_VARIANT_MIN` (2)**; else **`CAPTION_PENDING`** / **422** |
| **Approval/export trusts client-supplied CTA string** | Future US-11 bypass | Export/approval serializers (US-11 BUILD) must resolve selected CTA **server-side** from `selected_cta_index` + stored `cta_variants` — document seam in CONTRACT; US-6.2 provides persisted index + helper |

**Residual risk accepted:** Operator trust model — Operator selects among agent-generated variants for server-resolved client (V1: self). Semantic review of variant text is human/QA (US-10.x), not security sanitization beyond plain-text storage from US-6.1. Preview length (caption + CTA) is display-only — Instagram posting limits enforced at publish time, not in preview.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_reel_captions.cta_variants` | Medium — conversion copy | Written only by US-6.1 agent UPSERT; **read-only** on select path |
| `neuramark_reel_captions.selected_cta_index` | Medium — approval/export authority | Written only by **`selectReelCaptionCta`** after bounds check |
| `selectedCtaIndex` in action input | Medium — array pointer, not content | Must validate against **loaded** `cta_variants.length` |
| Operator session | High — can fix approval-bound CTA choice | `requireOperator()` on select + existing caption read |
| Preview concatenation (FE) | Low — display of already-gated DTO | Untrusted only insofar as DTO came from gated read; render plain text |

**Boundaries:**

1. **Browser (Operator) → `selectReelCaptionCta`** — Untrusted. Sends row pointer (`captionId` **or** `{ weekStart, slotIndex }` — CONTRACT picks one lean shape) + **`selectedCtaIndex`**. No CTA text, no `cta_variants`, no `client_id`.
2. **Server Action → `requireOperator()` → load caption row** — Tenancy filter **before** index validation and UPDATE.
3. **Server → Postgres** — Parameterized UPDATE **`selected_cta_index` only**; never merge client CTA strings into `cta_variants` or `caption`.
4. **Operator read path** — Extended `reelCaptionSummary` includes `selectedCtaIndex` + optional server-computed `selectedCtaText` (derived, not client-writable).
5. **Preview (FE)** — Concatenates DTO plain-text fields locally; no new public endpoint for preview HTML.

---

## Abuse Cases Considered

- *As a Cliente, I can POST `{ captionId, selectedCtaIndex: 0 }` and set the approval CTA* → **Blocked:** `requireOperator("handler")` first; 403, no UPDATE.
- *As a malicious actor, I can POST `{ captionId: "<victim-uuid>", selectedCtaIndex: 0 }`* → **Blocked:** SELECT includes server-resolved `client_id`; foreign caption → **404**.
- *As a malicious actor, I can POST `{ selectedCtaIndex: 99 }` when only 3 variants exist* → **Blocked:** validate against loaded `cta_variants.length`; **`CTA_INDEX_OUT_OF_BOUNDS`**, no UPDATE.
- *As a malicious actor, I can POST `{ selectedCtaIndex: -1 }` or `{ selectedCtaIndex: 1.5 }`* → **Blocked:** Zod `z.number().int().min(0)`; failure → **`VALIDATION_ERROR`**.
- *As a malicious actor, I can POST `{ selectedCtaText: "Click here!!!", selectedCtaIndex: 0 }`* → **Blocked:** forbidden key → **`FORBIDDEN_FIELDS`**; text field ignored/rejected.
- *As a malicious actor, I can POST `{ ctaVariants: ["evil"], selectedCtaIndex: 0 }` to replace variants and select index 0* → **Blocked:** `ctaVariants` forbidden on select action; stored array unchanged.
- *As a malicious actor, I can POST `{ caption: "...", selectedCtaIndex: 0 }` to rewrite caption while selecting* → **Blocked:** `caption` forbidden → **`FORBIDDEN_FIELDS`**.
- *As a malicious actor, I inject `<script>` via preview by selecting a variant that contains HTML* → **Contained:** US-6.1 plain-text guard prevents HTML in stored variants; FE renders preview as plain text only.
- *As a malicious actor, I keep `selected_cta_index: 2` after regenerate replaces variants with 2 items (indices 0–1)* → **Blocked:** regenerate UPSERT sets **`selected_cta_index = NULL`**; stale index cannot survive regen.
- *As a malicious actor, I read another client's selected index via script list* → **Blocked:** existing `getReelScriptsForWeek` → `requireOperator` + `client_id` scope.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-6.2 are binding. Items marked **(added)** are new in this review — paste into the story when the PO next edits USER_STORIES.

**Inherited (still binding — do not weaken US-6.1 caption paths):**

- [ ] **[SEC] Every operator-only gate lives inside the Server Action / Route Handler itself** as `requireOperator()` on the `getCurrentUser()` result; middleware and UI hiding are convenience only *(US-14.5)*
- [ ] **[SEC] `requireOperator()` runs `requireActive()` first** — inactive operator has no access *(US-14.5)*
- [ ] **[SEC] RLS stays enabled with zero policies** on `neuramark_reel_captions`; privileged access via Node service-role only *(US-6.1)*
- [ ] **[SEC] Service-role key is used only from Node server modules** — never Client Components *(US-14.5)*
- [ ] **[SEC] Caption/CTA variant strings remain plain text** — stored and rendered without HTML *(US-6.1)*

**US-6.2 story `[SEC]` (existing in USER_STORIES.md):**

- [ ] **[SEC] `selected_cta_index` is validated server-side to be within the stored variants array bounds; free-text CTA substitution via this field is not possible** *(USER_STORIES US-6.2)*

**Added in this review (binding for US-6.2 BUILD):**

- [ ] **[SEC] (added) `selectReelCaptionCta` Server Action** calls `requireOperator("handler")` as its **first** await before validation, caption load, or UPDATE; failure → 401/403, **no side effects**
- [ ] **[SEC] (added) Select-action input schema (lean — CONTRACT freezes exact pointer):** `.strict()` object with **`selectedCtaIndex: z.number().int().min(0)`** plus **one** row pointer: either **`captionId: z.string().uuid()`** **or** **`{ weekStart, slotIndex }`** (same `slotIndex` bounds as US-6.1). **No** `clientId`, `client_id`, `cta`, `ctaText`, `selectedCtaText`, `caption`, `hashtags`, `keywords`, `ctaVariants`, `cta_variants`, `provider_key`, `status`, `approved`, or script text fields — presence → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) US-6.1 generate/regenerate actions unchanged:** `findForbiddenReelCaptionKeys` continues to list `selectedCtaIndex` / `selected_cta_index` as **forbidden** on generate/regenerate — selection is **only** via `selectReelCaptionCta`
- [ ] **[SEC] (added) Caption row load — caller-independent, tenancy-scoped:** server helper **`loadReelCaptionForClient({ captionId?, weekStart?, slotIndex?, clientId })`** SELECTs `neuramark_reel_captions` with **`client_id = $serverResolvedClientId`**; week+slot path resolves script → caption via approved strategy chain (same tenancy as US-6.1 reads). Missing/forbidden → **404** uniform — **never** leak cross-tenant existence
- [ ] **[SEC] (added) Index bounds validation uses DB authority:** after load, parse `cta_variants` with existing `reelCaptionCtaVariantSchema` array (**min `CTA_VARIANT_MIN` (2)**, max **`CTA_VARIANT_MAX` (4)**). Reject select if caption pending or variants invalid. Accept UPDATE only if **`selectedCtaIndex < ctaVariants.length`**; else **`CTA_INDEX_OUT_OF_BOUNDS`** (422), **no UPDATE**
- [ ] **[SEC] (added) UPDATE writes index column only:** `UPDATE neuramark_reel_captions SET selected_cta_index = $index WHERE id = $id AND client_id = $clientId` — **never** UPDATE `cta_variants`, `caption`, or other content columns from this action
- [ ] **[SEC] (added) No free-text CTA path:** resolved display/export string is **`cta_variants[selected_cta_index]`** from loaded row only; request never carries CTA body; no “custom CTA” fallback in V1
- [ ] **[SEC] (added) Regenerate clears selection:** `persistReelCaption` / regenerate UPSERT sets **`selected_cta_index = NULL`** whenever `cta_variants` (and caption package) is replaced — prevents stale index after regen
- [ ] **[SEC] (added) Read DTO extension:** `reelCaptionSummarySchema` includes **`selectedCtaIndex: z.number().int().min(0).nullable()`** and optional read-only **`selectedCtaText: plainTextNoHtmlSchema.nullable()`** computed server-side from index + variants (null when index null); FE must not compute authoritative CTA for export — server helper **`resolveSelectedCtaVariant(record, selectedCtaIndex)`** for US-11 seam
- [ ] **[SEC] (added) Preview in context — plain text only:** FE preview appends selected variant to caption using **string concatenation in plain-text UI** (e.g. `<p>` / `<span>` children or `<pre>`); **no** `dangerouslySetInnerHTML`, markdown renderer, or HTML interpolation on caption/CTA preview
- [ ] **[SEC] (added) Migration:** `selected_cta_index integer NULL`; optional DB CHECK `(selected_cta_index IS NULL OR selected_cta_index >= 0)`; **no** RLS policy additions; app-layer bounds check against `cta_variants` length is **mandatory** (DB cannot express jsonb array length without trigger — app validation is minimum bar)
- [ ] **[SEC] (added) IDOR-safe reads unchanged:** caption enrichment on `getReelScriptsForWeek` stays behind **`requireOperator("handler")`**; selected index visible only in Operator workspace until US-11 Cliente package
- [ ] **[SEC] (added) Logging:** log `captionId`, `reelScriptId`, `clientId`, `selectedCtaIndex`, action, error **codes** only — never full caption/variant bodies in prod logs
- [ ] **[SEC] (added) Automated security tests cover at least:** non-operator select → 403 no UPDATE; foreign `captionId` / week+slot → 404; `selectedCtaIndex` out of bounds → `CTA_INDEX_OUT_OF_BOUNDS`; negative/non-integer index → `VALIDATION_ERROR`; smuggled `ctaVariants` / `selectedCtaText` / `caption` → `FORBIDDEN_FIELDS`; successful select persists index only; regenerate clears `selected_cta_index`; preview path has no `dangerouslySetInnerHTML` on caption/CTA (grep/regression)

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Dedicated select action — not bundled with generate/regen (APPROVE)

| Surface | Gate / rule |
|---|---|
| `selectReelCaptionCta` Server Action | `requireOperator("handler")` **first** |
| `generateReelCaptions` / `regenerateReelCaptionSlot` | Unchanged — **`selectedCtaIndex` forbidden** |
| Cliente select / approval mutation | **Out of US-6.2 BUILD** |

#### 2. Input shape — index + pointer only (APPROVE WITH CONDITIONS)

**Lean V1 (CONTRACT picks one pointer style):**

```ts
// Option A — caption id from read DTO
{ captionId: string; selectedCtaIndex: number }

// Option B — week workspace consistency
{ weekStart: string; slotIndex: number; selectedCtaIndex: number }
```

Both require server reload + `client_id` filter. **Condition:** CONTRACT must not accept **both** pointer styles in one schema without disambiguation rules.

#### 3. Bounds validation algorithm (APPROVE — binding)

```ts
// After loadReelCaptionForClient succeeds:
const variants = row.ctaVariants; // validated jsonb, length 2..4
if (selectedCtaIndex >= variants.length) {
  return { ok: false, error: { code: "CTA_INDEX_OUT_OF_BOUNDS" } };
}
// Persist selected_cta_index = selectedCtaIndex
// Never persist variants[index] as a separate client-writable column
```

| Rule | Detail |
|---|---|
| Index base | **0-based**, matches radio `value={index}` |
| Upper bound | **`length - 1`** from **loaded** array, not `CTA_VARIANT_MAX` alone |
| Type | Integer only — reject floats, strings, null on select (null = clear is **out of V1** unless PO adds explicit deselect AC) |

#### 4. Regenerate interaction (APPROVE)

| Event | Effect on `selected_cta_index` |
|---|---|
| `regenerateReelCaptionSlot` UPSERT | **`NULL`** (Operator re-selects) |
| `selectReelCaptionCta` success | Set to validated index |
| US-6.1 batch regen | Same per affected row |

Extend `persistReelCaption` / UPSERT row builder to include `selected_cta_index: null` on content replace.

#### 5. Preview UX — plain text (APPROVE)

| Rule | Detail |
|---|---|
| Data source | Gated read DTO: `record.caption`, `record.ctaVariants`, `selectedCtaIndex` |
| Render | Plain text block showing caption + separator + selected variant |
| Forbidden | HTML rendering, markdown, link auto-detection that injects HTML |

#### 6. Approval / export seam (APPROVE WITH CONDITIONS)

US-6.2 persists index; US-11.1 approval package must **not** accept client CTA text. CONTRACT documents:

```ts
function resolveSelectedCtaVariant(
  record: ReelCaptionRecord,
  selectedCtaIndex: number | null,
): string | null
```

**Condition:** US-11 BUILD must use this helper — flag in US-6.2 CONTRACT as downstream requirement, not US-6.2 implementation.

#### 7. PO wording — “persist on approval” (CLARIFY)

`USER_STORIES.md` BE row says “persist `selected_cta_index` on approval”. **Security interpretation:** persist when **Operator selects** a variant (immediate Server Action), so the choice is available to **Approval Flow** (US-11) and export — **not** deferred until Cliente approves. If PO intended persistence only at US-11 gate, that would leave US-6.2 FE without a saved selection — **reject that design**; selection must persist on Operator action.

---

## Future-Proofing Notes

- **US-11.1 approval package** reads `selected_cta_index` + `cta_variants` server-side; Cliente never posts CTA index on approve — package is read-only preview.
- **US-11.3 export/download** includes resolved selected CTA text from server helper, not FE preview string.
- **Real auth / multi-client Operator:** `client_id` from server context; select action unchanged.
- **Optional “clear selection”:** if added later, use explicit `selectedCtaIndex: null` with separate schema branch — do not overload invalid index as clear.
- **CTA variant count drift:** if US-6.1 bounds change, index validation always uses **per-row** `cta_variants.length`.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-6.2/CONTRACT.md` exists, spot-check before BUILD:

- [ ] `selectReelCaptionCta` frozen; starts with `requireOperator("handler")`
- [ ] Input `.strict()` — pointer + `selectedCtaIndex` only; separate forbidden-key list from generate/regen
- [ ] `loadReelCaptionForClient` with `client_id` filter; IDOR → 404
- [ ] Bounds check against loaded `cta_variants.length`; error code `CTA_INDEX_OUT_OF_BOUNDS`
- [ ] UPDATE column whitelist: **`selected_cta_index` only**
- [ ] Migration `selected_cta_index integer NULL`
- [ ] Regenerate UPSERT clears `selected_cta_index`
- [ ] `reelCaptionSummarySchema` + list DTO extensions; optional `selectedCtaText` server-computed
- [ ] `resolveSelectedCtaVariant` helper exported for US-11
- [ ] FE preview plain-text contract; radio binds to integer index
- [ ] Generate/regenerate still reject `selectedCtaIndex` via `findForbiddenReelCaptionKeys`
- [ ] Tests listed in `[SEC]` above

---

## CONTRACT freeze list (binding `[SEC]` summary)

Paste into CONTRACT **Security** section — do not reopen without security-architect review.

1. **Gate:** `requireOperator("handler")` **first** on **`selectReelCaptionCta`**; 401/403, no UPDATE on failure.
2. **Input:** `.strict()` — **`selectedCtaIndex`** (int ≥ 0) + row pointer only; **no** CTA/caption text or `cta_variants` — **`FORBIDDEN_FIELDS`**.
3. **Generate/regen unchanged:** `selectedCtaIndex` remains **forbidden** on US-6.1 mutation schemas.
4. **Tenancy:** `client_id` **server-resolved only**; caption load **always** filters by tenancy; IDOR → **404**.
5. **Bounds:** validate **`0 <= selectedCtaIndex < cta_variants.length`** against **DB-loaded** array; else **`CTA_INDEX_OUT_OF_BOUNDS`**, no UPDATE.
6. **No free-text CTA:** resolved CTA string comes **only** from stored `cta_variants[index]`; never from request body.
7. **UPDATE scope:** **`selected_cta_index` column only** on select action.
8. **Regen reset:** caption regenerate sets **`selected_cta_index = NULL`**.
9. **Preview:** plain text only — no HTML rendering on caption/CTA preview.
10. **Read DTO:** expose `selectedCtaIndex` (+ optional server `selectedCtaText`); Operator-gated read path only in US-6.2 BUILD.
11. **Downstream:** US-11 uses **`resolveSelectedCtaVariant`** — no client-supplied CTA in approval/export.
12. **RLS:** no new policies on `neuramark_reel_captions`.
13. **Tests:** operator gate, IDOR, OOB index, forbidden text smuggling, regen clear, plain-text preview.

---

## BUILD vetoes (summary)

1. **Select without `requireOperator()`** on Operator-facing action.
2. **Accepting CTA text, `ctaVariants`, or caption fields** on the select action.
3. **Persisting `selected_cta_index` without reloading caption row** and validating against **stored** `cta_variants.length`.
4. **Trusting client-supplied variant count or CTA string** for display/export.
5. **UPDATE of `cta_variants` or `caption`** from select action.
6. **SELECT/UPDATE by `captionId` without `client_id` filter.**
7. **Allowing generate/regenerate to accept `selectedCtaIndex`** (must stay forbidden there).
8. **Regenerate that leaves stale `selected_cta_index`** after variants change.
9. **Preview rendered as HTML** (`dangerouslySetInnerHTML`, markdown on CTA/caption).
10. **Adding RLS policies** granting `authenticated` access to caption rows.
11. **Public Route Handler for CTA select** without operator gate.

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Pointer: `captionId` vs `weekStart`+`slotIndex`? | **Either** acceptable if tenancy reload is mandatory. **Lean:** `captionId` from gated read DTO (simplest). **Alternative:** week+slot for consistency with regen. CONTRACT picks one; security bar identical. |
| 2 | Persist on Operator select vs Client approve? | **Operator select** — immediate persist via `selectReelCaptionCta`. Approval Flow **reads** persisted index (US-11). |
| 3 | Allow deselect / null index? | **Out of V1** unless PO adds AC. Select requires valid index; regen clears to NULL. |
| 4 | Expose all variants to Cliente in US-6.2? | **No** — Operator workspace only. Cliente sees **selected** CTA in US-11 package, not variant picker. |
| 5 | `CTA_VARIANT_MAX` 4 vs 5? | **Follow frozen contract:** `CTA_VARIANT_MAX = 4` in `lib/contracts/reel-caption.ts`; bounds use **per-row length**, not constant alone. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff after CONTRACT (Caption tab: radio/select bound to integer index; preview plain text; calls `selectReelCaptionCta` with pointer + index only — no CTA text in request).
