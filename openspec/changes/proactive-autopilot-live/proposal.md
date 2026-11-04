# Proposal: Piloto automático real (KAN-108 F1)

## Why
F0 only logged `would_auto_approve`. Owners on Piloto automático / custom rules expect the agent to actually approve ready videos within their caps.

## What changes
- `runAutoApproveEngine` (pure, injected deps) approves pending items when the preset or a custom per-type rule allows it, within per-item and weekly spend caps.
- Approval uses the same transition as a human OK (`pending_client → approved` + `approval_ready_to_publish`). Never publishes.
- If the final video is not fully rendered (approving would require paid render) or the QA gate is not ready, the item is skipped and the owner is notified.
- Custom preset: per content type (`own_avatar`, `generic_avatar`, `faceless`) `auto` | `review`, editable in Ajustes → Automatización.
- Every automatic decision is logged (`auto_approved`, `auto_approve_skipped`) and shown in Hoy "Lo que hice".
- Kill switch `AUTOMATION_AUTO_APPROVE_DISABLED=true`; dry run `AUTOMATION_AUTO_APPROVE_DRY_RUN=true`.

## Out of scope
Instagram publishing, WEEKLY_CYCLE_LIVE, any paid generation.
