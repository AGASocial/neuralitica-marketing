## ADDED Requirements

### Requirement: Empty-state suggested prompt chips
When the orchestrator conversation has no user messages, the chat UI SHALL show suggested prompt chips under the greeting. Clicking a chip SHALL send that chip’s text as a user message. Chips MUST hide once any user message exists. Layout MUST be mobile-friendly (wrap, ≥44px tap targets, horizontal scroll when needed). Chips MUST NEVER start paid generation or Instagram publish directly.

#### Scenario: Chips visible on empty transcript
- **WHEN** the conversation has zero user messages
- **THEN** suggested prompt chips are visible under the greeting

#### Scenario: Chip click sends user message
- **WHEN** the owner taps a suggested prompt chip
- **THEN** that chip’s text is sent as a user message and the chips hide

#### Scenario: Chips hidden after user message
- **WHEN** the conversation includes at least one user message
- **THEN** suggested prompt chips MUST NOT be shown

### Requirement: Suggested chip selection (fixed + state-dependent)
The first chip SHALL always be the locale-aware capability question. The system SHALL add 3–5 additional chips computed server-side from setup completion and campaign status. Selection MUST exclude chips that would trigger spend without a cost card.

#### Scenario: Incomplete setup and pending approvals with approved plan
- **WHEN** setup percentComplete is 80, pending approvals count is 4, and an approved plan exists for the week
- **THEN** chips include the fixed capability question, finish-setup, show-pending-approvals, and how-is-campaign (not make-weekly-plan)

#### Scenario: No approved plan
- **WHEN** there is no approved plan for the week
- **THEN** chips include the make-weekly-plan prompt and MUST NOT include how-is-campaign for that week

#### Scenario: Missing scripts with approved plan
- **WHEN** an approved plan exists and video write-ups are still missing
- **THEN** chips include the write-scripts prompt

### Requirement: Capability overview answer and follow-up chips
When the owner asks the fixed capability question, the assistant SHALL answer with a short plain-language ~5-bullet overview (weekly plan, write-ups, videos with or without their face, review/approve, configure business) and SHALL surface follow-up next-step chips via a read-only tool. That tool MUST NOT mutate, spend, or publish.

#### Scenario: What can you do overview
- **WHEN** the owner sends the fixed capability-question chip text
- **THEN** the assistant replies with a short ~5-bullet plain-language overview and follow-up suggested-action chips from the read-only tool

#### Scenario: Follow-up chip does not spend
- **WHEN** the owner taps a follow-up suggested-action chip from the capability overview
- **THEN** that text is sent as a normal user message and any later paid work still requires an existing cost confirmation card
