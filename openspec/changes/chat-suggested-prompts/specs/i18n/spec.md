## ADDED Requirements

### Requirement: Suggested prompt chip strings in catalogs
Owner-facing orchestrator suggested prompt chip labels (fixed capability question and state-dependent prompts) and related chip list accessibility copy SHALL come from `messages/{en,es}.json` under `orchestratorChat`, resolved with the page/chat locale (locale cookie / `resolveRequestLocale` alignment). UI MUST NOT hardcode those chip strings when catalog keys exist.

#### Scenario: Spanish chips
- **WHEN** the resolved locale is `es`
- **THEN** the fixed first chip reads “¿Qué puedes hacer por mí?” and state-dependent chips use Spanish catalog strings

#### Scenario: English chips
- **WHEN** the resolved locale is `en`
- **THEN** the fixed first chip reads “What can you do for me?” and state-dependent chips use English catalog strings
