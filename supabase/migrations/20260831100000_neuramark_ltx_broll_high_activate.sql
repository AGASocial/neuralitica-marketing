-- US-8.8 Phase B: Activate ltx_broll_high for high-tier B-roll routing.
-- cost_model unchanged (126¢ per_clip per US-X.4 seed).

UPDATE public.neuramark_provider_catalog
SET active = true
WHERE key = 'ltx_broll_high';
