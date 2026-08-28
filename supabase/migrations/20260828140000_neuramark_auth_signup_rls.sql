-- US-14.1 follow-up: deny-by-default RLS on signup PII / rate-limit tables.
-- Service role bypasses RLS. Ownership policies for authenticated users land in US-14.5.
-- No policies here (zero policies = deny anon/authenticated).

ALTER TABLE public.neuramark_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neuramark_auth_attempts ENABLE ROW LEVEL SECURITY;
