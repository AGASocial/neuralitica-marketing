-- KAN-107: Owner UX analytics events (Hoy, chat, approvals, onboarding).
-- Access only via service-role Node (Next.js backend) — deny-by-default RLS.

CREATE TABLE IF NOT EXISTS public.neuramark_ux_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_ux_events_event_len_chk
    CHECK (
      char_length(event) >= 1
      AND char_length(event) <= 64
    ),
  CONSTRAINT neuramark_ux_events_props_is_object_chk
    CHECK (jsonb_typeof(props) = 'object'),
  CONSTRAINT neuramark_ux_events_props_size_chk
    CHECK (octet_length(props::text) <= 16384)
);

CREATE INDEX IF NOT EXISTS neuramark_ux_events_client_created_idx
  ON public.neuramark_ux_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS neuramark_ux_events_event_created_idx
  ON public.neuramark_ux_events (event, created_at DESC);

ALTER TABLE public.neuramark_ux_events ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated.
-- Owner scope enforced in Next.js via getCurrentUser().id = client_id.

COMMENT ON TABLE public.neuramark_ux_events IS
  'KAN-107: Owner UX events (hoy_visit, hoy_action, chat_first_message, approval, onboarding_step).';
