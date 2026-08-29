## Spec Review — US-3.2

### Verdict: ALIGNED

US-3.2 (Cliente **Consentimiento de avatar**: explicit grant + revoke of likeness authorization for **Avatar propio autorizado**; disclosure `consent_version` stored for audit; append-only ledger with `revoked_at`; EN/ES UI; Preferencias continue to reject `own_avatar` without active consent; harden `hasActiveAvatarConsent`; video-job re-check + revoke→cancel queued own-avatar jobs as **stubs/design hooks** until US-8.x / US-10.x) matches SPEC §3 Avatar / Visual Mode Selector (**S3.M4**), SPEC §2 Cliente role, SPEC §6 NFRs (likeness + consent append-only, server-only), CONTEXT **Consentimiento de avatar**, PLAN Fase 1 (Avatar / Visual Mode Selector), and SECURITY_BASELINE (“Consent as an immutable ledger”).

Continuity with **US-3.1 CLOSED** is correct: Preferencias surface `/settings/preferences`, allowlist SEC, and fail-closed probe remain; soft missing-table probe becomes a real `neuramark_avatar_consents` ledger behind the same helper. Preferencias upsert **must not** grant/revoke. Ficha viva PATCH (US-2.2) and agents DTO (US-2.3) stay consent-blind. Siblings US-3.3 (uploads), US-3.4 (generic disclosure/QA), and Modalidad de producción per slot (US-4.x) stay out. No ADR breach, no SC-2 / publish path, no V1 out-of-scope creep.

**No SPEC amendment required** before SECURITY / CONTRACT. Verdict is **ALIGNED** (not GAPS / CONFLICT).

---

### Scope split vs S3.M4 / siblings — confirm

| Concern | PO scope (US-3.2) | SPEC mapping | Verdict |
|---------|-------------------|--------------|---------|
| Consentimiento grant / revoke | Explicit affirmative + revoke; disclosure version | S3.M4: dar/revocar Consentimiento | **ALIGNED** |
| Ledger store | `neuramark_avatar_consents` append-only (`revoked_at`, never DELETE) | S3.M4 + §6 append-only; USER_STORIES AC | **ALIGNED** |
| Preferencias gate | Keep reject `own_avatar` without active consent | S3.M4: rechaza sin consent; US-3.1 continuity | **ALIGNED** |
| Job re-check | Stub helper + unit tests; full job create later | S3.M4: re-check en Job; US-8.x | **ALIGNED** (stub OK — same pattern as US-3.1 soft gate) |
| Revoke → cancel queued | Stub `cancelQueuedOwnAvatarJobs`; in-flight Operator flag = TODO | S3.M4: revocación cancela cola; AC [SEC] | **ALIGNED** (stub OK until job tables) |
| Reference uploads | Out | S3.M4 uploads + US-3.3 | **ALIGNED** (out) |
| Preferencias allowlist schema | Unchanged beyond consuming hardened probe | US-3.1 CLOSED | **ALIGNED** |
| Modalidad por slot | Out | S3.M4 regla clave + US-4.x | **ALIGNED** (out) |
| No recording / no silent regen | Explicit PREP; consent grant/revoke must not enqueue jobs | S3.M4 + §6 hard rules | **ALIGNED** |

Do not amend SPEC. Do not check off USER_STORIES AC here.

---

### Open questions (TASKS.md) — SPEC resolution

| # | Question | Spec-guardian | Blocks SECURITY? |
|---|----------|---------------|------------------|
| 1 | **UI placement** — Preferencias page vs `/settings/avatar-consent` | **Not a SPEC decision.** PO lean: Consentimiento UI on `/settings/preferences` (disclosure + grant/revoke beside Avatar propio) is compatible with Flujo S4.1 and S3.M4 (Preferencias + Consentimiento as one Cliente capability). Dedicated route also compatible. Exact chrome = CONTRACT (+ FE/SECURITY). | **No** |
| 2 | **Active = version match?** | **Resolved ALIGNED with PO lean.** SPEC §6 + USER_STORIES [SEC]: changing disclosure requires re-consent under a new version. Active for Preferencias/`own_avatar` = latest non-revoked row **and** `consent_version` equals current server constant; mismatch → treat as inactive until re-consent. | **No** |
| 3 | **Grant Server Action arity** | **Not a SPEC decision.** Explicit affirmative + server timestamp required (S3.M4 / AC). Body `{ affirmed: true, consentVersion }` echoing server constant is SPEC-compatible and preferred for mistaken-grant guard. No `client_id`. CONTRACT freezes. | **No** |
| 4 | **Revoke mutation shape** | **Resolved ALIGNED with AC.** USER_STORIES: “revocation sets `revoked_at` on the existing row”; “never updated in place or deleted” → interpret as: **only** `revoked_at` (and server revoke timestamp ownership) may change; historical consent fields immutable; **never DELETE**; re-consent = **INSERT** new row. Pure event-row INSERT for revoke would contradict AC wording — do not invent. | **No** |
| 5 | **Re-consent after revoke** | **Resolved ALIGNED.** Same disclosure version OK as new INSERT (new `consented_at`); disclosure text change requires bumped constant → re-consent. | **No** |
| 6 | **Disclosure copy ownership** | **Not a SPEC block.** Product labels use CONTEXT; FE may draft EN/ES legal-tone disclosure; version string freezes in CONTRACT. Legal review outside SPEC. | **No** |
| 7 | **Video-job stub depth** | **SPEC-aligned stub.** S3.M4 requires re-check en Job; full tables are US-8/US-10. Idempotent no-op when jobs absent + proven invoke-on-revoke / helper unit tests = enough for this story slice (parallel to US-3.1 fail-closed soft probe). | **No** |
| 8 | **In-flight Operator flag** | **ALIGNED deferral.** AC mentions flagging in-flight; no Operator UI in 3.2; stub documents TODO for US-8/US-10. Do not invent Operator review chrome. | **No** |
| 9 | **Preferencias allowlist after revoke** | **Resolved ALIGNED with PO lean (no silent rewrite).** SPEC requires reject own-avatar without consent + cancel cola — **not** auto-mutation of Preferencias. Do **not** silently strip `own_avatar` on revoke; probe + upsert reject + UI disable suffice. Optional soft UI warning that allowlist still lists Avatar propio until Cliente edits = CONTRACT. If SECURITY prefers fail-closed store auto-strip, that is a **SECURITY** preference, not a SPEC amendment. | **No** (SECURITY may tighten) |
| 10 | **Multiple concurrent active rows** | **Not mandated by SPEC text; ALIGNED with PO lean.** Partial unique index on `client_id` WHERE `revoked_at IS NULL` supports “one active” probe semantics and append-only integrity — CONTRACT/SECURITY/DB freeze. | **No** |
| 11 | **Timestamp timezone / display** | **Not a SPEC decision.** Server UTC store; FE locale format; ISO in loader DTO = CONTRACT. | **No** |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-1 (no human recording; likeness only with Consentimiento) and Flujo S4.1 preferencias/consent slice. Does not touch Aprobación, Publicación IG, Ciclo semanal cron, Playbook, Trend, or slot modality. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; hard rules; Flujo S4.1; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation jobs, or Strategy. |
| Info | Roles unchanged: **Cliente** grants/revokes Consentimiento; **System** persists append-only ledger + Preferencias gate + (later) Job re-check; **Operator** only for later in-flight flag — no Operator UI here. Identity via `getCurrentUser()` / `requireActive`. | SPEC §2; §3 S3.M4 + Authentication | CONTRACT: no tenant id from browser; Server Actions only. |
| Info | Preferencias vs Consentimiento cut is correct. US-3.1 owns allowlist; US-3.2 owns ledger grant/revoke; Preferencias save must never side-effect consent. | S3.M4; US-3.1 SECURITY/CONTRACT | CONTRACT: explicit grant/revoke Actions; Preferencias upsert unchanged except hardened probe. |
| Info | Job re-check + revoke→cancel are SPEC System behaviors; stubbing them until `neuramark_video_jobs` exists is the same phased pattern as US-3.1’s soft consent probe. Full enforcement remains US-8.x / US-10.x reading the live ledger (SECURITY_BASELINE §2). | S3.M4; SECURITY_BASELINE; USER_STORIES US-3.2 [SEC] | SECURITY must require real stub helpers + tests; do not mark full job AC done without jobs. |
| Info | Parent USER_STORIES DB shorthand `avatar_consents` → physical **`neuramark_avatar_consents`**. Story “Client” / “own-avatar mode” in parent title = **Cliente** / **Avatar propio autorizado** in product copy. | SPEC §1 prefix; CONTEXT | CONTRACT uses `neuramark_` + CONTEXT labels in i18n. |
| Info | NFR / stack: Next.js App Router; i18n EN+ES; `neuramark_*`; multi-tenant `client_id` server-only; likeness/consent server-only; not ADR-0003 long work (stays on Vercel app). | SPEC §5–§6 | No auth redesign; no browser Supabase. |
| Info | ADRs 0001–0003 untouched: no cron orchestration, no IG Graph publish, no FFmpeg/Fly. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: US-3.3 uploads/`media_assets`; US-3.4 QA UI; per-slot modality; Preferencias schema reopen; Ficha viva consent writes; job cancel UI; RBAC; Stories IG; multicanal; ads. | SPEC §1 Fuera; S3.M4 siblings | Implementers must not expand stubs into sibling stories. |
| Low | Parent AC “never updated in place” vs “sets `revoked_at` on the existing row” — resolve as: revoke = UPDATE **only** `revoked_at`; other consent columns immutable; DELETE forbidden; grant/re-consent = INSERT. | USER_STORIES US-3.2 [SEC]; S3.M4 append-only | SECURITY/CONTRACT freeze this interpretation. |
| Low | Stale `own_avatar` remaining in Preferencias after revoke (until Cliente edits) is SPEC-OK if probe/upsert/job gates fail closed; product copy must not claim allowlist was cleared. | S3.M4; Q9 | CONTRACT UX warning optional; SECURITY may require auto-strip — escalate there, not as SPEC amendment. |
| Low | USER_STORIES FE “Consent checkbox” / BE “reject video jobs” — interpret as Consentimiento UI + Preferencias gate now; full video-job reject via stub + later US-8. | USER_STORIES US-3.2 | Validator later: stub evidence + Preferencias reject; do not demand live job cancel UI in 3.2. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-3.2/README.md` or `TASKS.md`. Canonical use is correct: **Consentimiento de avatar**, **Avatar propio autorizado**, **Preferencias de producción visual**, **Cliente**, **Operator**. Enums / table names correctly scoped to code/DB. PREP correctly flags “consent ledger” as _Evitar_ in product copy while allowing technical “ledger” in engineering docs.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY product strings:**

| Prefer | _Evitar_ |
|--------|----------|
| **Consentimiento de avatar** | consent ledger (in product copy) |
| **Avatar propio autorizado** | own_avatar / likeness mode (in product copy) |
| **Preferencias de producción visual** | avatar mode, visual preferences (as entity name), visual mode selector, single mode |
| **Cliente** | prestador (as product role), dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Ficha viva** | Business Profile, perfil de negocio |

Hard rule (product + UX): **never** require or prompt the Cliente to record video or audio. Likeness authorization is Consentimiento + (later) reference uploads — not recording.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. **SECURITY can proceed.**

| Item | Blocks? | Guidance |
|------|---------|----------|
| Table name | **Resolved** (`neuramark_avatar_consents`) | CONTRACT freezes columns/indexes/constraints. |
| Active = version match | **Resolved for SPEC** (must match current constant) | SECURITY/CONTRACT freeze probe SQL + version constant name. |
| Revoke shape | **Resolved for SPEC** (UPDATE `revoked_at` only; INSERT on re-consent; no DELETE) | SECURITY: append-only rules + tests. |
| Preferencias after revoke | **Resolved for SPEC** (no silent rewrite) | SECURITY may still prefer auto-strip — product decision at SECURITY gate, not SPEC amendment. |
| UI placement | **No SPEC block** | CONTRACT freezes chrome on Preferencias page (PO lean) or dedicated route. |
| Job stubs | **Resolved for SPEC** (stubs OK) | SECURITY must require helpers + invoke tests; full cancel = US-8/US-10. |
| Grant body shape | **No SPEC block** | CONTRACT: affirmed + version echo recommended. |
| Partial unique active row | **No SPEC block** | Strongly recommended; SECURITY/DB confirm. |
| User / product decision needed? | **No for SPEC** | Remaining freezes are SECURITY/CONTRACT (placement chrome, auto-strip preference, stub depth details, disclosure constant string). |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

**SPEC amendments needed?** **No.**

**Defaults aligned?** Yes — PO leans in TASKS.md (table name, append-only revoke via `revoked_at`, version match for active, Preferencias page placement, no Preferencias side-effect grant, job/cancel stubs, no silent Preferencias rewrite on revoke, partial unique active row, EN/ES versioned disclosure) are **ALIGNED** with SPEC S3.M4 / CONTEXT / ADRs / US-3.1 continuity / SECURITY_BASELINE ledger intent. No CONFLICT. No GAPS in SPEC coverage for this story’s slice.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. Table: **`neuramark_avatar_consents`** — `id`, `client_id` FK → `neuramark_clients`, `consented_at` (server), `consent_version` (server constant), `revoked_at` (nullable); RLS deny-by-default; service-role Node only; recommended partial unique `(client_id) WHERE revoked_at IS NULL`.
2. Append-only: grant/re-consent = **INSERT**; revoke = set **`revoked_at` only** on active row; **never DELETE**; never mutate historical `consented_at` / `consent_version` / likeness fields.
3. Active probe: `hasActiveAvatarConsent` — fail closed; `revoked_at IS NULL`; order latest; limit 1; **and** `consent_version` = current `AVATAR_CONSENT_DISCLOSURE_V*` constant; missing table / error → false.
4. Surfaces: Server Actions grant + revoke (no tenant id); Preferencias upsert **must not** grant/revoke; loader arity 0 for consent status (+ timestamp, version).
5. Preferencias continuity: `own_avatar` ∈ allowlist ⇒ active consent required (`OWN_AVATAR_CONSENT_REQUIRED`); UI disable not authority.
6. Stubs: `assertActiveAvatarConsentForJob` (or documented mandatory call site) + `cancelQueuedOwnAvatarJobs` no-op/safe if jobs absent; unit-tested; in-flight Operator flag = documented TODO for US-8/US-10.
7. No silent Preferencias rewrite on revoke (SPEC); optional UI warning; SECURITY may add auto-strip as extra fail-closed store rule without SPEC amendment.
8. UX/copy: **Consentimiento de avatar** / **Avatar propio autorizado**; no “consent ledger” product label; no recording prompts; EN + ES; disclosure as text nodes (no `dangerouslySetInnerHTML`).
9. Continuity: do not reopen US-2.2 PATCH; do not dump ledger into `getBusinessProfileForAgents`; keep settings off `isPublicPath` + `no-store`.
10. Explicit out of scope: US-3.3 uploads; US-3.4 QA UI; Modalidad por slot; full job cancel UI; auth redesign; browser Supabase; public Route Handler with tenant ids.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
