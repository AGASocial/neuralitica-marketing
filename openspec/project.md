# neuralitica-marketing — OpenSpec project context

> Canonical machine-readable context lives in `openspec/config.yaml`.
> This file is a human-readable index for agents and reviewers.

## Stack

- Next.js App Router on Vercel; Supabase Postgres (server-only; `neuramark_` prefix)
- EN/ES i18n via `messages/{en,es}.json` + `resolveRequestLocale`
- Tailwind CSS v4 + shadcn/ui (Campaña) — ADR-0008
- Orchestrator chat — AI SDK v7 + AI Gateway — ADR-0009
- Avatar/media: HeyGen direct v3, ElevenLabs TTS, B-roll via AI Gateway — ADR-0007
- Long jobs: Fly.io worker + FFmpeg — ADR-0003

## Conventions

- Identity only through server `getCurrentUser()` / `requireActive`
- No Supabase clients or keys in the browser
- Owner-facing copy: plain language; technical details under Operator **Advanced**
- Specs here describe **current** code behavior; SPEC.md/ADRs may lead

## Product principles

- SC-2: no Instagram publish without explicit Cliente approval
- No auto-spend from chat; paid media/TTS needs confirm cards
- Graph publish remains V1 scope (D1 / ADR-0002) even if UI is download-first today

## ADR index

| ADR | Topic |
|-----|--------|
| [0001](../docs/adr/0001-ciclo-semanal-automatizado.md) | Weekly cycle automation |
| [0002](../docs/adr/0002-publicacion-reels-instagram-api.md) | Instagram Graph Reels publish |
| [0003](../docs/adr/0003-worker-flyio-ffmpeg.md) | Fly.io FFmpeg worker |
| [0007](../docs/adr/0007-avatar-video-pipeline.md) | Avatar / TTS / duration policy |
| [0008](../docs/adr/0008-ui-tailwind-shadcn-campana.md) | UI stack Campaña |
| [0009](../docs/adr/0009-orchestrator-chat.md) | Orchestrator chat |

## Capability specs

| Spec | Path |
|------|------|
| onboarding | `openspec/specs/onboarding/spec.md` |
| campaign-plan | `openspec/specs/campaign-plan/spec.md` |
| scripts | `openspec/specs/scripts/spec.md` |
| reel-production | `openspec/specs/reel-production/spec.md` |
| approvals-and-cost-confirmation | `openspec/specs/approvals-and-cost-confirmation/spec.md` |
| orchestrator-chat | `openspec/specs/orchestrator-chat/spec.md` |
| presenter-avatar-settings | `openspec/specs/presenter-avatar-settings/spec.md` |
| publishing-instagram | `openspec/specs/publishing-instagram/spec.md` |
| i18n | `openspec/specs/i18n/spec.md` |
| ui-shell-nav | `openspec/specs/ui-shell-nav/spec.md` |
