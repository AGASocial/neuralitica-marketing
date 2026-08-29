## Spec Review — US-16.2

### Verdict: ALIGNED

US-16.2 (Operator-only publish/edit of a weekly **Snapshot de tendencias** in `neuramark_trend_snapshots`; schema-validated **Táctica de tendencia** entries; seed `cold-open-mejor-toma`; server-only `getTrendSnapshotForWeek(weekStart)`; Playbook slug validation via `getPlaybookForAgents()`; no Content Strategy/Script jobs, scraping agent, or auto-activation) matches SPEC §3 **Trend Intelligence** (manual V1, confirmed schema 2026-08-28), SPEC §2 **Operator** responsibilities (“curar … Snapshot de tendencias semanal”), SPEC §3 **Content Playbook** linkage via `formatos_playbook_compatibles[]` (references only — no Playbook CRUD), SPEC §5–§6 (Next.js server-only, `neuramark_*`, i18n EN/ES, global operator reference data without `client_id`), TASKS.md **Fase 2 — Trend Intelligence manual**, and USER_STORIES § US-16.2.

**Playbook vs Trend** separation is correct: evergreen **Formatos de Reel** remain US-16.1 ✅; weekly **Tácticas de tendencia** are US-16.2. Downstream consumers (US-4.1 Strategy attaches optional `tactica_tendencia_slug`; US-5.1 Script / US-9.x Assembly apply hints) are explicitly out of scope and must read only `getTrendSnapshotForWeek()`. No ADR breach (no Vercel Cron trend pipeline, no IG publish, no Fly worker). SC-2 and hard rules untouched (no publish path, no human recording, no Cliente Trend UI in V1).

Residual open items are CONTRACT/SECURITY freezes (seed `week_start`, upsert semantics, enum reuse from Playbook Zod, operator route path, catalog content locale) — not SPEC conflicts.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story delivers **Trend Intelligence manual V1** as SPEC requires: Operator publishes weekly snapshot; agents consume structured hints later. Does not implement Content Strategy slot assignment (US-4.1), Script/Assembly hint application (US-5.1 / US-9.x), scraping agent, auto-activation rules, or Cliente-facing Trend surfaces. | SPEC §3 Trend Intelligence; §3 Content Strategy Agent; TASKS.md Fase 2 split; USER_STORIES US-16.2 scope out | None. Do not add LLM jobs, `neuramark_content_strategies`, video jobs, or scraping pipeline in this story. |
| Info | **Roles unchanged:** only **Operator** curates and publishes the snapshot (SPEC §2, §3 Trend Intelligence). **Cliente** sees táctica labels on Strategy brief later (US-4.1) — not here. **System** agents read via `getTrendSnapshotForWeek()` only. All mutations and Operator UI gated with `requireOperator()` (US-14.5 pattern). | SPEC §2 Operator; USER_STORIES [SEC] operator-only | CONTRACT: every Server Action / RSC loader calls `requireOperator("handler")`; no public `/api` without gate. |
| Info | **SPEC schema fields** covered: `slug`, `titulo`, `week_start`, `activo`, `prioridad_semana` (1–5), `fuente` (`manual` \| `scraping` \| `operator_review` — V1 writes `manual` only), `explicacion`, optional `evitar`, optional Operator-only `ejemplo_referencia`, `hook_type`, `estructura[]`, `guion_hints[]`, `editing_hints[]`, `duracion_ideal_seg` object (e.g. `{ cold_open: 2, total: 25 }`), `modalidades_recomendadas`, `rubros[]` (empty = all), `formatos_playbook_compatibles[]`. Seed **`cold-open-mejor-toma`** with cold-open + rewind editing hints is required and present in AC/TASKS. | SPEC §3 Trend Intelligence (schema confirmed 2026-08-28); USER_STORIES US-16.2 AC | CONTRACT freezes exact Zod shapes, seed payload, and seed `week_start`. |
| Info | **Playbook vs Trend** not conflated: `formatos_playbook_compatibles[]` validates against active Playbook slugs via `getPlaybookForAgents()` — reuse only, no duplicate Playbook SELECT or CRUD. Trend entries are weekly, not evergreen catalog rows. | SPEC §3 Content Playbook + Trend Intelligence; CONTEXT **Playbook de formatos** vs **Táctica de tendencia** | Do not alter `neuramark_content_playbooks` or seed Playbook formatos here beyond slug references in Trend seed. |
| Info | **Modalidades:** `modalidades_recomendadas` uses technical tokens (`own_avatar` \| `generic_avatar` \| `faceless`) aligned with US-3.x / US-16.1; assignment **per slot** remains US-4.x. Story recommends modalities on tácticas only. | SPEC §3 Avatar/Visual + Trend Intelligence; CONTEXT **Modalidad de producción** | CONTRACT validates enum server-side; product copy uses CONTEXT terms in UI, not _Evitar_ tokens. |
| Info | **Agent contract** mirrors US-16.1 / US-2.3 pattern: `getTrendSnapshotForWeek(weekStart)` server-only, Zod-validated, `activo = true` entries only, strips `ejemplo_referencia`, safe empty state when no snapshot; sole read path for downstream agents. | SPEC §3 Trend Intelligence (“Content Strategy puede adjuntar `tactica_tendencia_slug`”; Script/Assembly apply hints); US-16.1 continuity | `import "server-only"`; never client-bundle; US-4.1+ MUST import this helper only. |
| Info | **Global snapshot (no `client_id` on rows)** is SPEC-aligned for V1: one Operator-curated weekly reference snapshot consumed by Strategy for all Clientes; multi-tenant NFR applies to Cliente business entities, not operator reference data (same precedent as US-16.1 Playbook). | SPEC §3 Trend Intelligence; §6 multi-tenant; US-16.1 SPEC-REVIEW | Do not add per-client Trend overrides without SPEC amendment. |
| Info | **Row model:** one DB row per `week_start` (UNIQUE); `entries` jsonb holds all tácticas; soft deactivate via `activo: false` within entries — satisfies “at most one active snapshot row per week” AC without hard-deleting history. | USER_STORIES US-16.2 AC; TASKS PO decisions | CONTRACT documents upsert-by-`week_start` semantics and slug unique within snapshot only. |
| Info | **NFR / stack:** `neuramark_trend_snapshots`; RLS deny-by-default (service-role Node only); Supabase migrations only; EN+ES Operator UI chrome; PrimeReact; no Supabase in Client Components; no LLM keys or provider spend. | SPEC §5–§6; AGENTS.md | `revalidatePath` after mutations; parameterized queries; do not log full payloads. |
| Info | **ADRs untouched:** no automated trend cron (ADR-0001 applies to Cliente weekly cycle, not Trend curation); no Instagram Graph publish (ADR-0002); no Fly.io FFmpeg worker (ADR-0003). Trend CRUD stays on Vercel app layer. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | **Out of scope held:** Content Strategy/Script/Caption jobs; scraping; auto-activation; Cliente Trend UI; per-client overrides; Playbook CRUD changes; cost policy; auth redesign; Stories IG, multicanal, ads; RBAC UI. | SPEC §1 Fuera de alcance; §3 modules; USER_STORIES US-16.2 | Implementers must not ship generation pipelines or Strategy brief UI here. |
| Low | **`week_start` normalization** (ISO Monday only) is PO lean, not explicit in SPEC text. Acceptable if CONTRACT + server reject non-Monday dates and UI normalizes picker. | SPEC §3 `week_start`; TASKS open Q1 | Freeze Monday-normalization rule in CONTRACT. |
| Low | **`duracion_ideal_seg` object keys** — PO lean strict `{ cold_open, total }` matches SPEC example; extensibility deferred. Distinct from Playbook scalar shape (US-16.1) — intentional. | SPEC §3 Trend Intelligence vs Content Playbook | CONTRACT freezes Trend object schema separately from Playbook. |
| Low | **Catalog content i18n** open (PREP Q9): AC “Copy exists in English and Spanish” = Operator UI chrome; seed `titulo`/`explicacion` may be ES-only (mirror US-16.1). | SPEC §6 i18n; USER_STORIES US-16.2 AC | CONTRACT documents bilingual UI strings; monolingual táctica content acceptable in V1. |
| Low | **Hook / rubro enums** — PO lean reuse Playbook Zod enums to avoid drift; acceptable if CONTRACT imports shared schemas and rejects unknown values on write. | SPEC §3 schema-validated táctica | Freeze import path in CONTRACT (`playbookHookTypeSchema`, etc.). |
| Low | **Clone prior week** explicitly out of V1 — no SPEC conflict; manual re-entry only. | TASKS scope out | Do not add clone UX without PO/SPEC amendment. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-16.2/README.md` or `TASKS.md`.

Canonical use is correct: **Snapshot de tendencias**, **Táctica de tendencia**, **Operator**, **Playbook de formatos** (for compatibility references only).

**Forbidden in product-facing copy / later CONTRACT & SECURITY UI examples:**

| Prefer | _Evitar_ |
|--------|----------|
| **Snapshot de tendencias** | trend report, weekly trends dump |
| **Táctica de tendencia** | trend tip, viral hack |
| **Operator** | admin, administrador, staff |
| **Playbook de formatos** / **Formato de Reel** | viral playbook, template library, reel template |
| **B-roll / sin presencia** (UI) | faceless (UI label; `faceless` OK as DB enum token) |

Note (not a US-16.2 PREP veto): parent `plan/USER_STORIES.md` DB line still says `trend_snapshots` without `neuramark_` prefix — story TASKS correctly maps to `neuramark_trend_snapshots`.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. **SECURITY may proceed.**

| Item | Blocks? | Guidance |
|------|---------|----------|
| Operator-only publish/edit + `requireOperator()` on all mutations/reads | **Resolved for SPEC** | SECURITY freezes handler pattern, 403 before side effects. |
| `getTrendSnapshotForWeek()` server-only; strip `ejemplo_referencia` from agent DTO | **Resolved for SPEC** | SECURITY confirms no client import, no leakage in Operator vs agent DTOs. |
| Zod re-validation on every write; `prioridad_semana` 1–5; `fuente` forced `manual` in V1 | **Resolved for SPEC** | SECURITY may add payload size bounds, logging policy. |
| Playbook slug validation via `getPlaybookForAgents()` only | **Resolved for SPEC** | No Cliente slug enumeration endpoint; reject unknown/archived slugs on Trend write. |
| No LLM / video / scraping / auto-activation | **Resolved for SPEC** | Snapshot persistence + read contract only; note untrusted-input for US-4.1+ prompts. |
| Global snapshot (no `client_id`) | **Resolved for SPEC** | Not an IDOR surface if Operator-only writes and agents read global weekly set. |
| `week_start` / upsert / seed date / route path / enum reuse | **No SPEC block** | Freeze in CONTRACT. |
| Soft deactivate (`activo: false`) vs hard delete | **No SPEC block** | Agent helper filters active entries only. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect), then **CONTRACT.md** (nextjs-backend + FE signoff).

**CONTRACT freeze items (non-negotiable for alignment):**

1. Table **`neuramark_trend_snapshots`**: UNIQUE `week_start` (`date`, Monday-normalized), `entries` jsonb, `published_at`, `updated_at`; RLS deny-by-default.
2. Zod schemas for snapshot row + **Táctica de tendencia** (create/update/read/**agent DTO**); all SPEC fields present; `rubros` empty = all rubros; `evitar` and `ejemplo_referencia` optional.
3. **Seed** one snapshot with **`cold-open-mejor-toma`**: cold-open + rewind `editing_hints`, valid `formatos_playbook_compatibles[]` referencing US-16.1 seed slugs; fixed canonical `week_start` in migration.
4. Server Actions: list weeks, getByWeekStart, publishOrUpdateSnapshot, addEntry, updateEntry, deactivateEntry — all `requireOperator("handler")`; slug immutable on entry update; duplicate slug within snapshot rejected.
5. **`getTrendSnapshotForWeek(weekStart)`**: `import "server-only"`; returns snapshot or `{ weekStart, entries: [] }`; **active entries only**; **omit** `ejemplo_referencia`; documented as sole agent read path.
6. Operator routes (PO lean `/operator/trends`, `/operator/trends/[weekStart]`) with RSC loader + mutations; EN+ES UI chrome; loading/empty/error states.
7. **`duracion_ideal_seg`**: strict object `{ cold_open: number, total: number }` for Trend entries (not Playbook scalar).
8. **`fuente`**: enum present in schema; V1 writes **`manual`** only.
9. **`formatos_playbook_compatibles[]`**: validate on write against active slugs from `getPlaybookForAgents()` — no direct Playbook table access from Trend modules.
10. Explicit out of scope: Content Strategy/Script jobs, scraping agent, auto-activation, Cliente Trend UI, per-client overrides, Playbook CRUD, LLM/video.

Do not write application code in this gate. Do not check off USER_STORIES acceptance criteria.
