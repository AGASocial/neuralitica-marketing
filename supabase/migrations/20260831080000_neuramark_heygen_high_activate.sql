-- US-8.7 Phase B: Activate heygen_high, correct cost_model 7→2 ¢/s, fallback audit table.
-- Prior unitCostCents 7 (~$4.20/min) misaligned with AC ~$1/min standard (2¢/s ≈ $1.20/min).

UPDATE public.neuramark_provider_catalog
SET
  active = true,
  cost_model = '{
    "billingUnit": "per_second",
    "unitCostCents": 2,
    "metadata": {
      "plan": "standard",
      "vendor": "heygen",
      "approxPerMinuteCents": 120
    }
  }'::jsonb
WHERE key = 'heygen_high';

CREATE TABLE public.neuramark_video_job_heygen_fallback_overrides (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  reel_script_id        uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE CASCADE,
  parent_job_id         uuid NOT NULL REFERENCES public.neuramark_video_jobs(id),
  new_job_id            uuid NULL REFERENCES public.neuramark_video_jobs(id),
  operator_client_id    uuid NOT NULL REFERENCES public.neuramark_clients(id),
  rationale_key         text NOT NULL DEFAULT 'operator_heygen_fallback'
                        CHECK (rationale_key = 'operator_heygen_fallback'),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_video_job_heygen_fallback_overrides_reel_idx
  ON public.neuramark_video_job_heygen_fallback_overrides
  (client_id, reel_script_id, created_at DESC);

ALTER TABLE public.neuramark_video_job_heygen_fallback_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_video_job_heygen_fallback_overrides IS
  'Append-only Operator HeyGen fallback override audit (US-8.7). Deny-by-default RLS; service-role Node only.';
