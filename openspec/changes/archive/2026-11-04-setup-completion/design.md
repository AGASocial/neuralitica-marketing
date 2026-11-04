# Design

## Context

See proposal.md. Detection helpers already exist for profile, interview, preferences, strategy approval, and presenter (`getPresenterSetupStatus`). No Instagram connect table/API yet.

## Goals / Non-Goals

**Goals:** Single pure-ish compute function + Home UI + chat tool sharing it; plain EN/ES; optional presenter excluded from %.

**Non-Goals:** Multi-page wizard (KAN-100); Instagram Graph connect implementation; mutations from checklist.

## Decisions

1. **Required steps (count toward %):** `business_profile`, `interview`, `visual_preferences`, `instagram_connected`, `plan_approved`.
2. **Optional:** `presenter_avatar` — shown in checklist, excluded from percentComplete.
3. **Instagram:** `done: false` always until a real connect checker exists; href `/settings/preferences` or Home results copy — prefer a stable path; use `/dashboard` anchor or preferences with note. Link label “Hacerlo”; body explains connect is not available yet → use chat / stay honest. Href: keep `/settings/preferences` is weak; better deep-link none and open chat? Spec says “Hacerlo” links — use `/dashboard` Results section isn’t a route. Use chat open via `ctaKind: open_chat` for Instagram, or href `#` — prefer `open_chat` for Instagram step and `/profile`, `/interview`, `/settings/preferences`, chat for plan, presenter via `/settings/preferences` or chat.
4. **Percent:** `Math.round(100 * requiredDone / requiredTotal)`.
5. **Hide on Home** when `percentComplete === 100`.
6. **Tool** `getSetupStatus`: empty input; output mirrors compute DTO; system prompt: call when user asks what’s missing / qué me falta.

## Risks / Trade-offs

- [Instagram always incomplete] → Document; KAN-100 hybrid notes checklist as spine; do not fake connected.
- [Plan is week-scoped] → “plan approved” = current ISO week strategy approved (same as guided progress).

## Migration Plan

None.
