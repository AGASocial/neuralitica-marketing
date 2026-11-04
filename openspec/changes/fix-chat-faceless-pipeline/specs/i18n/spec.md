## ADDED Requirements

### Requirement: Mis videos page strings resolve in Spanish
Owner-facing `/ready-to-publish` copy (title, section headings, empty states, CTAs, status labels) SHALL come from `messages/{locale}.json` via `resolveRequestLocale` so `?locale=es` renders Spanish, including new hub section strings.

#### Scenario: locale=es on Mis videos
- **WHEN** an owner opens `/ready-to-publish?locale=es`
- **THEN** visible page chrome and section titles are Spanish from `messages/es.json`
