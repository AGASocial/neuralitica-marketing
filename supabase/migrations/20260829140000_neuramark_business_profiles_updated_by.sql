-- US-2.2: audit who edited Ficha viva (server-resolved Cliente)
-- Additive only: nullable updated_by. No profile_versions. No Preferencias/consent columns.

ALTER TABLE public.neuramark_business_profiles
  ADD COLUMN updated_by uuid NULL
    REFERENCES public.neuramark_clients (id) ON DELETE SET NULL;

CREATE INDEX neuramark_business_profiles_updated_by_idx
  ON public.neuramark_business_profiles (updated_by);

COMMENT ON COLUMN public.neuramark_business_profiles.updated_by IS
  'Last editor Cliente id; set server-side on US-2.2 PATCH from getCurrentUser().id. NULL for rows never edited after create.';
