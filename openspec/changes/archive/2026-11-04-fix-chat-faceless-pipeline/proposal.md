# Proposal

## Why

Prod e2e showed approving the faceless chat cost card enqueues a single b-roll job and stops — no TTS, assembly, branding, or owner-visible preview. “Mis videos” only lists approved reels (pending/in-production invisible), `/ready-to-publish` can still render English under `locale=es`, “Nueva conversación” is client-only so reloads restore the old thread, and Home “Actualizado” formats in UTC with a duplicated next-action label.

## What Changes

- Chat faceless Approve runs the full images-and-text pipeline reused from weekly-cycle/operator primitives: duration-covering b-roll clips + TTS + assembly + branding (existing auto-chain), with the cost card showing **total** estimate (b-roll × N + TTS) before Approve.
- After b-roll jobs for a script complete (and voiceover exists), lib advances to assembly without requiring a weekly-cycle step_run (Fly workers still only poll/run jobs).
- `/ready-to-publish` (“Mis videos”) becomes a three-section hub: in production, waiting for OK (inline video + Aprobar/Cambiar), ready to publish (download). Chat preview uses the latest assembled/pending package with inline video.
- Translate Mis videos / ready-to-publish copy for `locale=es`; persist “Nueva conversación” server-side; format Home last-updated in the browser timezone; fix duplicated “Qué hacer ahora” label/aria.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `orchestrator-chat`: Faceless paid confirm total estimate + full pipeline; new conversation persistence; video preview from latest assembled reel.
- `reel-production`: B-roll clip count covers target duration; post-b-roll assembly advance for non–weekly-cycle jobs.
- `approvals-and-cost-confirmation`: Mis videos hub lists in-production, pending OK, and approved/ready-to-publish.
- `i18n`: ready-to-publish / Mis videos strings complete and resolved under `locale=es`.
- `owner-home-dashboard`: Client-timezone last-updated; single next-action section label.

## Impact

- `lib/orchestrator-chat/**`, `lib/video-jobs/**`, `lib/assembly/**` (completion hook only), `lib/approvals/**`, `app/(app)/ready-to-publish/**`, `components/ready-to-publish/**`, `components/orchestrator-chat/**`, `components/dashboard/**`, `messages/{en,es}.json`, offline tests.
- No Instagram publish, no avatar generation, no paid provider calls in tests, no migrations unless unavoidable.
- Fly `worker/` code unchanged unless a shared `lib/` import used by workers needs redeploy after merge (`fly deploy` per OPERATIONS.md if so).
