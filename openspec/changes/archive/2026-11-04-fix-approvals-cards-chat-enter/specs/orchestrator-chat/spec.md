## ADDED Requirements

### Requirement: Composer Enter sends message
The orchestrator chat composer SHALL send on Enter and insert a newline on Shift+Enter. It MUST ignore Enter while IME composition is active (`nativeEvent.isComposing` or `keyCode === 229`), MUST NOT send empty trimmed input, and MUST NOT send while the chat is busy (submitted/streaming/attach). The textarea SHALL autosize with input. Enter-to-send applies on mobile as well; the send button MUST remain visible on all viewports.

#### Scenario: Enter sends when ready
- **WHEN** the owner presses Enter with non-empty input and the chat is not busy or composing
- **THEN** the message is sent and the default newline is prevented

#### Scenario: Shift+Enter inserts newline
- **WHEN** the owner presses Shift+Enter
- **THEN** the composer does not send and allows a newline

#### Scenario: IME composition ignored
- **WHEN** Enter fires during IME composition (`isComposing` or keyCode 229)
- **THEN** the composer MUST NOT send
