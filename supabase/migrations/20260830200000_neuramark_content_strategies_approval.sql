ALTER TABLE public.neuramark_content_strategies
  ADD COLUMN approved_by uuid NULL
    REFERENCES public.neuramark_clients(id) ON DELETE RESTRICT,
  ADD COLUMN approved_at timestamptz NULL;

COMMENT ON COLUMN public.neuramark_content_strategies.approved_by IS
  'Operator neuramark_clients.id who approved; set only on draft→approved transition (US-4.2).';

COMMENT ON COLUMN public.neuramark_content_strategies.approved_at IS
  'Server timestamp of approval; set only on draft→approved transition (US-4.2).';
