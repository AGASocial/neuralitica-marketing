Reviewed by FE: yes 2026-08-29

# API Contract — US-3.4 Enforce generic avatar representation rules

**Story:** US-3.4  
**Status:** **Frozen** — 2026-08-29 (FE signoff complete)  
**Security:** `plan/stories/US-3.4/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-3.4/SPEC-REVIEW.md` (ALIGNED — V1 allowlist proxy until US-4.x per-slot Modalidad)  
**Depends on:** US-3.1 CONTRACT (frozen) — `deriveVisualPreferencesRules`, `rules` jsonb, FORBIDDEN strip, Preferencias surfaces · US-2.3 CONTRACT (frozen) — `getBusinessProfileForAgents` + `visualModeSummary` · US-14.5 — `getCurrentUser()` / `requireActive()`  
**Identity seam:** Preferencias paths: `requireActive("page"|"handler")`; agents helper: trusted `clientId` from job context only  
**Error envelope style:** unchanged from US-3.1 (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`)

**This document is CONTRACT ONLY.** Do not implement until FE signoff. Zod below is a documentation sketch for BUILD files.

**Terminology:** **Avatar genérico profesional** · **Preferencias de producción visual** · **Cliente** / **Operator** · **disclosure** (presenter is not the business owner). Technical enums `generic_avatar`, `must_disclose_not_owner` OK in code/DB only — never primary UI headlines. Do **not** use CONTEXT _Evitar_ terms in product-facing strings (esp. “impersonation” in Cliente copy).

---

## Overview

When **Avatar genérico profesional** is in the Cliente’s Preferencias allowlist, the system **must** set and persist `rules.must_disclose_not_owner = true` server-side, surface clear warning copy on Preferencias, pass a derived `mustDiscloseNotOwner` flag into the agents DTO for Script/QA consumers, export a deterministic **generic-avatar-not-owner** QA check stub classified **`blocking`**, and provide a **disclosure preview stub** for future Aprobación UI.

US-3.1 already derives `rules` on upsert. US-3.4 **hardens read/write paths**, **wires agents + QA stubs**, and **polishes FE disclosure UX** — without reopening Preferencias schema, consent ledger, or per-slot Modalidad (US-4.x).

**V1 rule trigger (allowlist proxy):** `generic_avatar` ∈ `allowed_modes` ⇒ `must_disclose_not_owner = true`; else `false`. Per-slot re-evaluation deferred to US-4.x. Agents treat DTO flag as “Cliente permits generic modality,” not “this Reel slot is generic.”

---

## Surfaces

| # | Surface | Kind | New vs reused | Frontend consumer |
|---|---------|------|---------------|-------------------|
| 1 | `/settings/preferences` page | RSC + Client form | **Reused** (US-3.1) | Preferencias UI — warning upgrade + disclosure preview stub mount |
| 2 | `getVisualPreferencesForClient` | Server helper | **Reused** — harden read-back | `/settings/preferences` RSC |
| 3 | `upsertVisualPreferences` | Server Action | **Reused** — verify derive on write | Preferencias Client form Save |
| 4 | `deriveVisualPreferencesRules` | Pure server helper | **Reused** — single source of truth | Upsert payload, read mapper, agents loader |
| 5 | `resolveVisualPreferencesRules` (name frozen) | Pure server helper | **New** — read-path authority | Loader mapper, agents loader |
| 6 | `getBusinessProfileForAgents` | Server helper | **Extend** — widen `visualModeSummary` | US-5.1 Script, US-10.1 QA (server-only) |
| 7 | `evaluateGenericAvatarNotOwnerCheck` | Server-only QA stub | **New** | US-10.1 QA agent (import); unit tests in 3.4 |
| 8 | `lib/qa/check-classes.ts` | Shared constants | **New** | US-10.1, US-10.2 override handler |
| 9 | `buildGenericDisclosurePromptHint` | Server-only string helper | **New (optional export)** | US-5.1 Script agent prompt injection |
| 10 | `GenericAvatarDisclosurePreview` | Client Component | **New** | Preferencias subsection; future US-11.1 |
| 11 | i18n `legal.genericAvatarDisclosure` | Shared copy keys | **New** | Warning, preview stub, future Aprobación |

**No new Route Handlers.** **No new Server Actions.** **No DB migration.**

**Forbidden surfaces (BUILD veto):**

- Client-writable `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` on any endpoint
- Public Route Handler returning/mutating disclosure flags by tenant id
- Full US-10.1 QA job, `neuramark_qa_reports`, US-10.2 override handler, US-11.1 approval package API
- LLM invocation inside 3.4 QA stub path
- Per-slot Modalidad UI/API (US-4.x)

---

## Server-only modules (planned BUILD)

| Module | Purpose |
|--------|---------|
| `lib/visual-preferences/helpers.ts` | Extend: `resolveVisualPreferencesRules`, drift-aware `mapVisualPreferencesRow` |
| `lib/visual-preferences/get-visual-preferences-for-client.ts` | Unchanged signature; uses hardened mapper |
| `lib/visual-preferences/upsert-visual-preferences.ts` | Verify persisted `rules` equals derivation (existing via `buildVisualPreferencesUpsertPayload`) |
| `lib/profile/get-business-profile-for-agents.ts` | Extend `loadVisualModeSummaryForAgents` → include `mustDiscloseNotOwner` |
| `lib/contracts/visual-preferences.ts` | Widen `visualModeSummarySchema` |
| `lib/contracts/qa.ts` | **New** — QA check input/output Zod + types |
| `lib/qa/check-classes.ts` | **New** — `QA_CHECK_SEVERITY`, `QaCheckSeverity` type |
| `lib/qa/checks/generic-avatar-not-owner.ts` | **New** — evaluator + `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` |
| `lib/qa/build-generic-disclosure-prompt-hint.ts` | **New** — optional US-5.1 hint string |
| `components/preferences/GenericAvatarDisclosurePreview.tsx` | **New** — read-only disclosure line |
| `components/preferences/PreferencesEditor.tsx` | **Extend** — warning severity + preview mount |
| `messages/en.json` / `messages/es.json` | **Extend** — shared legal string + preview labels |

---

## Rule derivation (single authority)

### `deriveVisualPreferencesRules` (existing — do not duplicate)

**File:** `lib/visual-preferences/helpers.ts`

```ts
export function deriveVisualPreferencesRules(
  allowedModes: readonly VisualModality[],
): VisualPreferencesRules {
  return {
    must_disclose_not_owner: allowedModes.includes("generic_avatar"),
  };
}
```

| Input | Output |
|-------|--------|
| `allowed_modes` contains `"generic_avatar"` | `{ must_disclose_not_owner: true }` |
| otherwise | `{ must_disclose_not_owner: false }` |

**Write authority:** upsert **always** persists `rules = deriveVisualPreferencesRules(allowed_modes)` via `buildVisualPreferencesUpsertPayload`. Client body never supplies `rules`.

### `resolveVisualPreferencesRules` (new — read authority)

**File:** `lib/visual-preferences/helpers.ts` (or adjacent server-only module re-exporting from helpers)

```ts
/**
 * Read-path authority for rules.must_disclose_not_owner.
 * Prefer derivation from allowed_modes; on stored drift, use derived value
 * and log anomaly — never fail open to false when generic ∈ allowlist.
 */
export function resolveVisualPreferencesRules(params: {
  allowedModes: readonly VisualModality[];
  storedRules: VisualPreferencesRules | null;
}): VisualPreferencesRules;
```

**Behavior (frozen):**

1. Compute `derived = deriveVisualPreferencesRules(allowedModes)`.
2. If `storedRules == null` or fails strict parse → return `derived` (caller may already have returned `loadFailed` for corrupt row).
3. If `storedRules.must_disclose_not_owner !== derived.must_disclose_not_owner`:
   - Log `[preferences] rules drift` with `{ clientId?: omitted, stored, derived }` (codes/static only in production).
   - Return **`derived`** (never expose `false` to UI/agents when `generic_avatar` ∈ allowlist).
4. Else return `storedRules` (equal to derived).

**Mapper integration:** `mapVisualPreferencesRow` (exists path) calls `resolveVisualPreferencesRules` and surfaces **resolved** `rules` in Cliente DTO and upsert success DTO.

**Upsert repair:** next successful save re-persists derived `rules` (already true via `buildVisualPreferencesUpsertPayload`).

---

## Strip vs reject (mutation body — extend US-3.1, never weaken)

| Keys | Behavior |
|------|----------|
| `allowedModes`, `facelessStyle`, `genericAvatarId` | Unchanged (US-3.1) |
| `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` | **Reject** → `FORBIDDEN_FIELDS` |
| Nested `rules.*` (e.g. `rules.must_disclose_not_owner` as top-level path if body ever nested) | **Reject** → `FORBIDDEN_FIELDS` / Zod `.strict()` |
| All other US-3.1 forbidden keys | Unchanged |

**Automated tests (required):** upsert body containing each forbidden key → reject, no DB write.

---

## Server helper — `getVisualPreferencesForClient` (reused)

**File:** `lib/visual-preferences/get-visual-preferences-for-client.ts`  
**Signature:** unchanged (arity 0).

**Change:** returned `rules` on exists path reflects **resolved** rules from `resolveVisualPreferencesRules`, not raw stored jsonb when drifted.

### Return shape (exists branch — unchanged schema)

```ts
{
  exists: true,
  allowedModes: VisualModality[],
  facelessStyle: FacelessStyle | null,
  genericAvatarId: null,
  rules: { must_disclose_not_owner: boolean }, // resolved
  updatedAt: string,
  ownAvatarConsentActive: boolean,
}
```

**Corrupt row:** invalid `rules` jsonb shape → `loadFailed` (existing). Invalid `allowed_modes` → `loadFailed` (existing).

---

## Server Action — `upsertVisualPreferences` (reused)

**File:** `lib/visual-preferences/upsert-visual-preferences.ts`  
**Consumer:** Preferencias Client form Save.

**Verify on BUILD:**

- Persisted `rules` in RETURNING row equals `deriveVisualPreferencesRules(allowed_modes)`.
- Success DTO `rules` uses resolved read path (should match post-write).
- Toggle `generic_avatar` on/off → integration tests prove `must_disclose_not_owner` flips.

**No signature or envelope change.**

---

## Server helper — `getBusinessProfileForAgents` (extend)

**File:** `lib/profile/get-business-profile-for-agents.ts`  
**Consumers:** US-5.1 Video Script agent, US-10.1 QA agent, future orchestration — **MUST** import this helper only for `mustDiscloseNotOwner`; never from request body or LLM JSON.

### Widen `visualModeSummary`

**Before (US-3.1):**

```ts
visualModeSummary: { allowedModes: VisualModality[] } | null
```

**After (US-3.4 — frozen):**

```ts
visualModeSummary: {
  allowedModes: VisualModality[];
  mustDiscloseNotOwner: boolean;
} | null
```

**Zod (BUILD sketch — `lib/contracts/visual-preferences.ts`):**

```ts
export const visualModeSummarySchema = z
  .object({
    allowedModes: z.array(visualModalitySchema).max(3),
    mustDiscloseNotOwner: z.boolean(),
  })
  .strict();
```

**Population rules:**

| Preferencias row | `visualModeSummary` |
|------------------|---------------------|
| Absent or soft-fail load | `null` |
| Exists | `{ allowedModes, mustDiscloseNotOwner }` where `mustDiscloseNotOwner = resolveVisualPreferencesRules({ allowedModes, storedRules }).must_disclose_not_owner` |

**SELECT:** extend agents Preferencias query to `select("allowed_modes, rules")` (or full row slice) — server-side only.

**Omit always:** consent ledger internals, raw `rules` jsonb as separate DTO field, `generic_avatar_id`, `faceless_style` (unless future story widens).

**Proxy semantics (module header comment):** `mustDiscloseNotOwner` reflects **allowlist-level** obligation until US-4.x passes per-slot modality. When US-4.x lands, per-job flag composes with this default — do not remove allowlist derivation.

---

## QA check stub — `evaluateGenericAvatarNotOwnerCheck` (new)

**File:** `lib/qa/checks/generic-avatar-not-owner.ts` (`import "server-only"`)  
**Consumers:** US-10.1 QA agent (mandatory import); unit tests in US-3.4 BUILD.

### Constants

**File:** `lib/qa/check-classes.ts`

```ts
export const QA_CHECK_SEVERITY = {
  blocking: "blocking",
  overridable: "overridable",
} as const;

export type QaCheckSeverity =
  (typeof QA_CHECK_SEVERITY)[keyof typeof QA_CHECK_SEVERITY];
```

**File:** `lib/qa/checks/generic-avatar-not-owner.ts`

```ts
export const GENERIC_AVATAR_NOT_OWNER_CHECK_KEY =
  "generic_avatar_not_owner" as const;
```

**Frozen `checkKey` string:** `generic_avatar_not_owner` — US-10.1 / US-10.2 **must** import this constant; no duplicate ad-hoc strings.

### Evaluator signature

```ts
export type GenericAvatarNotOwnerCheckInput = {
  mustDiscloseNotOwner: boolean;
  scriptText: string;
  ownerDisplayName?: string;
};

export type GenericAvatarNotOwnerCheckResult = {
  checkKey: typeof GENERIC_AVATAR_NOT_OWNER_CHECK_KEY;
  status: "pass" | "fail";
  severity: typeof QA_CHECK_SEVERITY.blocking;
  evidence?: {
    messageKey: string;
    matchedPhrase?: string;
  };
};

export function evaluateGenericAvatarNotOwnerCheck(
  input: GenericAvatarNotOwnerCheckInput,
): GenericAvatarNotOwnerCheckResult;
```

### Logic (deterministic — no LLM)

| Condition | Result |
|-----------|--------|
| `mustDiscloseNotOwner === false` | `status: "pass"` (check N/A) |
| `mustDiscloseNotOwner === true` and script contains **owner-claim** pattern (see below) **without** adjacent **disclosure pass** phrase | `status: "fail"`, `evidence.messageKey: "qa.checks.genericAvatarNotOwner.failOwnerClaim"` |
| `mustDiscloseNotOwner === true` and owner-claim present **with** disclosure pass phrase within same sentence/paragraph window (see adjacency) | `status: "pass"` |
| `mustDiscloseNotOwner === true` and no owner-claim detected | `status: "pass"` |

**Severity:** always `QA_CHECK_SEVERITY.blocking` on both pass and fail (classification is on the check, not per-result).

**Adjacency window (V1):** disclosure pass phrase must appear in the **same paragraph** (split on `\n\n`) as the owner-claim match, or within **120 characters** before/after the match (whichever is more permissive for pass — implementer chooses one rule and tests it; frozen tests below assume paragraph-level OR 120-char window documented in module header).

### Owner-claim patterns (fail triggers when disclosure absent)

Case-insensitive match. Optional `{owner}` = escaped `ownerDisplayName` when provided (trimmed, min length 2).

**English (fixed phrases + name template):**

| Pattern | Example |
|---------|---------|
| `\bI am the owner\b` | "I am the owner of this shop" |
| `\bI'm the owner\b` | "I'm the owner here" |
| `\bI am {owner}\b` | "I am Maria Lopez" when display name set |
| `\bI'm {owner}\b` | "I'm Maria Lopez" |
| `\bmy business\b` combined with first-person `\b(I'm\|I am)\b` in same sentence | "I'm Maria and this is my business" |

**Spanish (fixed phrases + name template):**

| Pattern | Example |
|---------|---------|
| `\bsoy el dueño\b` | "Soy el dueño del negocio" |
| `\bsoy la dueña\b` | "Soy la dueña" |
| `\byo soy {owner}\b` | "Yo soy Maria Lopez" |
| `\bsoy {owner}\b` | "Soy Maria Lopez" |

**Do not** match generic third-person ("the owner says…") — narrow heuristic only.

### Disclosure pass whitelist (negates fail when present near claim)

Case-insensitive substring match anywhere in script (V1 simple; adjacency rule above applies when claim detected):

| Language | Phrases |
|----------|---------|
| EN | `not the business owner`, `AI presenter`, `presenter is not`, `not the owner of this business` |
| ES | `no es el dueño`, `no es la dueña`, `presentador de IA`, `presentador no es el dueño`, `presentadora no es la dueña` |

Legal review async — does not block CONTRACT freeze.

### Zod contract (`lib/contracts/qa.ts`)

Mirror input/output types above with `.strict()` schemas for BUILD tests and US-10.1 import.

---

## Optional — `buildGenericDisclosurePromptHint` (new)

**File:** `lib/qa/build-generic-disclosure-prompt-hint.ts` (`import "server-only"`)  
**Consumer:** US-5.1 Script agent — **must** read `visualModeSummary.mustDiscloseNotOwner` from agents profile; this helper is optional convenience.

```ts
export function buildGenericDisclosurePromptHint(
  mustDiscloseNotOwner: boolean,
  locale: "en" | "es",
): string | null;
```

| Input | Output |
|-------|--------|
| `false` | `null` |
| `true`, `en` | Short EN instruction: scripts/on-screen text must disclose AI presenter is not the business owner |
| `true`, `es` | Short ES equivalent |

**Not** a substitute for reading DTO flag — documented as US-5.1 consumer obligation in module header.

---

## Frontend — Preferencias warning upgrade

**File:** `components/preferences/PreferencesEditor.tsx`  
**Consumer:** `/settings/preferences`

### Visibility (unchanged logic)

Show disclosure banner when:

- `draftModes.includes("generic_avatar")`, **or**
- `server.rules?.must_disclose_not_owner === true` (resolved server value)

### Severity (frozen)

| Condition | PrimeReact `Message` severity |
|-----------|-------------------------------|
| `draftModes.includes("generic_avatar")` | **`warn`** |
| Only persisted server rule true (generic not in current draft — edge after deselect unsaved) | **`info`** |

### Copy

- Replace `preferences.disclosureNote` body to align with shared **`legal.genericAvatarDisclosure`** canonical line (see i18n).
- EN canonical: *"This video uses an AI presenter who is not the business owner."* (warning may add context: scripts must include disclosure when generic modality is enabled).
- ES canonical: *"Este video utiliza un presentador de IA que no es el dueño del negocio."*

Render as React text nodes only — **no** `dangerouslySetInnerHTML`.

---

## Frontend — `GenericAvatarDisclosurePreview` (new)

**File:** `components/preferences/GenericAvatarDisclosurePreview.tsx`  
**Kind:** Client Component (read-only display; no mutations)

### Props (frozen)

```ts
export type GenericAvatarDisclosurePreviewProps = {
  /** When false, render nothing. */
  visible: boolean;
  /** Layout/copy variant — both use same legal line in V1. */
  variant?: "preferences" | "approval";
  /** Pre-resolved i18n strings from RSC parent (keeps component free of next-intl hook if desired). */
  line: string;
  /** Optional subtitle for preferences stub — clarifies not final Aprobación package. */
  previewNote?: string;
};
```

| Prop | Required | Detail |
|------|----------|--------|
| `visible` | yes | `true` when generic in draft or server `must_disclose_not_owner` |
| `variant` | no, default `"preferences"` | `"approval"` uses same line; future US-11.1 may style differently |
| `line` | yes | From `legal.genericAvatarDisclosure` via page loader |
| `previewNote` | no | EN: "Preview only — final disclosure appears on your approval package." / ES equivalent |

### Placement (frozen)

**Preferencias subsection** — below generic modality card / disclosure warning on `/settings/preferences`. **Not** full US-11.1 approval screen. Label must **not** imply final Operator approval gate.

**Mount condition:** same as warning visibility (`visible={draftModes.includes('generic_avatar') || server.rules?.must_disclose_not_owner}`).

---

## i18n keys (frozen)

| Key | Purpose | EN (canonical) |
|-----|---------|----------------|
| `legal.genericAvatarDisclosure` | Shared approval-line | "This video uses an AI presenter who is not the business owner." |
| `legal.genericAvatarDisclosure` | ES | "Este video utiliza un presentador de IA que no es el dueño del negocio." |
| `preferences.disclosureNote` | Preferencias warning (polish to align) | Contextual warning when generic enabled — may wrap shared legal concept |
| `preferences.disclosurePreview.note` | Preview stub subtitle | "Preview only — not your final approval package." |
| `qa.checks.genericAvatarNotOwner.failOwnerClaim` | Internal QA evidence | "Script claims owner identity without required disclosure." |

---

## Database

**No migration.** Reuse existing:

| Object | Detail |
|--------|--------|
| `neuramark_visual_preferences.rules` | jsonb `{ must_disclose_not_owner: boolean }` strict (US-3.1) |
| RLS | Deny-by-default; service-role Node only — unchanged |

**No** `neuramark_qa_reports`, approval tables, or disclosure version column in V1.

---

## Fixtures (for FE mock + unit tests)

### Preferencias loader — generic enabled

```json
{
  "exists": true,
  "allowedModes": ["generic_avatar", "faceless"],
  "facelessStyle": { "voice": "ai_voiceover", "onScreenText": "captions", "broll": "stock" },
  "genericAvatarId": null,
  "rules": { "must_disclose_not_owner": true },
  "updatedAt": "2026-08-29T18:00:00.000Z",
  "ownAvatarConsentActive": false
}
```

### Preferencias loader — drift repair (stored false, allowlist has generic)

**DB row ( corrupt / drift ):**
```json
{ "allowed_modes": ["generic_avatar"], "rules": { "must_disclose_not_owner": false } }
```

**API response (resolved):**
```json
{ "rules": { "must_disclose_not_owner": true } }
```

### Agents DTO — `visualModeSummary`

```json
{
  "visualModeSummary": {
    "allowedModes": ["generic_avatar", "faceless"],
    "mustDiscloseNotOwner": true
  }
}
```

### QA check — pass (flag false)

```json
{
  "input": { "mustDiscloseNotOwner": false, "scriptText": "I am the owner of this cafe." },
  "output": { "checkKey": "generic_avatar_not_owner", "status": "pass", "severity": "blocking" }
}
```

### QA check — fail (owner claim, no disclosure)

```json
{
  "input": {
    "mustDiscloseNotOwner": true,
    "scriptText": "Hi, I'm Maria and I am the owner of Lopez Plumbing.",
    "ownerDisplayName": "Maria Lopez"
  },
  "output": {
    "checkKey": "generic_avatar_not_owner",
    "status": "fail",
    "severity": "blocking",
    "evidence": { "messageKey": "qa.checks.genericAvatarNotOwner.failOwnerClaim" }
  }
}
```

### QA check — pass (owner claim + disclosure)

```json
{
  "input": {
    "mustDiscloseNotOwner": true,
    "scriptText": "I'm Maria Lopez welcoming you to our shop. This video uses an AI presenter who is not the business owner."
  },
  "output": { "checkKey": "generic_avatar_not_owner", "status": "pass", "severity": "blocking" }
}
```

### QA check — pass (Spanish disclosure)

```json
{
  "input": {
    "mustDiscloseNotOwner": true,
    "scriptText": "Soy el dueño del negocio... presentador de IA que no es el dueño del negocio."
  },
  "output": { "checkKey": "generic_avatar_not_owner", "status": "pass", "severity": "blocking" }
}
```

### Upsert forbidden field

```json
{
  "body": { "allowedModes": ["generic_avatar"], "mustDiscloseNotOwner": false },
  "response": {
    "ok": false,
    "error": { "code": "FORBIDDEN_FIELDS", "fields": { "mustDiscloseNotOwner": ["forbidden"] } }
  }
}
```

---

## Non-goals (BUILD veto)

- Full US-10.1 QA agent job, LLM pass, `neuramark_qa_reports`
- Full US-11.1 approval screen, approve/reject Actions
- US-10.2 override modal/handler (export `blocking` constant only)
- US-5.1 script generation (consume DTO + optional hint only)
- Per-slot Modalidad de producción (US-4.x)
- Reopen US-3.1 allowlist enum, consent gates, or client-writable `rules`
- Generic avatar catalog / non-null `generic_avatar_id`
- DB migration or one-time repair script (unless corrupt rows found in BUILD — then log-only + re-derive)

---

## Acceptance criteria mapping (for validator — do not check off here)

| AC / SEC | Contract surface |
|----------|------------------|
| Generic mode sets `must_disclose_not_owner = true` | `deriveVisualPreferencesRules` + upsert + resolved loader |
| QA agent fails owner-claim scripts when flag true | `evaluateGenericAvatarNotOwnerCheck` + fixtures |
| Approval UI shows disclosure when applicable | `GenericAvatarDisclosurePreview` stub + i18n |
| [SEC] server-side only, not client-writable | FORBIDDEN strip + derive on write |
| [SEC] blocking legal class | `QA_CHECK_SEVERITY.blocking` + `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY` |

---

## Downstream integration (consumer obligations)

| Story | Must import / use |
|-------|-------------------|
| US-5.1 | `getBusinessProfileForAgents` → `visualModeSummary.mustDiscloseNotOwner`; optional `buildGenericDisclosurePromptHint` |
| US-10.1 | `evaluateGenericAvatarNotOwnerCheck`, `GENERIC_AVATAR_NOT_OWNER_CHECK_KEY`, `QA_CHECK_SEVERITY.blocking` |
| US-10.2 | `QA_CHECK_SEVERITY.blocking` — reject override for this `checkKey` |
| US-11.1 | `legal.genericAvatarDisclosure`, `GenericAvatarDisclosurePreview` pattern |
| US-4.x | Per-slot `mustDiscloseNotOwner` composes with allowlist default — do not delete derivation |

---

## Review checklist (FE signoff)

- [x] Warning visibility + severity rules match Preferencias draft/server state
- [x] `GenericAvatarDisclosurePreview` props sufficient; placement on Preferencias acceptable
- [x] i18n keys + canonical legal line approved EN/ES
- [x] No new client write surfaces; no Supabase in Client Components
- [x] Types importable from `lib/contracts/visual-preferences.ts` and `lib/contracts/qa.ts`

**Reviewed by FE:** yes 2026-08-29
