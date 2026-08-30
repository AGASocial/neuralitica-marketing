-- US-7.1: Reel spend ledger (neuramark_reel_spend_events). RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_reel_spend_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL
                         REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  reel_script_id       uuid NOT NULL
                         REFERENCES public.neuramark_reel_scripts (id) ON DELETE CASCADE,
  asset_role           text NOT NULL,
  job_kind             text NOT NULL,
  estimated_cost_cents integer NOT NULL,
  actual_cost_cents    integer NULL,
  provider_key         text NOT NULL,
  operator_client_id   uuid NOT NULL
                         REFERENCES public.neuramark_clients (id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_reel_spend_events_asset_role_chk
    CHECK (asset_role IN ('llm', 'tts', 'talking_head', 'broll')),
  CONSTRAINT neuramark_reel_spend_events_estimated_nonneg_chk
    CHECK (estimated_cost_cents >= 0),
  CONSTRAINT neuramark_reel_spend_events_actual_nonneg_chk
    CHECK (actual_cost_cents IS NULL OR actual_cost_cents >= 0)
);

CREATE INDEX neuramark_reel_spend_events_reel_script_id_idx
  ON public.neuramark_reel_spend_events (reel_script_id);

CREATE INDEX neuramark_reel_spend_events_client_reel_idx
  ON public.neuramark_reel_spend_events (client_id, reel_script_id);

ALTER TABLE public.neuramark_reel_spend_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_reel_spend_events IS
  'Append-only per-Reel spend ledger for budget gate (US-7.1).';
