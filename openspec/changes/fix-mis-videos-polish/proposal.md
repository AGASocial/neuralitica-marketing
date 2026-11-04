# Change: Mis videos polish + remaining dashboard hydration

## Why

Prod verification after #45 found three owner-facing polish bugs:

1. Mis videos “Esperando tu OK” cards show title “—” and badge “Aviso”, and all share the same clock time from soft-insert `createdAt` (approval row creation), not when the reel finished assembling.
2. React hydration error #418 still appears on `/dashboard` after login (desktop) — remaining timezone/locale-sensitive text in the dashboard + AppShell path.
3. Mobile header user-menu avatar must stay reachable on iPhone widths with aria-label “Menú de usuario” / “User menu”.

## What Changes

- Pending Mis videos cards show a real title (weekly plan slot `tema`, else reel script `hook`) and a meaningful format/modality badge (not the disclosure “Aviso” chip as the primary badge).
- Pending card date uses assembled reel completion time (`neuramark_assembled_reels.updated_at` when completed), not approval `created_at`.
- Dashboard + shell: any remaining Intl/timezone-dependent strings render only after client mount (stable placeholder during SSR/hydration) so #418 does not recur; cover header if needed.
- User menu trigger: reachable on narrow viewports; aria-label updated to “Menú de usuario” / “User menu”.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `approvals-and-cost-confirmation`: Mis videos pending card title, format badge, assembled date.
- `owner-home-dashboard`: remaining hydration-safe time rendering on Home / shell.
- `ui-shell-nav`: user menu aria-label + mobile reachability.

## Out of Scope

- Paid provider calls, migrations, secrets, Instagram publish, new DB tables, AVOS, orchestrator quarantine work.
