-- US-X.4: Global default cost policy (neuramark_cost_policies)
-- RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_cost_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NULL
                    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  provider_tier   text NOT NULL,
  max_cost_cents  integer NOT NULL,
  rules           jsonb NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_cost_policies_tier_chk
    CHECK (provider_tier IN ('low', 'high')),
  CONSTRAINT neuramark_cost_policies_max_cost_positive
    CHECK (max_cost_cents > 0)
);

-- Exactly one global default row (client_id IS NULL).
CREATE UNIQUE INDEX neuramark_cost_policies_one_global_default_idx
  ON public.neuramark_cost_policies ((1))
  WHERE client_id IS NULL;

CREATE INDEX neuramark_cost_policies_client_id_idx
  ON public.neuramark_cost_policies (client_id)
  WHERE client_id IS NOT NULL;

CREATE TRIGGER neuramark_cost_policies_set_updated_at
  BEFORE UPDATE ON public.neuramark_cost_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_cost_policies ENABLE ROW LEVEL SECURITY;
-- Zero named policies.

COMMENT ON TABLE public.neuramark_cost_policies IS
  'Cost tier + budget cap per client or global default (US-X.4 seed). Per-client overrides in US-7.1.';

INSERT INTO public.neuramark_cost_policies (
  client_id, provider_tier, max_cost_cents, rules
) VALUES (
  NULL,
  'low',
  150,
  NULL
);
