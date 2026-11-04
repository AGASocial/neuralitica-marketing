## MODIFIED Requirements

### Requirement: Card-anchored Change
Activating Change / Cambiar on a Hoy (or other surface) `AgentCard` SHALL open the conversation panel with a visible user message of the form `Cambiar: <title>` (ES) or `Change: <title>` (EN) using the card title/context. The owner-visible message MUST NOT include the raw card UUID. The card id SHALL be supplied to the agent via hidden message metadata/context (not rendered in the transcript bubble).

#### Scenario: Change from Hoy card
- **WHEN** the owner activates Change on a pending reel card on Hoy
- **THEN** the conversation panel opens with a visible prefill `Cambiar: <title>` or `Change: <title>` and without a visible card UUID

#### Scenario: Agent receives card id
- **WHEN** Change is activated for a card with id `X`
- **THEN** the chat request/context includes card id `X` for the agent while the transcript text shown to the owner omits `X`
