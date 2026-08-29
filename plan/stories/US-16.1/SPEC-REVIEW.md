## Spec Review — US-16.1

### Verdict: ALIGNED

US-16.1 (Operator-only CRUD for a versioned **Playbook de formatos** in `neuramark_content_playbooks`; schema-validated **Formato de Reel** payloads; five V1 seed formatos; server-only `getPlaybookForAgents()`; no Trend snapshot, no Strategy/Script jobs, no LLM/video) matches SPEC §3 **Content Playbook** (S3.M — Operator curation, evergreen catalog, confirmed schema), SPEC §2 **Operator** responsibilities, SPEC §5–§6 (Next.js server-only, `neuramark_*`, i18n EN/ES, multi-tenant stack without requiring `client_id` on global reference data), TASKS.md **Fase 2 — Playbook + Tendencias**, and USER_STORIES § US-16.1. Playbook vs **Snapshot de tendencias** separation is correct (Trend stays US-16.2). Downstream consumers (US-4.1 Strategy, US-5.1 Script, US-9.x Assembly) are explicitly out of scope and consume only `getPlaybookForAgents()`. No ADR breach (no cron, no IG publish, no Fly worker in this story). SC-2 and hard rules untouched (no publish path, no human recording, no Cliente Playbook UI).

Residual open items are CONTRACT/SECURITY freezes (payload column layout, `duracion_ideal_seg` shape, `hook_type` closed enum, catalog content locale strategy) — not SPEC conflicts.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story delivers the **evergreen** Operator catalog SPEC requires; does not implement weekly **Tácticas de tendencia** (US-16.2), Content Strategy slot assignment (US-4.1), Script/Assembly hint application (US-5.1 / US-9.x), scraping agent, or per-Cliente Playbook overrides. | SPEC §3 Content Playbook vs Trend Intelligence; §3 Content Strategy Agent; TASKS.md Fase 2 split; USER_STORIES US-16.1 scope out | None. Do not add `neuramark_trend_snapshots`, LLM jobs, video jobs, or Cliente-facing Playbook CRUD. |
| Info | **Roles unchanged:** only **Operator** curates the catalog (SPEC §2, §3 Content Playbook). **Cliente** sees formato labels on Strategy brief later (US-4.1) — not in this story. **System** agents read via `getPlaybookForAgents()` only. All mutations and Operator UI gated with `requireOperator()` after `requireActive()` (US-14.5 pattern). | SPEC §2 Operator; §3 Authentication + Operator-only actions; USER_STORIES [SEC] operator-only | CONTRACT: every Server Action / handler calls `requireOperator("handler")`; no public `/api` without gate. |
| Info | **SPEC schema fields** covered: `slug`, `titulo`, `explicacion`, `estructura` (ordered beats), `hook_type`, `duracion_ideal_seg`, `modalidades_recomendadas`, `rubros` (empty = all), `guion_hints`, optional `editing_hints`, `cta_tipo`, optional Operator-only `ejemplo_referencia`. Slug immutable; archive not hard-delete; version bump on update satisfies SPEC **versionado**. | SPEC §3 Content Playbook (schema confirmed 2026-08-28); USER_STORIES US-16.1 AC | CONTRACT freezes exact Zod shapes and seed slugs. |
| Info | **Playbook vs Trend** not conflated: evergreen **Formatos de Reel** here; `cold-open-mejor-toma` and `formatos_playbook_compatibles[]` belong to US-16.2. Inline `editing_hints` on formatos satisfies SPEC “puede referenciar técnicas de edición” for V1 without a separate techniques table. | SPEC §3 Content Playbook + Trend Intelligence; CONTEXT **Playbook de formatos** vs **Táctica de tendencia** | Do not seed Trend entries or cross-validate Trend slugs in this story. |
| Info | **Modalidades:** `modalidades_recomendadas` uses technical tokens (`own_avatar` \| `generic_avatar` \| `faceless`) aligned with US-3.x Preferencias enum; assignment **per slot** remains US-4.x (CONTEXT **Modalidad de producción**). Story does not assign modalities — only recommends. | SPEC §3 Avatar/Visual + Content Playbook; CONTEXT Modo visual / Preferencias | CONTRACT validates enum server-side; product copy uses CONTEXT terms, not _Evitar_ tokens in UI. |
| Info | **Agent contract** mirrors US-2.3 pattern: `getPlaybookForAgents()` server-only, Zod-validated, active formatos only, strips `ejemplo_referencia`; sole read path for downstream agents. No public HTTP by slug. | SPEC §3 Content Playbook (“Content Strategy elige formato por slot; Video Script y Media Assembly consumen hints”); US-2.3 SPEC-REVIEW continuity | `import "server-only"`; never client-bundle; export comment that US-4.1+ MUST import this helper only. |
| Info | **Global catalog (no `client_id` on rows)** is SPEC-aligned: Operator curates one shared evergreen catalog for V1; multi-tenant NFR applies to Cliente business entities, not operator reference data. | SPEC §3 Content Playbook; §6 multi-tenant `client_id` on business entities | Do not add per-client Playbook overrides without SPEC amendment. |
| Info | **NFR / stack:** `neuramark_content_playbooks`; RLS deny-by-default (service-role Node only); Supabase migrations only; EN+ES Operator UI chrome; PrimeReact; no Supabase in Client Components; no LLM keys or provider spend. | SPEC §5–§6; AGENTS.md | `revalidatePath` after mutations; parameterized queries; do not log full payloads. |
| Info | **ADRs untouched:** no Vercel Cron (ADR-0001), no Instagram Graph publish (ADR-0002), no Fly.io FFmpeg worker (ADR-0003). Catalog CRUD stays on Vercel app layer. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | **Out of scope held:** Trend UI/API/seed; Strategy/Script/Caption jobs; scraping; Cliente Playbook UI; cost policy; auth redesign; Stories IG, multicanal, ads; RBAC UI. | SPEC §1 Fuera de alcance; §3 modules; USER_STORIES US-16.1 | Implementers must not ship generation pipelines or Trend tables here. |
| Low | **`duracion_ideal_seg` shape** not frozen in PREP: Playbook SPEC lists the field; Trend SPEC shows object example `{ cold_open, total }`. Playbook may use scalar seconds or a structured object. | SPEC §3 Content Playbook vs Trend Intelligence | CONTRACT freezes Playbook shape (recommend scalar or minimal object — not Trend’s full cold-open object unless intentionally shared). |
| Low | **Catalog content i18n** open (PREP Q2): AC “Copy exists in English and Spanish” = Operator UI chrome; seed `titulo`/`explicacion` may be ES-only. US-4.1 Cliente brief may need locale strategy later. | SPEC §6 i18n; USER_STORIES US-16.1 AC | CONTRACT documents: bilingual UI strings; monolingual catalog content acceptable in V1 unless Cliente brief requires EN fields. |
| Low | **`hook_type` closed enum** is PO lean, not explicit in SPEC text. Acceptable if CONTRACT publishes the allowlist and extends via migration when needed. | SPEC §3 schema-validated formato | Freeze enum in CONTRACT + Zod; reject unknown values on write. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-16.1/README.md` or `TASKS.md`.

Canonical use is correct: **Playbook de formatos**, **Formato de Reel**, **Operator**, **Cliente**, **Modalidad de producción** (referenced only via `modalidades_recomendadas`).

**Forbidden in product-facing copy / later CONTRACT & SECURITY UI examples:**

| Prefer | _Evitar_ |
|--------|----------|
| **Playbook de formatos** | viral playbook, template library |
| **Formato de Reel** | reel template, content format (genérico) |
| **Operator** | admin, administrador, staff |
| **Táctica de tendencia** / **Snapshot de tendencias** | trend tip, viral hack, trend report (do not use for Playbook entities) |
| **B-roll / sin presencia** (UI) | faceless (UI label; `faceless` OK as DB enum token) |

Note (not a US-16.1 PREP veto): parent `plan/USER_STORIES.md` module line still says `content_playbooks` without `neuramark_` prefix in the table — story TASKS correctly maps to `neuramark_content_playbooks`.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. **SECURITY may proceed.**

| Item | Blocks? | Guidance |
|------|---------|----------|
| Operator-only CRUD + `requireOperator()` on all mutations/reads | **Resolved for SPEC** | SECURITY freezes handler pattern, 403 before side effects, UI hiding not sufficient. |
| `getPlaybookForAgents()` server-only; strip `ejemplo_referencia` | **Resolved for SPEC** | SECURITY confirms no client import, no leakage in Operator list DTO vs agent DTO. |
| Zod re-validation on every write | **Resolved for SPEC** | SECURITY may add payload size bounds, logging policy. |
| No LLM / video / client-scoped mutations | **Resolved for SPEC** | Catalog + read contract only. |
| Global catalog (no `client_id`) | **Resolved for SPEC** | Not an IDOR surface if Operator-only writes and agents read global active set. |
| `duracion_ideal_seg` / catalog i18n / `hook_type` enum | **No SPEC block** | Freeze in CONTRACT. |
| Archive + slug permanently reserved | **No SPEC block** | SECURITY may confirm no slug reuse after archive (PO lean: no reuse). |
| Integer `version` only (no history table) | **No SPEC block** | Aligned with SPEC versionado for V1; full audit table out unless SECURITY requires. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect), then **CONTRACT.md** (nextjs-backend + FE signoff).

**CONTRACT freeze items (non-negotiable for alignment):**

1. Table **`neuramark_content_playbooks`**: UNIQUE `slug`, integer `version`, jsonb payload (or CONTRACT-equivalent), `active`, timestamps, `archived_at`; RLS deny-by-default.
2. Zod schemas for create/update/read/**agent DTO**; all SPEC fields present; `rubros` empty = all rubros; `editing_hints` optional.
3. **Seed** five formatos with stable slugs (e.g. `tip-rapido`, `antes-despues`, `objecion`, `oferta-local`, `mito-vs-realidad`) and minimal valid payloads.
4. Server Actions: list, getBySlug, create, update, archive — all `requireOperator("handler")`; slug immutable on update; duplicate slug rejected.
5. **`getPlaybookForAgents()`**: `import "server-only"`; active formatos only; validated output; **omit** `ejemplo_referencia`; documented as sole agent read path.
6. Operator route (PO lean `/operator/playbook`) with RSC loader + mutations; EN+ES UI chrome; loading/empty/error states.
7. **`modalidades_recomendadas`**: enum `own_avatar` \| `generic_avatar` \| `faceless`; empty array = no restriction (confirm in CONTRACT).
8. Explicit out of scope: `neuramark_trend_snapshots`, Strategy/Script jobs, Cliente Playbook UI, per-client overrides, LLM/video.
9. Freeze: `duracion_ideal_seg` Playbook shape, `hook_type` allowlist, catalog content locale strategy, archive/slug-reuse rule.

Do not write application code in this gate. Do not check off USER_STORIES acceptance criteria.
