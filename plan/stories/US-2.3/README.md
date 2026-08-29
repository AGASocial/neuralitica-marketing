# US-2.3 — Expose profile to agents (API contract)

**Status:** CONTRACT frozen (FE N/A — 2026-08-29); ready for BE BUILD. AC unchecked until VALIDATE.

**As a** System, **I want** a stable profile contract for all agents, **so that** strategy, script, and QA agents do not re-parse raw interview data.

Ship a **server-only** helper `getBusinessProfileForAgents(clientId)` with a typed Zod **agent DTO** derived from the canonical Ficha viva row (`neuramark_business_profiles`). Content Strategy, Video Script, Caption, and QA agents (and future orchestration) **must** import this helper only — never raw interview sessions, never the Cliente view helper as a substitute DTO, never browser-supplied tenant ids. Pre-onboarding / missing row → **404-safe empty** (typed missing), not throw / not crash the caller. Optional **visual mode summary** field is a stub/`null` until Preferencias de producción visual (US-3.x) exist.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-2.3 (do not redefine; do **not** mark done in PREP)

**This folder:** [`plan/stories/US-2.3/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · [`CONTRACT.md`](./CONTRACT.md) (frozen).

**Depends on:** [US-2.1](../US-2.1/) ✅ CLOSED — Ficha viva row + seven-key `fields` + `version`. [US-2.2](../US-2.2/) ✅ CLOSED — edit bumps `version` agents will consume. Runtime identity for *orchestration* callers: trusted server context (SECURITY freezes). Cliente UI identity remains US-14.5 / `getBusinessProfileForClient` (arity 0) — **out of this story’s public surface**.

**Unblocks:** [US-4.1](../../USER_STORIES.md) (Content Strategy) · Video Script / Caption / QA agent jobs that require Ficha viva input · Ciclo semanal orchestration (later phases).

---

## Scope in

| Area | What 2.3 adds |
|------|----------------|
| **FE** | — (none) |
| **BE** | `getBusinessProfileForAgents(clientId)` in a `import "server-only"` module; Zod agent DTO (+ types) documented in `lib/contracts/…`; map seven `fields` + `version` (+ optional `updatedAt` if CONTRACT wants); **404-safe empty** for missing / pre-onboarding; optional **visual mode summary** stub/`null` until US-3.x; code comment + export that future agents **MUST** import this helper only; do **not** wire every LLM agent job yet (stub export + comment OK). |
| **DB** | — verify-only (same `neuramark_business_profiles` row). No new tables/views. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **FE UI** | No Cliente / Operator screens in this story. |
| **Preferencias editors / Consentimiento** | US-3.x — summary field may be stub/`null` only. |
| **Public HTTP API** | No `/api/…` Route Handler exposing profile by `clientId`. Caller is trusted server orchestration only. |
| **Wiring every agent job** | Contract + helper must exist; actual Content Strategy / Script / Caption / QA LLM jobs land in later stories (US-4.x+). Stub + “MUST import” comment is enough. |
| **`getBusinessProfileForClient` rebuild** | Arity-0 Cliente view helper stays US-2.1; keep modules **distinct** (US-2.1 SECURITY carry-forward). |
| **Raw interview blobs** | Never return `neuramark_interview_sessions` answers or consent ledger internals. |
| **`profile_versions` history** | SPEC Fuera V1. Current row `version` integer is enough. |
| Auth redesign / browser Supabase | Unchanged. |

## What US-2.1 / US-2.2 already shipped (do not duplicate)

| Source | Continuity for agents |
|--------|------------------------|
| US-1.3 / US-2.1 | Table `neuramark_business_profiles`: jsonb `fields` **1:1** seven interview keys (`services`, `zone`, `tone`, `offers`, `objections`, `style`, `restrictions`), `version`, RLS zero policies, service-role Node only. |
| US-2.1 | `getBusinessProfileForClient()` arity 0 — **Cliente UI only**. Soft missing / `loadFailed`. Do **not** conflate signatures. |
| US-2.2 | PATCH allowlist bumps `version`; `updated_by`; same seven-key `fields`. Agents consume **current** row after edits. |
| Contracts | Reuse `interviewAnswersCompleteSchema` / `BusinessProfileFields` for field shape; agent DTO is a **minimal** projection (plus version + visual stub), not a dump of row columns. |

**US-2.3 adds the agent-facing read path** — trusted `clientId` argument from server orchestration; minimal Zod DTO; empty-safe; server-only.

## Field map (Ficha viva → agent DTO)

| Source | Agent DTO (PO lean — CONTRACT freezes names) |
|--------|-----------------------------------------------|
| `fields.services` … `fields.restrictions` | Same seven keys (validated Zod) when `exists` |
| `version` | Required positive int when `exists` (traceability) |
| `updated_at` | Optional ISO if CONTRACT wants |
| Preferencias / modalidad allowlist | **`visualModeSummary: null`** (or equivalent stub) until US-3.x |
| Consent ledger, `source_interview_id`, tokens, `role`, raw interview session | **Omit always** |

## Canonical terms (CONTEXT)

Use **Ficha viva**, **Entrevista inicial**, **Cliente**, **Operator**, **Preferencias de producción visual**, **Modalidad de producción** (when referring to future summary).  
_Evitar:_ Business Profile / perfil de negocio (in product copy), onboarding interview, cuestionario, admin / administrador / staff, avatar mode / visual preferences (as entity names), consent ledger (in product copy).

Technical helper name `getBusinessProfileForAgents` is SPEC-canonical (S3.M3) — keep in code; do not rename for glossary purity.

## Ready for SPEC?

**Yes.** SPEC §3 Business Profile / Ficha viva (S3.M3): System automatically exposes a server-only agent contract (`getBusinessProfileForAgents`); agents consume Ficha viva (Strategy S3.M5 input: Ficha viva + …). Continuity with US-2.1/US-2.2 field shape; visual summary deferred to US-3.x without SPEC amendment. Open questions below are SECURITY/CONTRACT freezes (who may pass `clientId`, empty-shape naming), not SPEC conflicts.
