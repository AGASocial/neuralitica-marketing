## ADDED Requirements

### Requirement: Onboarding conversation copy
Onboarding Option A chrome (progress title, skip to Hoy, onboarding empty/greeting hints) SHALL come from `messages/{en,es}.json` and resolve via `resolveRequestLocale` / `neuramark_locale` like other owner pages.

#### Scenario: Spanish skip label
- **WHEN** locale is `es` on onboarding conversation
- **THEN** the skip control shows the Spanish catalog string (e.g. “Saltar a Hoy”)

#### Scenario: English skip label
- **WHEN** locale is `en` on onboarding conversation
- **THEN** the skip control shows the English catalog string (e.g. “Skip to Today”)
