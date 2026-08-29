# US-3.4 — Enforce generic avatar representation rules

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH CONDITIONS (0 Critical, 0 High assumed — formal QA pending; PO CLOSE yes). Builds FE `a0b0a80` · BE `eadf356`.

**As a** System, **I want** generic avatars to never impersonate the business owner, **so that** we avoid misleading local customers.

Ship **reglas de representación para avatar genérico**: when **Avatar genérico profesional** is in the Cliente’s Preferencias allowlist, the system sets and persists `must_disclose_not_owner` server-side, surfaces clear warning copy on Preferencias, passes the rule flag into the agents DTO for Script/QA consumers, exports a reusable **generic-avatar-not-owner** QA check stub (blocking / non-overridable class) for US-10.1, and provides a **disclosure preview stub** for the approval package UI. Full QA agent wiring (US-10.1), full Operator approval screen (US-11.1), and per-slot modality assignment (US-4.x) stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-3.4 (checked on CLOSE).

**This folder:** [`plan/stories/US-3.4/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · [`CONTRACT.md`](./CONTRACT.md) (frozen) · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-3.4-generic-avatar-rules`

**Depends on:** [US-3.1](../US-3.1/) ✅ CLOSED — `neuramark_visual_preferences`, `rules` jsonb, `deriveVisualPreferencesRules`, client-writable strip for `rules` / `must_disclose_not_owner`, Preferencias at `/settings/preferences`, basic `disclosureNote` info banner. Runtime identity: [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`). Continuity: [US-2.3](../US-2.3/) ✅ `getBusinessProfileForAgents` + `visualModeSummary` (allowlist only today).

**Unblocks:** [US-5.1](../../USER_STORIES.md) (script agent respects `must_disclose_not_owner`) · [US-10.1](../../USER_STORIES.md) (QA impersonation check import) · [US-11.1](../../USER_STORIES.md) (approval disclosure line — stub here) · downstream non-overridable legal class continuity (US-10.2).

**Carry-forward (US-3.1):** `must_disclose_not_owner` derivation on upsert already exists — US-3.4 **hardens, exposes, and wires** it; do not reopen Preferencias allowlist schema or client-writable surface.

---

## Close verdicts

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | ALIGNED (V1 allowlist proxy; stubs for QA/approval; no US-10.1/US-11.1 scope creep) |
| SECURITY | APPROVE WITH CONDITIONS |
| CONTRACT | Frozen, Reviewed by FE (2026-08-29) |
| BUILD | FE `a0b0a80` · BE `eadf356` |
| VALIDATION | PASS WITH NOTES |
| QA | APPROVE WITH CONDITIONS (0 Critical, 0 High assumed; 3 Low from validation notes; PO CLOSE yes — formal qa-engineer gate pending) |

**QA handoff (non-blocking):** add `qa.checks.genericAvatarNotOwner.failOwnerClaim` EN/ES when US-10.1 surfaces evidence to Operators; US-5.1 consume `visualModeSummary.mustDiscloseNotOwner` + `buildGenericDisclosurePromptHint`; US-10.1 import `evaluateGenericAvatarNotOwnerCheck` + blocking class; US-11.1 reuse `legal.genericAvatarDisclosure` + `GenericAvatarDisclosurePreview`. Per-slot Modalidad re-evaluation deferred to US-4.x.

**Module milestone:** **US-3.4 closes Fase 1 Preferencias** (US-3.1–US-3.4). Next: Phase 1 integration report or Phase 2 (Estrategia y guiones).

---

## Scope in

| Area | What 3.4 adds |
|------|----------------|
| **FE** | Stronger **warning copy** on Preferencias when **Avatar genérico profesional** is selected (EN/ES); optional severity upgrade from info → warn. **Disclosure preview stub** component (canonical on-video / on-approval disclosure text) exportable for US-11.1 — may live as isolated component + Storybook-less dev preview or placeholder on dashboard if Operator approval route absent. |
| **BE** | **Enforce** server-owned `rules.must_disclose_not_owner` on read/write paths (upsert already derives — verify SELECT/read-back, repair drift if any). **Extend** `getBusinessProfileForAgents.visualModeSummary` (or adjacent server field) to include `mustDiscloseNotOwner` / `rules` for Script + QA agents — never from client input. Export **`checkGenericAvatarNotOwnerImpersonation`** (or CONTRACT name) + **`QA_CHECK_CLASS.blocking`** registration stub for US-10.1; unit tests with fixture scripts (pass/fail samples). Optional **`getRequiredGenericDisclosureText(locale)`** helper for FE approval stub + future US-11.1. |
| **DB** | **No new table** — consume existing `neuramark_visual_preferences.rules` jsonb (US-3.1). Optional migration only if CONTRACT needs CHECK constraint / default repair — **PO lean:** no migration; enforce in server layer only. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **Full US-10.1 QA agent** | No LLM QA job, no `neuramark_qa_reports` table, no QA report panel UI — export **check function + classification stub** only. |
| **Full US-11.1 Operator / Client approval screen** | No video player, caption package, approve/reject flow — **disclosure preview stub** component only if approval route does not exist. |
| **US-10.2 override UI / handler** | Non-overridable class **documented + stub constant**; override rejection logic ships in US-10.2. |
| **Per-slot Modalidad de producción** | SPEC: flag applies when **slot uses generic** — slot assignment is US-4.x. V1 proxy: allowlist contains `generic_avatar` ⇒ `must_disclose_not_owner = true` at Preferencias level; job/agent consumers use DTO flag until per-slot modality exists. |
| **US-3.2 / US-3.3 reopen** | Consent ledger and reference uploads unchanged. |
| **Generic avatar catalog / `generic_avatar_id`** | Nullable stub stays null in V1; no catalog picker. |
| Auth redesign / browser Supabase | Unchanged. |

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-3.1 | `deriveVisualPreferencesRules`; upsert persists `rules`; FORBIDDEN client keys; Preferencias DTO includes `rules`; FE `disclosureNote` info `Message` when generic selected or server rule true. |
| US-3.2 / US-3.3 | Consent + reference assets — orthogonal; do not conflate with generic disclosure. |
| US-2.3 | `getBusinessProfileForAgents` + `visualModeSummary: { allowedModes }` — **widen** with disclosure flag; keep consent internals omitted. |
| SECURITY_BASELINE | Generic-avatar impersonation = **blocking** legal class (same family as missing consent). |

**US-3.4 completes the generic-avatar disclosure contract** — from silent server stub to agent-visible flag + QA stub + approval preview hook.

## Canonical terms (CONTEXT)

Use **Avatar genérico profesional**, **Preferencias de producción visual**, **Cliente**, **Operator**, **disclosure** (product copy — presenter is not the business owner).  
_Evitar:_ generic_avatar (in product copy — OK as enum), avatar mode / visual preferences (as entity names), impersonation (prefer “presenter is not the owner” in Cliente copy), Business Profile / perfil de negocio, admin / staff.
