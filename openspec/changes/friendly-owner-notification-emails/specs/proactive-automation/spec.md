## Purpose

Owner-configurable proactive automation around pending approvals: presets, spend caps, auto-approve evaluation (F0 dry-run), reminders, and batched notifications without Instagram publish or weekly-cycle live spend.

## MODIFIED Requirements

### Requirement: Email notifications behind flags
Owner approval emails SHALL use Resend via a server-only module. Sending MUST be gated by `OWNER_EMAIL_NOTIFICATIONS_ENABLED` (default off). Recipients MUST be filtered by `NOTIFICATIONS_TEST_ALLOWLIST` when set. From-address comes from `NOTIFICATIONS_FROM_EMAIL` / configured sender. Emails MUST only go to allowlisted addresses during test (gaveho@gmail.com).

**NEW:** Emails SHALL include HTML templates with Neuralitica logo hosted at `${SITE_URL}/email/neuralitica-logo.png`, friendly headline, body text, CTA button (Campaña butter `#F2C94C`), secondary link, and footer. Both `html` and `text` versions MUST be sent to Resend. Email copy SHALL be warm and human-friendly (no pressure tone).

#### Scenario: Flag off
- **WHEN** `OWNER_EMAIL_NOTIFICATIONS_ENABLED` is not true
- **THEN** no Resend API call is made; Hoy feed notification may still be created

#### NEW Scenario: HTML email with logo and CTA
- **WHEN** an owner notification email is sent (pending approval or reminder)
- **THEN** the email includes the Neuralitica logo, friendly headline, warm body text, and a CTA button linking to `/approvals/${approvalId}`
- **AND** both HTML and plain-text versions are sent
