# UX analytics (KAN-107)

Owner activation events dual-write to **Vercel Analytics** (`track()`) and
Postgres table **`neuramark_ux_events`** (service-role insert via
`recordUxEvent` Server Action). RLS is enabled with zero policies
(deny-by-default for anon/authenticated).

## Event catalog

| Event | When | Notable props |
|-------|------|---------------|
| `hoy_visit` | Hoy (`/dashboard`) mounts | `acted=false` |
| `hoy_action` | Approve / Change / send from Hoy | `action`, optional `approval_id` |
| `chat_first_message` | First user message in a session | `source` = `chip` \| `typed`, optional `chip_id` |
| `approval` | Plan/video Approve succeeds | `device` mobile\|desktop, `ms_since_content_ready`, `first_approval_within_24h`, `kind` |
| `onboarding_step` | Option A onboarding enter / change | `step`, setup percent fields |

## Query recipes

```sql
-- Hoy visits vs actions (last 7 days)
SELECT
  date_trunc('day', created_at) AS day,
  count(*) FILTER (WHERE event = 'hoy_visit') AS visits,
  count(*) FILTER (WHERE event = 'hoy_action') AS actions
FROM public.neuramark_ux_events
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1;

-- Blank-page proxy: visits with no hoy_action same day (same client)
WITH visits AS (
  SELECT client_id, date_trunc('day', created_at) AS day
  FROM public.neuramark_ux_events
  WHERE event = 'hoy_visit'
),
actions AS (
  SELECT DISTINCT client_id, date_trunc('day', created_at) AS day
  FROM public.neuramark_ux_events
  WHERE event = 'hoy_action'
)
SELECT v.day, count(*) AS visits_without_action
FROM visits v
LEFT JOIN actions a USING (client_id, day)
WHERE a.client_id IS NULL
GROUP BY 1
ORDER BY 1;

-- Chat first-message sources
SELECT props->>'source' AS source, count(*)
FROM public.neuramark_ux_events
WHERE event = 'chat_first_message'
GROUP BY 1;

-- Approvals within 24h of first content ready
SELECT
  count(*) FILTER (WHERE (props->>'first_approval_within_24h')::boolean) AS within_24h,
  count(*) AS total_approvals
FROM public.neuramark_ux_events
WHERE event = 'approval';

-- Onboarding funnel steps
SELECT props->>'step' AS step, count(*)
FROM public.neuramark_ux_events
WHERE event = 'onboarding_step'
GROUP BY 1
ORDER BY count(*) DESC;
```

## Code entry points

- Client helper: `lib/analytics/track-ux-event.ts` (`trackUxEvent`)
- Server Action: `lib/analytics/actions/record-ux-event.ts`
- Migration: `supabase/migrations/20261104140000_neuramark_ux_events.sql`
- ADR note: `docs/adr/0011-agentic-first-ui-hoy-onboarding.md`
