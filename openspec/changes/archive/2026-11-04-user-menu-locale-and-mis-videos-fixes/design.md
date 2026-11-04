# Design: User menu locale + Mis videos pending + hydration

## Context

- Middleware currently copies only `?locale=` into `x-neuramark-locale`.
- `resolveLocale` and login page default to `en`; `LoginForm` appends `locale=` on redirect → `/dashboard?locale=en`.
- Test client `preferred_locale=en`; visiting `?locale=es` does not persist.
- Brand-completed assemblies exist for script `b8fa759b-…` with no QA reports, no captions, no approval rows. Batch ensure swallows `QA_GATE_NOT_READY` / caption errors → pending count 0.
- `DashboardView` formats `lastUpdatedAt` with `Intl` during SSR and first client paint → timezone/locale mismatch (#418).

## Goals / Non-Goals

- Goals: sticky Spanish-first locale without query; user menu; pending videos visible with authenticated media preview; no dashboard hydration text mismatches.
- Non-Goals: relaxing `decideApproval` QA gate; schema migrations; changing Instagram/publish flows.

## Decisions

1. **Cookie name `neuramark_locale`** — httpOnly=false so client can set via server action only (server sets cookie); path=/; SameSite=Lax; max-age ~1y. Cookie-only (no new DB column).
2. **Resolution** in `resolveRequestLocale`: query header → cookie → preferredLocale → `es`.
3. **Login** pushes bare `redirectTo` (no locale query). Auth pages resolve locale via cookie + default `es`. Optionally set cookie when rendering auth UI so post-login keeps Spanish.
4. **Soft ensure for list** — for each brand-completed assembly without an approval row, if strict ensure fails, `insertPendingApproval` when `status=completed`, `branding_status=completed`, and `output_media_asset_id` present. `toApprovalListItemDto` already soft-falls back without caption. Approve remains QA-gated.
5. **Hydration** — render last-updated only after mount (placeholder empty or static skeleton) with `suppressHydrationWarning` on the time node.
6. **Settings** — new `/settings` page linking to preferences (existing route).

## Risks / Trade-offs

- Soft-insert may create pending rows owners cannot approve until QA/caption exist; preview still works. Acceptable vs empty hub.
- Cookie overrides stale `preferred_locale=en` until they change language again — intended.

## Migration Plan

None. Cookie-only.
