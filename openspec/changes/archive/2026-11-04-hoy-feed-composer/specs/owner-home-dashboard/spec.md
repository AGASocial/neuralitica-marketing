## MODIFIED Requirements

### Requirement: Next action card
The Hoy page SHALL surface exactly one primary next action inside the **Próximo / Next** block (derived from campaign progress: interview → plan → write-ups → videos → approve → ready), with plain-language title/body and one CTA that either opens the layout compositor / conversation panel or deep-links to the relevant existing page. The card MUST NOT include spend, publish, or avatar-generation actions.

#### Scenario: Pending video approval
- **WHEN** the owner has videos waiting for their OK
- **THEN** the next-action CTA deep-links to Campaña (`/approvals`) or opens chat with that intent, and no mutating control runs from Hoy alone without Approve

#### Scenario: Interview incomplete
- **WHEN** the business interview is not completed
- **THEN** the next-action CTA links to `/interview` (or opens chat for interview help)

### Requirement: Results empty without Instagram insights
Hoy SHALL show a **Resultados / Results** block. When Instagram insights data is not available in the product database/integration, Results MUST render a friendly empty state and MUST NOT call Instagram Graph APIs to publish or invent metrics. Operator-only manual reel metrics MUST NOT be presented as Instagram insights.

#### Scenario: No insights integration
- **WHEN** the owner opens Hoy and insights are unavailable
- **THEN** Results shows the connect-Instagram empty state and no reach/views/follower charts

### Requirement: Setup completion on Home
Hoy SHALL include a compact setup completion card from the `setup-completion` capability when required percent complete is below 100, and MUST hide that card when required setup is fully complete.

#### Scenario: Show incomplete setup
- **WHEN** the owner opens Hoy and required setup is incomplete
- **THEN** a compact setup progress card is visible in the feed

#### Scenario: Hide complete setup
- **WHEN** required setup percent is 100
- **THEN** the setup progress card is not rendered

## ADDED Requirements

### Requirement: Hoy feed four blocks
Owner Hoy (`/dashboard`) SHALL present four feed blocks in order: Needs your OK, What I did, Next, and Results. The page MUST NOT be primarily a large KPI grid or Atajos-first layout.

#### Scenario: Pending approvals as AgentCards
- **WHEN** the owner has pending approval packages
- **THEN** Needs your OK renders them via `AgentCard` with Approve and Change (Change opens conversation anchored to that card)

#### Scenario: Approve still requires explicit action
- **WHEN** a pending reel card is shown on Hoy
- **THEN** no domain mutation occurs until the owner activates Approve (existing Server Actions)

### Requirement: Proactive card budget
Hoy SHALL limit proactive actionable cards (pending OK + suggested next-step style cards) to at most **5** total on the feed. Timeline “what I did” entries are narrative and do not count toward that budget unless they expose Approve/Change.

#### Scenario: Many pending approvals
- **WHEN** more than five pending approvals exist
- **THEN** Hoy shows at most five proactive cards and offers a path to see the rest (e.g. Campaña / Approvals)

### Requirement: Server loaders with zod for Hoy
Hoy feed data SHALL be loaded on the server through zod-validated DTOs. Localization MUST use `messages/{en,es}.json` and `resolveRequestLocale`. Labels SHALL use Hoy/Today naming.

#### Scenario: Locale ES
- **WHEN** the request resolves to Spanish
- **THEN** Hoy section titles and empty states render from the ES catalog

## REMOVED Requirements

### Requirement: This week status counts
**Reason**: Option C Hoy replaces the KPI “this week” strip with feed blocks (Needs OK / What I did / Next).
**Migration**: Waiting-for-OK items appear in Needs your OK; scheduled items appear in Next.

### Requirement: Campaign progress
**Reason**: Progress is reflected via Next + timeline rather than a separate “X of Y videos” KPI card.
**Migration**: Next block and setup card cover remaining work.

### Requirement: Recent videos and Atajos
**Reason**: Hoy prioritizes agent feed; full archive remains on Videos (`/ready-to-publish`); business shortcuts live under Negocio.
**Migration**: Deep links via next action, Conversación, and tab bar.
