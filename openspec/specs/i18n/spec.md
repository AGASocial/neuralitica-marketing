# i18n Specification

## Purpose

Serve English and Spanish UI copy from translation files and resolve locale consistently for owner pages and chat. Related: ADR-0008 (copy in messages), ADR-0009 (chat locale).

## Requirements

### Requirement: Translation catalogs
User-facing strings SHALL live in `messages/en.json` and `messages/es.json` (and helpers such as `getTranslations`); UI MUST NOT hardcode owner-facing copy in components when a catalog key exists (ADR-0008).

#### Scenario: Locale switch changes labels
- **WHEN** the resolved locale is `es`
- **THEN** nav, dashboard cards, and chat chrome render Spanish catalog strings

#### Scenario: Locale switch to English
- **WHEN** the resolved locale is `en`
- **THEN** the same surfaces render English catalog strings

### Requirement: Owner pages use resolveRequestLocale
Owner-facing pages (dashboard, interview, profile, preferences, approvals, ready-to-publish) SHALL call `resolveRequestLocale` so locale resolves in this order: `?locale=` (middleware header), then the `neuramark_locale` cookie, then saved `preferredLocale`, then default `es`.

#### Scenario: Query overrides preferred locale
- **WHEN** the user has `preferredLocale=es` but opens a page with `?locale=en`
- **THEN** the page MUST render English

#### Scenario: Preferred locale without query
- **WHEN** no locale query is present and no locale cookie is set
- **THEN** the page MUST use `resolveLocale(preferredLocale)` (defaulting to `es` when unset)

#### Scenario: Query overrides cookie and preference
- **WHEN** the user has cookie/preference `es` but opens a page with `?locale=en`
- **THEN** the page MUST render English

#### Scenario: Cookie without query
- **WHEN** no locale query is present and cookie `neuramark_locale=es` is set
- **THEN** the page MUST render Spanish even if `preferredLocale` is `en`

#### Scenario: Default Spanish
- **WHEN** no query, cookie, or valid preferred locale is present
- **THEN** the page MUST render Spanish

### Requirement: Chat body locale
Chat requests SHALL resolve locale via `resolveChatBodyLocale` (body locale if valid, else preferred), keeping chat chrome aligned with the page when possible (ADR-0009).

#### Scenario: Chat with explicit body locale
- **WHEN** the client posts a chat message with `locale: "es"`
- **THEN** proposal summaries and system prompt language follow Spanish

### Requirement: Mis videos page strings resolve in Spanish
Owner-facing `/ready-to-publish` copy (title, section headings, empty states, CTAs, status labels) SHALL come from `messages/{locale}.json` via `resolveRequestLocale` so `?locale=es` renders Spanish, including new hub section strings.

#### Scenario: locale=es on Mis videos
- **WHEN** an owner opens `/ready-to-publish?locale=es`
- **THEN** visible page chrome and section titles are Spanish from `messages/es.json`

### Requirement: Operator Advanced pages use resolveRequestLocale
Operator Advanced pages under `/operator/*` (at minimum `/operator/calendar`) SHALL call `resolveRequestLocale` so `?locale=` (middleware header) wins over saved `preferredLocale`, with copy from `messages/{locale}.json`.

#### Scenario: locale=es on Operator calendar
- **WHEN** an Operator opens `/operator/calendar?locale=es`
- **THEN** calendar page chrome and status labels render Spanish from `messages/es.json`

#### Scenario: Preferred locale without query on calendar
- **WHEN** no locale query is present on `/operator/calendar`
- **THEN** the page MUST use `resolveLocale(preferredLocale)`

### Requirement: Login does not force English query
Successful login redirect SHALL NOT append `?locale=en` (or any locale query). Locale after login SHALL follow cookie / preference / default `es`.

#### Scenario: Login lands without locale query
- **WHEN** an active client logs in from `/login` with no locale query
- **THEN** the redirect target is `/dashboard` (or sanitized `next`) without a forced `locale` search param

### Requirement: Language selector persists cookie
Changing language from the user menu (or auth locale controls that opt in) SHALL set the `neuramark_locale` cookie so subsequent navigations without `?locale=` keep the chosen language for server components.

#### Scenario: User menu language selection
- **WHEN** the owner selects Español in the user menu
- **THEN** cookie `neuramark_locale` is set to `es` and a refresh shows Spanish chrome without `?locale=`

### Requirement: Approvals list and disclosure strings localized
Owner-facing `/approvals` list copy for card summary, untitled fallback, disclosure chip, and disclosure tooltip SHALL come from `messages/{en,es}.json`. Spanish owners MUST see plain-language Spanish (e.g. “Revisa este video antes de publicarlo”, “Aviso de IA”), not English jargon chips.

#### Scenario: Spanish approvals list chrome
- **WHEN** locale is `es` on `/approvals`
- **THEN** card summary and disclosure chip/tooltip resolve from `messages/es.json`
