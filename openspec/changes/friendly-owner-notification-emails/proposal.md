# Proposal

## Why

Owner notification emails currently render as bare plain text with minimal HTML (`<p>text</p>`). The 24h reminder email arrives from `Neuralitica <avisos-neuralitica@notification.aga.social>` with subject "Recordatorio: video pendiente de OK" and body "Llevo 24 horas con un video esperando tu aprobación." — no logo, no layout, no CTA button.

Gabriel requested friendlier, on-brand emails with the Neuralitica logo and better UX. Emails should feel warm and professional (Campaña brand), not like bare system alerts.

## What Changes

- Add hosted logo asset: `public/email/neuralitica-logo.png` (480×139 PNG, 59KB) accessible at `${SITE_URL}/email/neuralitica-logo.png`.
- Build reusable HTML email template function (`lib/notifications/email/templates.ts`) with shared layout: logo header, friendly headline, short body, primary CTA button (butter `#F2C94C`), footer.
- Update reminder emails (24h, 48h, 72h) and pending-approval first notification with:
  - Friendlier Spanish copy (warmer subjects, human tone, no pressure)
  - HTML template with logo + CTA button to `/approvals/${approvalId}`
  - Both `text` (plain) and `html` versions sent to Resend
- Preserve existing Resend/allowlist/idempotency behavior unchanged.
- Unit tests for template rendering (logo URL, CTA href, HTML escaping).

## Capabilities

### Modified Capabilities

- `proactive-automation`: owner notification emails now use HTML templates with logo, CTA buttons, and friendlier copy (ES/EN).

## Impact

- Files: `lib/notifications/email/templates.ts` (new), `lib/automation/run-reminders.ts`, `lib/automation/evaluate-pending.ts`, `public/email/neuralitica-logo.png` (new), tests.
- No changes to Resend config, allowlist, from-address, or idempotency keys.
- Out of scope: WhatsApp, web push, Hoy feed copy (unchanged), Instagram publish.
