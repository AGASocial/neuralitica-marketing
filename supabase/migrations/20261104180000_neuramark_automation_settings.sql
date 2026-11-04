-- KAN-108 F0: Owner proactive automation settings + notification/audit events.
-- Additive only. Access via service-role Node (deny-by-default RLS).

CREATE TABLE IF NOT EXISTS public.neuramark_automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  preset text NOT NULL DEFAULT 'review_all',
  weekly_spend_cap_cents integer NULL,
  max_auto_approve_cost_cents integer NULL,
  content_type_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  remind_after_24h boolean NOT NULL DEFAULT true,
  remind_after_48h_channel_change boolean NOT NULL DEFAULT true,
  remind_after_72h_fallback boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_automation_settings_preset_chk
    CHECK (preset IN ('auto_pilot', 'review_all', 'custom')),
  CONSTRAINT neuramark_automation_settings_weekly_cap_chk
    CHECK (
      weekly_spend_cap_cents IS NULL
      OR weekly_spend_cap_cents >= 0
    ),
  CONSTRAINT neuramark_automation_settings_max_item_chk
    CHECK (
      max_auto_approve_cost_cents IS NULL
      OR max_auto_approve_cost_cents >= 0
    ),
  CONSTRAINT neuramark_automation_settings_rules_object_chk
    CHECK (jsonb_typeof(content_type_rules) = 'object'),
  CONSTRAINT neuramark_automation_settings_rules_size_chk
    CHECK (octet_length(content_type_rules::text) <= 16384)
);

CREATE UNIQUE INDEX IF NOT EXISTS neuramark_automation_settings_client_id_uidx
  ON public.neuramark_automation_settings (client_id);

DROP TRIGGER IF EXISTS neuramark_automation_settings_set_updated_at
  ON public.neuramark_automation_settings;
CREATE TRIGGER neuramark_automation_settings_set_updated_at
  BEFORE UPDATE ON public.neuramark_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_automation_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_automation_settings IS
  'KAN-108: Per-business automation presets (auto_pilot / review_all / custom) and reminder flags.';

CREATE TABLE IF NOT EXISTS public.neuramark_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  approval_id uuid NULL
    REFERENCES public.neuramark_approvals (id) ON DELETE SET NULL,
  kind text NOT NULL,
  channel text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_automation_events_kind_len_chk
    CHECK (char_length(kind) >= 1 AND char_length(kind) <= 64),
  CONSTRAINT neuramark_automation_events_payload_object_chk
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT neuramark_automation_events_payload_size_chk
    CHECK (octet_length(payload::text) <= 32768)
);

CREATE UNIQUE INDEX IF NOT EXISTS neuramark_automation_events_idempotency_uidx
  ON public.neuramark_automation_events (idempotency_key);

CREATE INDEX IF NOT EXISTS neuramark_automation_events_client_created_idx
  ON public.neuramark_automation_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS neuramark_automation_events_approval_kind_idx
  ON public.neuramark_automation_events (approval_id, kind)
  WHERE approval_id IS NOT NULL;

ALTER TABLE public.neuramark_automation_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_automation_events IS
  'KAN-108: Idempotent automation audit (dry-run auto-approve, reminders, email attempts).';

CREATE TABLE IF NOT EXISTS public.neuramark_hoy_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  approval_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_hoy_notifications_kind_len_chk
    CHECK (char_length(kind) >= 1 AND char_length(kind) <= 64),
  CONSTRAINT neuramark_hoy_notifications_title_len_chk
    CHECK (char_length(title) >= 1 AND char_length(title) <= 200),
  CONSTRAINT neuramark_hoy_notifications_body_len_chk
    CHECK (char_length(body) >= 1 AND char_length(body) <= 2000)
);

CREATE INDEX IF NOT EXISTS neuramark_hoy_notifications_client_unread_idx
  ON public.neuramark_hoy_notifications (client_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.neuramark_hoy_notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_hoy_notifications IS
  'KAN-108: Owner Hoy feed notification items for pending approvals / reminders.';
