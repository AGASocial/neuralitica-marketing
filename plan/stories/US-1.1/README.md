# US-1.1 — Start guided business interview

Cliente starts a step-by-step **Entrevista inicial** (servicios, zona, tono, ofertas, objeciones, estilo, restricciones). Progress, per-step validation, EN/ES. Draft answers persist as structured JSON on `neuramark_interview_sessions` so the wizard can continue in the same sitting and survive refresh. Identity only via `getCurrentUser()` / `requireActive()`; no `client_id` from the browser.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-1.1 (do not redefine)

**This folder:** [`plan/stories/US-1.1/`](./) — `TASKS.md` (this PREP). `SECURITY.md` and `CONTRACT.md` are authored in later gates, not here.

**Depends on (runtime, already shipped):** [US-14.5](../US-14.5/) (`getCurrentUser()` session + `neuramark_clients`, `requireActive()`, `(app)` layout) · product dashboard CTA copy already exists (`dashboard.interviewCard`). Story text still says **Depends on: none**.

**Unblocks:** [US-1.2](../../USER_STORIES.md) (save & resume UX) · [US-1.3](../../USER_STORIES.md) (submit → **Ficha viva**)
