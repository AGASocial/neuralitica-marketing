# owner-home-dashboard Specification

## Purpose
Owner Inicio home dashboard: one next action, this-week status counts, campaign progress, results or Instagram empty state, recent videos, and compact shortcuts — read-only, plain language, EN/ES (KAN-98, ADR-0009 plumber principle).

## Requirements

### Requirement: Next action card
The owner Home page SHALL show a single primary next-action card derived from campaign progress (interview → plan → write-ups → videos → approve → ready), with plain-language title/body and one CTA that either opens orchestrator chat or deep-links to the relevant existing page. The card MUST NOT include spend, publish, or avatar-generation actions.

#### Scenario: Pending video approval
- **WHEN** the owner has videos waiting for their OK
- **THEN** the next-action CTA deep-links to My campaign (`/approvals`) or opens chat with that intent, and no mutating control runs from Home

#### Scenario: Interview incomplete
- **WHEN** the business interview is not completed
- **THEN** the next-action CTA links to `/interview` (or opens chat for interview help)

### Requirement: This week status counts
Home SHALL show this week’s status as big labeled numbers for at least: scheduled, published, waiting for my OK, and in production, using server-side data for the current ISO week, with a traffic-light overall status and a last-updated timestamp. Counts MUST be scoped to the current user’s client.

#### Scenario: Waiting for OK
- **WHEN** the owner has pending approval packages
- **THEN** the “waiting for my OK” count equals that pending count

### Requirement: Campaign progress
Home SHALL show month/week campaign progress as “X of Y videos” (plain words), where Y is the planned slot count from the current week’s strategy when present, and X is videos completed toward that plan (published and/or ready). When no plan exists, Home SHALL show a friendly empty progress state rather than jargon or tables.

#### Scenario: Approved plan with slots
- **WHEN** an approved (or draft) strategy exists for the current week with N slots
- **THEN** progress shows X of N with X ≤ N

### Requirement: Results empty without Instagram insights
Home SHALL show a Results section. When Instagram insights data is not available in the product database/integration, Results MUST render a friendly empty state (ES: connect Instagram to see results / EN equivalent) and MUST NOT call Instagram Graph APIs to publish or invent metrics. Operator-only manual reel metrics MUST NOT be presented as Instagram insights.

#### Scenario: No insights integration
- **WHEN** the owner opens Home and insights are unavailable
- **THEN** Results shows the connect-Instagram empty state and no reach/views/follower charts

### Requirement: Recent videos and Atajos
Home SHALL include a recent-videos strip of ready/approved videos (read-only links) and a compact Atajos section preserving shortcuts to interview, living profile, visual preferences, My campaign, and My videos. Home MUST NOT be primarily a large menu-card grid.

#### Scenario: Atajos remain reachable
- **WHEN** the owner scrolls Home
- **THEN** Atajos still links to the previous dashboard destinations without spend/publish controls

### Requirement: Server loaders with zod
Owner Home data SHALL be loaded on the server through zod-validated DTOs. Localization MUST use `messages/{en,es}.json` and `resolveRequestLocale`.

#### Scenario: Locale ES
- **WHEN** the request resolves to Spanish
- **THEN** Home section titles and empty states render from the ES catalog
