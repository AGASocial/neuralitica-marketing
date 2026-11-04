## MODIFIED Requirements

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

## ADDED Requirements

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
