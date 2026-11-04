# Change: User menu locale + Mis videos pending + dashboard hydration

## Why

Prod free-check bugs: login forces `?locale=en`, locale does not stick without the query param, Mis videos shows 0 in “Esperando tu OK” despite brand-completed assemblies, and `/dashboard` hits React hydration error #418 on the “Actualizado” timestamp. Owners also need a single user dropdown (language, settings, logout) instead of the signed-in strip.

## What Changes

- Replace header signed-in strip / avatar / logout with one shadcn `DropdownMenu` (avatar + name; name hidden on small screens).
- Persist locale via `neuramark_locale` cookie; `resolveRequestLocale` order: `?locale=` → cookie → `preferredLocale` → default `es`. Login MUST NOT append `?locale=en`.
- Language radio items call a server action that sets the cookie, then `router.refresh()`.
- “Configuración” → `/settings` (minimal general settings page); “Cerrar sesión” → existing logout.
- Mis videos / pending list: surface brand-completed assemblies awaiting owner OK even when strict ensure (QA/caption) fails — soft-insert `pending_client` when assembly is completed + branding completed + output present; keep QA gate on `decideApproval`.
- Fix dashboard last-updated hydration (client-only time after mount / `suppressHydrationWarning`).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `ui-shell-nav`: user dropdown replaces signed-in strip; settings + logout + language.
- `i18n`: cookie persistence, default Spanish, login must not force English query.
- `approvals-and-cost-confirmation`: Mis videos pending includes brand-completed assemblies without requiring QA/caption for row creation.
- `owner-home-dashboard`: last-updated timestamp must not hydrate-mismatch.

## Out of Scope

- Paid provider calls, Instagram, avatar generation, migrations (cookie-only locale), secrets, AVOS, orchestrator quarantine work.
