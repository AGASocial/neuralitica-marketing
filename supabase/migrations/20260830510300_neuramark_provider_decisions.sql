-- US-7.2: Append-only provider decision log for routing analytics.

CREATE TABLE public.neuramark_provider_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL
    REFERENCES public.neuramark_reel_scripts (id) ON DELETE CASCADE,
  job_kind text NOT NULL CHECK (
    job_kind IN (
      'script_generate',
      'script_regenerate',
      'caption_generate',
      'caption_regenerate'
    )
  ),
  asset_role text NOT NULL CHECK (
    asset_role IN ('llm', 'tts', 'talking_head', 'broll')
  ),
  provider_tier text NOT NULL CHECK (provider_tier IN ('low', 'high')),
  provider_key text NOT NULL,
  estimated_cost_cents integer NOT NULL CHECK (estimated_cost_cents >= 0),
  rationale_key text NOT NULL,
  operator_client_id uuid NULL
    REFERENCES public.neuramark_clients (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_provider_decisions_reel_script_id_idx
  ON public.neuramark_provider_decisions (reel_script_id);

CREATE INDEX neuramark_provider_decisions_client_id_created_at_idx
  ON public.neuramark_provider_decisions (client_id, created_at DESC);

ALTER TABLE public.neuramark_provider_decisions ENABLE ROW LEVEL SECURITY;
-- No policies — service-role Node only (US-X.4 / US-14.5 floor).

COMMENT ON TABLE public.neuramark_provider_decisions IS
  'Append-only provider routing decisions for LLM jobs (US-7.2); US-8.x extends job_kind.';
