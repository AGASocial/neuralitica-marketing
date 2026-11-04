## 1. Locale cookie + resolveRequestLocale

- [x] 1.1 Add `neuramark_locale` cookie helpers + `setLocalePreference` server action
- [x] 1.2 Update `resolveRequestLocale` / `resolveLocale` default `es`; login must not append locale query
- [x] 1.3 Auth pages resolve locale via cookie; set cookie when switching language

## 2. User menu + settings

- [x] 2.1 Build `UserMenu` dropdown (language radios, settings, logout) in `AppHeader`
- [x] 2.2 Add minimal `/settings` page; i18n strings EN/ES
- [x] 2.3 Fix dashboard last-updated hydration

## 3. Mis videos pending

- [x] 3.1 Soft-insert `pending_client` for brand-completed assemblies when strict ensure fails
- [x] 3.2 Ensure pending items expose authenticated media preview URL
- [x] 3.3 Tests for locale cookie order, login redirect, soft pending list, hydration

## 4. Validate + ship

- [x] 4.1 `npx openspec validate --all --strict`
- [ ] 4.2 Lint / typecheck / tests; PR; merge; archive change
