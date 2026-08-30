-- US-10.2: append-only Operator QA check overrides (audit + gate coverage)

CREATE TABLE public.neuramark_qa_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  qa_report_id uuid NOT NULL
    REFERENCES public.neuramark_qa_reports(id) ON DELETE CASCADE,
  assembled_reel_id uuid NOT NULL
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  reason text NOT NULL
    CHECK (char_length(reason) >= 1 AND char_length(reason) <= 500),
  operator_client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX neuramark_qa_overrides_report_check_idx
  ON public.neuramark_qa_overrides (qa_report_id, check_key);

CREATE INDEX neuramark_qa_overrides_client_reel_created_idx
  ON public.neuramark_qa_overrides (client_id, assembled_reel_id, created_at DESC);

COMMENT ON TABLE public.neuramark_qa_overrides IS
  'US-10.2: append-only Operator overrides for failed overridable QA checks; never mutates report status.';
COMMENT ON COLUMN public.neuramark_qa_overrides.check_key IS
  'Must match a known QA catalog checkKey; blocking keys rejected in app layer.';
COMMENT ON COLUMN public.neuramark_qa_overrides.reason IS
  'Operator-documented motivo; trimmed 1–500 chars; plain text.';
COMMENT ON COLUMN public.neuramark_qa_overrides.operator_client_id IS
  'Server-resolved actor from getCurrentUser() after requireOperator — never from body.';

ALTER TABLE public.neuramark_qa_overrides ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default for anon/authenticated).
