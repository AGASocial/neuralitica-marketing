## Spec Review — US-3.4

### Verdict: ALIGNED

US-3.4 (System **reglas de representación para Avatar genérico profesional**: server-owned `must_disclose_not_owner` hardened on read/write paths; stronger Preferencias warning + disclosure copy EN/ES; widen agents DTO with `mustDiscloseNotOwner`; export deterministic **generic-avatar-not-owner** QA check stub classified `blocking` for US-10.1; disclosure preview stub for future Aprobación package; no full QA agent / no full approval screen / no per-slot Modalidad assignment) matches SPEC §3 Avatar / Visual Mode Selector (**S3.M4**), SPEC §3 Video Script Agent (**S3.M6** `must_disclose_not_owner`), SPEC §3 QA/Compliance Agent (**S3.M11** blocking vs overridable), SPEC §1 hard rule *sin impersonación genérica*, SPEC §2 System responsibilities, SPEC §6 NFRs, CONTEXT **Avatar genérico profesional** / **Preferencias de producción visual** / **disclosure**, SECURITY_BASELINE §7 (non-overridable legal class), and PLAN Fase 1 (Preferencias + disclosure continuity after US-3.1 CLOSED).

PO PREP correctly **hardens and wires** the US-3.1 server stub (`deriveVisualPreferencesRules`, `rules` jsonb, FORBIDDEN client keys, Preferencias `disclosureNote`) without reopening allowlist schema, consent ledger (US-3.2), or reference uploads (US-3.3). Sibling full modules US-10.1 (QA agent), US-10.2 (override handler), US-11.1 (Aprobación package), US-5.1 (script generation), and US-4.x (Modalidad por slot) stay out with explicit stub/export boundaries. No ADR breach (no cron, no IG publish, no FFmpeg/Fly). No SC-2 / publish path; no V1 out-of-scope creep (Stories IG, multicanal, ads, RBAC UI).

**No SPEC amendment required** before SECURITY / CONTRACT. Verdict is **ALIGNED** (not GAPS / CONFLICT). One **tracked gap** (non-blocking): SPEC S3.M4 sets `must_disclose_not_owner` when the **slot uses genérico**; V1 derives when **`generic_avatar` ∈ allowlist** — acceptable phased proxy until US-4.x per-slot assignment; agents must treat DTO flag as “Cliente permits generic modality,” not “this Reel slot is generic.”

---

### Scope split vs S3.M4 / siblings — confirm

| Concern | PO scope (US-3.4) | SPEC mapping | Verdict |
|---------|-------------------|--------------|---------|
| `must_disclose_not_owner` persist | Harden server derive + read-back; no client write | S3.M4 System; §1 sin impersonación genérica | **ALIGNED** |
| Cliente sees disclosure | Stronger Preferencias warning EN/ES; preview stub | S3.M4: ver disclosure de genérico | **ALIGNED** |
| Agents consume flag | Widen `visualModeSummary.mustDiscloseNotOwner` | S3.M6 script agent; SECURITY_BASELINE §8 server-injected flags | **ALIGNED** |
| QA impersonation check | Export deterministic check + `blocking` class stub | S3.M11; USER_STORIES [SEC]; US-10.1 import | **ALIGNED** (stub OK — same phased pattern as US-3.1 rules stub) |
| Approval disclosure line | Preview component + i18n; not full package | US-11.1; S3.M11 gate to Aprobación | **ALIGNED** (stub OK) |
| Per-slot trigger | **Out** — allowlist-level V1 proxy | S3.M4 regla clave + Modalidad por slot | **GAP tracked** (proxy OK for 3.4; US-4.x owns slot flag) |
| Full QA agent / reports | **Out** | S3.M11 `neuramark_qa_reports` | **ALIGNED** (out) |
| Full Aprobación UI | **Out** | US-11.1 | **ALIGNED** (out) |
| US-10.2 override handler | **Out** — document `blocking` constant only | S3.M11 no override legal | **ALIGNED** (out) |
| DB | No new table; `neuramark_visual_preferences.rules` | S3.M4; US-3.1 | **ALIGNED** |
| Consent / assets | Unchanged | US-3.2 / US-3.3 | **ALIGNED** (out) |

Do not amend SPEC. Do not check off USER_STORIES AC here.

---

### Open questions (TASKS.md) — SPEC resolution

| # | Question | Spec-guardian | Blocks SECURITY? |
|---|----------|---------------|------------------|
| 1 | **Allowlist vs per-slot trigger** | **Resolved ALIGNED with PO lean (V1 proxy).** SPEC canonical trigger = slot uses **Avatar genérico profesional** (US-4.x). Until slot assignment exists, derive `must_disclose_not_owner` when `generic_avatar` ∈ allowlist (US-3.1 behavior). CONTRACT must document proxy semantics for agents/QA; US-4.x later passes per-job/slot flag without reopening Preferencias schema. Optional parent USER_STORIES V1-proxy note = backlog hygiene, not SPEC amendment. | **No** |
| 2 | **Agents DTO field shape** | **Not a SPEC block.** Flat `visualModeSummary.mustDiscloseNotOwner` vs nested `rules` = CONTRACT ergonomics; must mirror persisted server truth. | **No** |
| 3 | **QA stub vs LLM** | **Resolved ALIGNED.** Deterministic phrase heuristics in 3.4; full LLM QA layer = US-10.1 importing same `checkKey` + `blocking` class. | **No** |
| 4 | **Owner-claim heuristics** | **Not a SPEC block.** Minimal EN/ES phrase list + optional profile display-name match = CONTRACT + SECURITY freeze with fixtures. | **No** (SECURITY confirms patterns) |
| 5 | **Disclosure “pass” phrases** | **Not a SPEC block.** Whitelist for stub pass/fail = CONTRACT + async legal review; static i18n V1 OK per PO lean. | **No** |
| 6 | **Preview placement** | **Not a SPEC block.** PO lean Preferencias subsection satisfies S3.M4 “ver disclosure de genérico”; approval-route mount = US-11.1. CONTRACT freezes placement so stub is not mistaken for final Aprobación UI. | **No** |
| 7 | **Warning severity info vs warn** | **Not a SPEC block.** `warn` when generic selected aligns with legal/trust signal; CONTRACT + FE. | **No** |
| 8 | **Corrupt `rules` row** | **Resolved ALIGNED with PO lean.** Re-derive on read for display + next upsert repair; fail closed on unrecoverable parse (`loadFailed` pattern from US-3.1). | **No** (SECURITY confirms) |
| 9 | **i18n key structure** | **Not a SPEC block.** Shared `legal.genericAvatarDisclosure` consumed by Preferencias + preview + future US-11.1 = CONTRACT. | **No** |
| 10 | **QA export surface** | **Not a SPEC block.** Function + constants now; registry catalog = US-10.1. | **No** |
| 11 | **Script prompt helper in 3.4** | **Not a SPEC block.** Optional `buildGenericDisclosurePromptHint` export for US-5.1 = CONTRACT; no script generation in 3.4. | **No** |
| 12 | **`check-classes` module location** | **Not a SPEC block.** Shared `lib/qa/check-classes.ts` for US-10.2 continuity = CONTRACT. | **No** |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-1 / trust (Cliente not misled that generic presenter is the owner) and S3.M4 disclosure visibility. Does not touch Publicación IG, Ciclo semanal cron, Playbook, Trend, or full QA/Aprobación gates. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; S3.M4; hard rules | None. Do not add IG, Stories, ads, full QA reports, or approval decision flows. |
| Info | **Carry-forward from US-3.1 CLOSED is correct:** `deriveVisualPreferencesRules`, upsert persistence, FORBIDDEN `rules` keys, Preferencias loader surfaces `rules`, basic `disclosureNote`. US-3.4 must **extend**, not duplicate or weaken. | US-3.1 SPEC-REVIEW; S3.M4 + US-3.4 sibling split | CONTRACT: single derivation source; tests for toggle + forbidden fields. |
| Info | Roles unchanged: **System** derives/persists flag and exports QA stub; **Cliente** sees Preferencias disclosure copy; **Operator** not required for this story (approval preview is stub only). Identity via `getCurrentUser()` / `requireActive`. | SPEC §2; §3 S3.M4 | CONTRACT: agents helper accepts trusted `clientId` from job context only; no browser `client_id`. |
| Info | **Preferencias vs Modalidad de producción** cut preserved. Allowlist-level rule is V1 proxy; per-slot re-evaluation deferred to US-4.x — do not implement slot modality UI/API here. | S3.M4 regla clave; CONTEXT Modalidad de producción | CONTRACT non-goals; document proxy in agents DTO comments. |
| Info | Phased AC interpretation matches sibling pattern (US-3.1 rules stub, US-3.2 job stubs, US-3.3 production helper): USER_STORIES “QA agent fails…” = **check function + unit fixtures** in 3.4; live QA job = US-10.1. “Approval UI shows disclosure…” = **preview stub + i18n** in 3.4; full package = US-11.1. | USER_STORIES US-3.4; S3.M11; US-10.1 / US-11.1 | VALIDATION must not mark full US-10.1 / US-11.1 AC done from 3.4 BUILD alone. |
| Info | `[SEC]` items align: server-side consequence of modality selection; not client-writable; `blocking` class same family as missing Consentimiento (US-10.2). | USER_STORIES [SEC]; SECURITY_BASELINE §7 | SECURITY gate owns exact constant module + bypass tests. |
| Info | NFR / stack: Next.js App Router; i18n EN+ES; `neuramark_*`; multi-tenant `client_id` server-only; rule flags server-injected (SECURITY_BASELINE §8); not ADR-0003 long work. | SPEC §5–§6 | No auth redesign; no browser Supabase; disclosure rendered as plain text. |
| Info | ADRs 0001–0003 untouched. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: full US-10.1 QA agent; US-10.2 override handler; US-11.1 approval package; US-5.1 script generation; per-slot modality; generic avatar catalog; US-3.1 schema reopen; RBAC; Stories IG; multicanal; ads. | SPEC §1 Fuera; S3.M4 siblings | Implementers must not expand stubs into sibling modules. |
| Low | **Tracked gap (non-blocking):** SPEC S3.M4 canonical rule is slot-level generic use; V1 uses allowlist membership proxy. Over-broad flag possible if Cliente allows generic but a given week’s slots are all faceless — acceptable until US-4.x; agents/QA consumers must not treat flag as slot assignment. | S3.M4 System line; regla clave | CONTRACT documents proxy; US-4.x passes per-slot `mustDiscloseNotOwner` into jobs without deleting Preferencias-level default. |
| Low | Parent USER_STORIES FE “disclosure preview on approval screen” vs PO lean Preferencias subsection — **SPEC-aligned** because S3.M4 Cliente action is “ver disclosure de genérico” on Preferencias path; approval-line disclosure remains US-11.1. | S3.M4 Cliente actions; US-11.1 | CONTRACT freezes stub placement; optional parent wording sync later. |
| Low | Parent USER_STORIES DB shorthand `visual_preferences.rules JSON` → physical **`neuramark_visual_preferences.rules` jsonb** (US-3.1). | SPEC §1 prefix; US-3.1 | CONTRACT uses canonical table/column names. |
| Low | Existing `disclosureNote` i18n uses “not you” framing; PREP proposes canonical approval-line copy (“AI presenter who is not the business owner”). **Align** Preferencias warning + preview + future US-11.1 via shared legal string — avoids CONTEXT _Evitar_ “impersonation” in Cliente copy. | CONTEXT Avatar genérico; TASKS Q9 | CONTRACT: shared `legal.genericAvatarDisclosure` keys; polish existing `disclosureNote` for consistency. |
| Low | USER_STORIES [SEC] references US-10.1 for classification — 3.4 ships **stub constant + export**; US-10.2 enforces 403 on override. Same phased enforcement pattern as consent blocking class pre–US-10.2. | USER_STORIES US-3.4 [SEC]; US-10.2 | SECURITY: require exported `blocking` class; document US-10.2 mandatory import. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-3.4/README.md` or `TASKS.md`. Canonical use is correct: **Avatar genérico profesional**, **Preferencias de producción visual**, **Cliente**, **Operator**, **disclosure**. PREP correctly scopes _Evitar_ terms and limits “impersonation” to technical/QA contexts.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY product strings:**

| Prefer | _Evitar_ |
|--------|----------|
| **Avatar genérico profesional** | generic_avatar (in product copy) |
| **Preferencias de producción visual** | avatar mode, visual preferences (as entity name), visual mode selector |
| **disclosure** (presenter is not the owner) | impersonation (in Cliente-facing copy) |
| **Cliente** | prestador (as product role), dueño, usuario final, Client (parent shorthand) |
| **Operator** | admin, administrador, staff |
| **Ficha viva** | Business Profile, perfil de negocio |
| **Aprobación** | approval (as primary product noun in ES UI) |

Hard rule (product + UX): generic presenter must **never** be presented to local customers as the business owner; copy must state presenter is **not** the owner (CONTEXT **Avatar genérico profesional**).

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. **SECURITY can proceed.**

| Item | Blocks? | Guidance |
|------|---------|----------|
| Allowlist vs per-slot trigger | **Tracked gap, not block** | V1 proxy ALIGNED; CONTRACT documents semantics; US-4.x owns slot-level flag. |
| US-3.1 carry-forward | **Resolved for SPEC** | Extend derivation/tests/DTO; do not reopen schema or client-writable surface. |
| QA check stub vs full agent | **Resolved for SPEC** (stub OK) | SECURITY: export check + `blocking` class + fixtures; US-10.1 mandatory import. |
| Approval preview vs full UI | **Resolved for SPEC** (stub OK) | Preferencias disclosure satisfies S3.M4 Cliente view; US-11.1 owns package line. |
| Phrase heuristics / pass whitelist | **No SPEC block** | SECURITY/CONTRACT freeze minimal EN/ES sets + fixtures. |
| Corrupt `rules` handling | **No SPEC block** | SECURITY: re-derive-on-read vs fail-closed policy. |
| Preview placement | **No SPEC block** | CONTRACT: Preferencias subsection (PO lean); label as preview, not final Aprobación. |
| i18n consolidation | **No SPEC block** | CONTRACT: shared legal string keys EN+ES. |
| User / product decision needed? | **No for SPEC** | Per-slot precision deferred to US-4.x scheduling, not a user blocker for 3.4 SECURITY/CONTRACT. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

**SPEC amendments needed?** **No.**

**Defaults aligned?** Yes — PO leans in TASKS.md (harden US-3.1 rules, allowlist-level V1 proxy, agents DTO widen, deterministic QA stub + `blocking` class, disclosure preview stub, no migration, no full US-10.1/US-11.1, shared legal i18n, corrupt-row re-derive) are **ALIGNED** with SPEC S3.M4 / S3.M6 / S3.M11 / CONTEXT / SECURITY_BASELINE §7–§8 / US-3.1 continuity. No CONFLICT. One **tracked gap**: per-slot trigger precision lands in US-4.x.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. **Rule derivation:** single server function (`deriveVisualPreferencesRules` or successor); V1 trigger = `generic_avatar` ∈ `allowed_modes`; persisted `rules.must_disclose_not_owner` must match derivation on upsert and read-back.
2. **Client writability:** `rules`, `must_disclose_not_owner`, `mustDiscloseNotOwner` remain **FORBIDDEN** on all Preferencias upsert paths (extend US-3.1 tests).
3. **Agents DTO:** `getBusinessProfileForAgents.visualModeSummary` includes `mustDiscloseNotOwner: boolean` when Preferencias row exists; derive from stored rules or recompute — **must match** DB row; omit consent/asset internals.
4. **QA stub:** export check key (PO lean `generic_avatar_not_owner`), evaluator with deterministic EN/ES fixtures, severity **`blocking`** constant shared with US-10.2 path.
5. **Disclosure UX:** EN + ES shared legal string for Preferencias warning + `GenericAvatarDisclosurePreview` stub; plain text only; no full Aprobación flow.
6. **Non-goals:** no `neuramark_qa_reports`; no LLM QA job; no approval package API; no override handler; no per-slot modality UI; no Preferencias schema reopen.
7. **Proxy documentation:** agents and downstream stories treat DTO flag as allowlist-level until US-4.x slot assignment overrides per job.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
