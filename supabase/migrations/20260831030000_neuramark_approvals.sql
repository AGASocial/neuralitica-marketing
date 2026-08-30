-- US-11.1: Cliente Aprobación package — one row per branded assembled reel

CREATE TABLE public.neuramark_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id),
  assembled_reel_id uuid NOT NULL
    REFERENCES public.neuramark_assembled_reels(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_client'
    CHECK (status IN (
      'pending_client',
      'approved',
      'rejected',
      'changes_requested'
    )),
  client_feedback text NULL
    CHECK (
      client_feedback IS NULL
      OR (
        char_length(client_feedback) >= 1
        AND char_length(client_feedback) <= 500
      )
    ),
  decided_at timestamptz NULL,
  decided_by uuid NULL
    REFERENCES public.neuramark_clients(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_approvals_assembled_reel_id_uq UNIQUE (assembled_reel_id)
);

CREATE INDEX neuramark_approvals_client_status_created_idx
  ON public.neuramark_approvals (client_id, status, created_at DESC);

COMMENT ON TABLE public.neuramark_approvals IS
  'US-11.1: Cliente Aprobación package; one row per assembled_reel; Phase A writes pending_client|approved|rejected.';
COMMENT ON COLUMN public.neuramark_approvals.status IS
  'pending_client|approved|rejected|changes_requested — changes_requested reserved for US-11.2; never client-writable directly.';
COMMENT ON COLUMN public.neuramark_approvals.client_feedback IS
  'Optional reject notes (Phase A); trim 1–500 when set; empty stores NULL.';
COMMENT ON COLUMN public.neuramark_approvals.decided_by IS
  'Server-resolved actor from getCurrentUser() after requireActive — never from body.';
COMMENT ON COLUMN public.neuramark_approvals.client_id IS
  'Denormalized from owned assembly at INSERT — never from body.';

ALTER TABLE public.neuramark_approvals ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default for anon/authenticated).

CREATE OR REPLACE FUNCTION public.neuramark_approvals_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER neuramark_approvals_set_updated_at
  BEFORE UPDATE ON public.neuramark_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_approvals_set_updated_at();
