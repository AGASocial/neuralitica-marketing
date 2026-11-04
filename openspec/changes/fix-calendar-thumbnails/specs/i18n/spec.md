# i18n Specification

## ADDED Requirements

### Requirement: Operator Advanced pages use resolveRequestLocale
Operator Advanced pages under `/operator/*` (at minimum `/operator/calendar`) SHALL call `resolveRequestLocale` so `?locale=` (middleware header) wins over saved `preferredLocale`, with copy from `messages/{locale}.json`.

#### Scenario: locale=es on Operator calendar
- **WHEN** an Operator opens `/operator/calendar?locale=es`
- **THEN** calendar page chrome and status labels render Spanish from `messages/es.json`

#### Scenario: Preferred locale without query on calendar
- **WHEN** no locale query is present on `/operator/calendar`
- **THEN** the page MUST use `resolveLocale(preferredLocale)`
