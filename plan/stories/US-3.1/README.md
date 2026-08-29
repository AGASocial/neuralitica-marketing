# US-3.1 — Choose visual production mode

**Status:** PREP (active) — branch `feature/US-3.1-visual-mode`.

**As a** Cliente, **I want** to pick how my Reels will look (own avatar, generic avatar, or faceless), **so that** content matches my comfort and brand rules.

Ship **Preferencias de producción visual**: Cliente configures which production modalities they accept (Avatar propio autorizado · Avatar genérico profesional · Video sin rostro / B-roll), with clear product copy, EN/ES, and server persistence. Modes that are unavailable (e.g. Avatar propio without Consentimiento de avatar) are disabled in UI **and** rejected server-side. Changing preferences **must not** silently regenerate in-flight content. No mode ever requires the Cliente to record video or audio (roadmap hard rule). Faceless captures a `faceless_style` preference. Sibling consent ledger UI/API (US-3.2), reference uploads (US-3.3), and QA disclosure flags UI (US-3.4) stay **out** — soft stubs / gates only where SEC requires.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-3.1 (do not redefine; do **not** mark done in PREP)

**This folder:** [`plan/stories/US-3.1/`](./) — `README.md` + `TASKS.md` (this PREP). `SPEC-REVIEW.md`, `SECURITY.md`, and `CONTRACT.md` are authored in later gates, not here.

**Depends on:** [US-2.1](../US-2.1/) ✅ CLOSED — Ficha viva exists (Cliente has a profile context). Runtime identity: [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`). Continuity: [US-2.2](../US-2.2/) ✅ PATCH must **not** write Preferencias; [US-2.3](../US-2.3/) ✅ `visualModeSummary: null` stub until this story populates Preferencias for agents.

**Unblocks:** [US-3.2](../../USER_STORIES.md) (Consentimiento de avatar) · [US-3.3](../../USER_STORIES.md) (reference assets) · [US-3.4](../../USER_STORIES.md) (generic disclosure rules) · Content Strategy / cost policy / talking-head jobs that require Preferencias allowlist (later phases).

---

## Scope in

| Area | What 3.1 adds |
|------|----------------|
| **FE** | Preferencias UI: mode selector with explanations/examples; disable unavailable modes (esp. Avatar propio without consent); capture faceless style preference; show current stored preferences in settings; EN/ES. No human recording UX. |
| **BE** | Persist Preferencias (`visual_mode` enum values as technical tokens: `own_avatar` \| `generic_avatar` \| `faceless`); attach mode rules stubs as needed for CONTRACT; server-validate enum; **reject `own_avatar` without active consent** (soft gate vs missing US-3.2 table); no silent job/regenerate on save; revalidate settings surface. Optionally populate US-2.3 `visualModeSummary` from stored Preferencias (CONTRACT freezes). |
| **DB** | New `neuramark_*` Preferencias table (story shorthand `visual_preferences`; SPEC name `neuramark_visual_preferences` — freeze in CONTRACT): `client_id`, mode / allowlist columns, `generic_avatar_id`, `faceless_style`, `updated_at` (+ rules stub if CONTRACT needs for US-3.4 continuity). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-3.2 full Consentimiento ledger** | Append-only `avatar_consents` UI/API, revoke, re-consent versions — **out**. US-3.1 only **checks** active consent (or soft-fails if table absent) when selecting `own_avatar`. |
| **US-3.3 uploads** | Reference photos/clips, `media_assets`, virus/size validation — **out**. Copy may say own-avatar uses uploaded references later; no upload UI here. |
| **US-3.4 QA agent flags UI** | Disclosure preview on approval, QA fail scripts — **out**. May set server-side rule stubs (e.g. `must_disclose_not_owner`) on generic selection if CONTRACT needs; no QA agent wiring. |
| **Modalidad de producción per Reel / Estrategia** | SPEC: slot modality assigned weekly by Strategy within allowlist — later (US-4.x). This story owns **Cliente Preferencias** only. |
| **US-2.2 / Ficha viva PATCH** | Do not reopen `/profile` edit allowlist; Preferencias are a **separate** surface and store. |
| **Talking-head / B-roll / TTS jobs** | US-8.x / US-9.x — do not enqueue generation from preference save. |
| Auth redesign / browser Supabase | Unchanged. Keep settings path off `isPublicPath`. |

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-2.1 | Cliente Ficha viva at `/profile`; identity arity 0. Preferencias are **not** on the Ficha viva edit surface. |
| US-2.2 | PATCH strips/rejects Preferencias / `visual_mode` even if smuggled — keep that bar. |
| US-2.3 | Agents DTO has `visualModeSummary: null` until Preferencias exist — extend when CONTRACT freezes summary shape. |
| Auth US-14.5 | `requireActive` / `getCurrentUser()` for Cliente mutations and settings RSC. |

**US-3.1 adds Preferencias persistence + settings UI** — separate from Ficha viva fields; defense-in-depth consent check for `own_avatar`.

## Mode map (product ↔ technical enum)

| Product (CONTEXT) | Enum token (code/DB) | Notes |
|-------------------|----------------------|-------|
| Avatar propio autorizado | `own_avatar` | Requires Consentimiento (US-3.2); soft-reject if no active consent |
| Avatar genérico profesional | `generic_avatar` | Disclosure rules owned by US-3.4; optional rule stub here |
| Video sin rostro / B-roll | `faceless` | Stores `faceless_style` (voice + text + stock/B-roll) |

## Canonical terms (CONTEXT)

Use **Preferencias de producción visual**, **Modalidad de producción** (when referring to per-slot assignment — future), **Cliente**, **Operator**, **Avatar propio autorizado**, **Avatar genérico profesional**, **Video sin rostro** / **B-roll / sin presencia**, **Consentimiento de avatar**, **Ficha viva**.  
_Evitar:_ avatar mode / visual preferences (as entity names), visual mode selector, single mode, production mode, own_avatar / generic_avatar / faceless (in product copy — OK as enum), consent ledger (in product copy), Business Profile / perfil de negocio, admin / staff.

## Ready for SPEC?

**Yes, with one known tension for spec-guardian.** SPEC §3 S3.M4 already names Preferencias (multi-selección allowlist), table `neuramark_visual_preferences`, no human recording, change preferences does not silent-regenerate, reject own-avatar without consent. USER_STORIES § US-3.1 AC remain the checkbox source of truth but describe a single `visual_mode` column — **SPEC wins until amended**; open question #1 below. Remaining open questions are SECURITY/CONTRACT freezes (route, `faceless_style` shape, consent soft-gate, regenerate proof), not blockers to start SPEC-REVIEW.
