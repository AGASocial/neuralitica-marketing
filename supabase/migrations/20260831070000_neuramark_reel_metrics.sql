-- US-13.1: Operator manual Metrics Lite counters per Ensamblado.

CREATE TABLE public.neuramark_reel_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  assembled_reel_id uuid NOT NULL UNIQUE
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  views integer NOT NULL CHECK (views >= 0 AND views <= 99999999),
  likes integer NOT NULL CHECK (likes >= 0 AND likes <= 99999999),
  comments integer NOT NULL CHECK (comments >= 0 AND comments <= 99999999),
  saves integer NOT NULL CHECK (saves >= 0 AND saves <= 99999999),
  dms integer NOT NULL CHECK (dms >= 0 AND dms <= 99999999),
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_reel_metrics_client_recorded_idx
  ON public.neuramark_reel_metrics (client_id, recorded_at DESC);

CREATE TRIGGER neuramark_reel_metrics_set_updated_at
  BEFORE UPDATE ON public.neuramark_reel_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_reel_metrics ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_reel_metrics IS
  'US-13.1: Operator manual Metrics Lite counters per Ensamblado. US-13.2 aggregates by client_id + recorded_at.';
