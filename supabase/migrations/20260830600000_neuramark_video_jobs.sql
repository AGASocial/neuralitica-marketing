-- US-8.4: Video job orchestration (neuramark_video_jobs + retry overrides)
-- Implements US-8.2 CONTRACT Phase B DDL. RLS deny-by-default; service-role Node only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'neuramark_provider_tier') THEN
    CREATE TYPE public.neuramark_provider_tier AS ENUM ('low', 'high');
  END IF;
END $$;

ALTER TYPE public.neuramark_media_asset_type ADD VALUE IF NOT EXISTS 'generated_video';

CREATE TABLE public.neuramark_video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  provider_tier public.neuramark_provider_tier NOT NULL,
  asset_role text NOT NULL CHECK (asset_role IN ('primary', 'broll')),
  external_job_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  estimated_cost_cents integer NOT NULL CHECK (estimated_cost_cents >= 0),
  actual_cost_cents integer CHECK (actual_cost_cents IS NULL OR actual_cost_cents >= 0),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 2000),
  portrait_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  voiceover_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  output_media_asset_id uuid REFERENCES public.neuramark_media_assets(id),
  parent_job_id uuid REFERENCES public.neuramark_video_jobs(id),
  spend_event_id uuid REFERENCES public.neuramark_reel_spend_events(id),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_video_jobs_external_id_unique
    UNIQUE (client_id, provider_key, external_job_id)
);

CREATE INDEX neuramark_video_jobs_client_reel_idx
  ON public.neuramark_video_jobs (client_id, reel_script_id);

CREATE INDEX neuramark_video_jobs_status_updated_idx
  ON public.neuramark_video_jobs (status, updated_at);

CREATE TRIGGER neuramark_video_jobs_set_updated_at
  BEFORE UPDATE ON public.neuramark_video_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_video_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_video_jobs IS
  'Async video generation jobs (US-8.4). Status writes poller-only via applyVideoJobStatusUpdate.';

CREATE TABLE public.neuramark_video_job_retry_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE CASCADE,
  failed_job_id uuid NOT NULL REFERENCES public.neuramark_video_jobs(id) ON DELETE CASCADE,
  operator_client_id uuid NOT NULL REFERENCES public.neuramark_clients(id),
  prior_attempt integer NOT NULL CHECK (prior_attempt >= 1),
  reason text NOT NULL CHECK (char_length(reason) >= 1 AND char_length(reason) <= 500),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_video_job_retry_overrides_reel_idx
  ON public.neuramark_video_job_retry_overrides (client_id, reel_script_id, created_at DESC);

ALTER TABLE public.neuramark_video_job_retry_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_video_job_retry_overrides IS
  'Append-only Operator retry-limit override audit (US-8.4). consumed_at set on one subsequent retry.';
