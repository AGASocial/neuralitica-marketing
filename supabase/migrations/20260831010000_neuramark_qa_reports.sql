-- US-10.1: Veredicto QA — one current report per branded assembled reel

CREATE TABLE public.neuramark_qa_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  assembled_reel_id uuid NOT NULL
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL
    CHECK (status IN ('pending', 'running', 'passed', 'failed', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_qa_reports_assembled_reel_id_uq UNIQUE (assembled_reel_id),
  CONSTRAINT neuramark_qa_reports_checks_is_array_chk CHECK (jsonb_typeof(checks) = 'array')
);

CREATE INDEX neuramark_qa_reports_client_id_idx
  ON public.neuramark_qa_reports (client_id);

CREATE INDEX neuramark_qa_reports_client_status_idx
  ON public.neuramark_qa_reports (client_id, status);

CREATE INDEX neuramark_qa_reports_updated_at_idx
  ON public.neuramark_qa_reports (updated_at);

COMMENT ON TABLE public.neuramark_qa_reports IS
  'US-10.1: server-owned Veredicto QA; one current row per assembled_reel (UPSERT on re-run).';
COMMENT ON COLUMN public.neuramark_qa_reports.checks IS
  'Array of { checkKey, status, severity, evidence? } — server-authored only.';
COMMENT ON COLUMN public.neuramark_qa_reports.status IS
  'pending|running|passed|failed|blocked — derived server-side; never client-writable.';

ALTER TABLE public.neuramark_qa_reports ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default for anon/authenticated).

CREATE OR REPLACE FUNCTION public.neuramark_qa_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER neuramark_qa_reports_set_updated_at
  BEFORE UPDATE ON public.neuramark_qa_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_qa_reports_set_updated_at();
