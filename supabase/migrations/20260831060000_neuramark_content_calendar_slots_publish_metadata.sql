-- US-12.2: Operator manual mark-published metadata on calendar slots.
-- ALTER only — table created in 20260831050000_neuramark_content_calendar_slots.sql.

ALTER TABLE public.neuramark_content_calendar_slots
  ADD COLUMN published_at timestamptz NULL,
  ADD COLUMN instagram_post_url text NULL;

COMMENT ON COLUMN public.neuramark_content_calendar_slots.published_at IS
  'US-12.2: Operator manual mark-published date (UTC noon anchor). NULL until marked published.';

COMMENT ON COLUMN public.neuramark_content_calendar_slots.instagram_post_url IS
  'US-12.2: Validated https://www.instagram.com/... permalink. NULL when omitted or cleared on re-mark.';
