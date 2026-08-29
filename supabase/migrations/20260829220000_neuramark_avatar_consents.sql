-- US-3.2: Consentimiento de avatar (append-only ledger)
-- Product copy uses CONTEXT labels; technical columns only below.

CREATE TABLE public.neuramark_avatar_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT neuramark_avatar_consents_consent_version_nonempty_chk
    CHECK (char_length(trim(consent_version)) > 0),
  CONSTRAINT neuramark_avatar_consents_revoked_after_consented_chk
    CHECK (revoked_at IS NULL OR revoked_at >= consented_at)
);

-- At most one active (non-revoked) row per Cliente
CREATE UNIQUE INDEX neuramark_avatar_consents_client_id_active_uidx
  ON public.neuramark_avatar_consents (client_id)
  WHERE revoked_at IS NULL;

-- Probe / history support
CREATE INDEX neuramark_avatar_consents_client_id_consented_at_idx
  ON public.neuramark_avatar_consents (client_id, consented_at DESC);

ALTER TABLE public.neuramark_avatar_consents ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).

COMMENT ON TABLE public.neuramark_avatar_consents IS
  'Cliente Consentimiento de avatar append-only ledger; US-3.2. Never DELETE; revoke sets revoked_at only.';
COMMENT ON COLUMN public.neuramark_avatar_consents.consent_version IS
  'Server constant (e.g. AVATAR_CONSENT_DISCLOSURE_V1) matching disclosure text shown at grant.';
COMMENT ON COLUMN public.neuramark_avatar_consents.revoked_at IS
  'NULL = candidate active row; set only on revoke. Historical consented_at/consent_version immutable.';
