-- KAN-95 / ADR-0009 P4: Orchestrator chat conversation + message persistence.
-- Ownership is client_id (neuramark_clients). Access only via service-role Node
-- (Next.js backend) — same deny-by-default RLS pattern as interview_sessions /
-- media_assets (zero named policies for anon/authenticated).

CREATE TABLE IF NOT EXISTS public.neuramark_orchestrator_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_orchestrator_conversations_title_len_chk
    CHECK (char_length(title) <= 200)
);

CREATE INDEX IF NOT EXISTS neuramark_orchestrator_conversations_client_updated_idx
  ON public.neuramark_orchestrator_conversations (client_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'neuramark_orchestrator_conversations_set_updated_at'
  ) THEN
    CREATE TRIGGER neuramark_orchestrator_conversations_set_updated_at
      BEFORE UPDATE ON public.neuramark_orchestrator_conversations
      FOR EACH ROW
      EXECUTE FUNCTION public.neuramark_set_updated_at();
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.neuramark_orchestrator_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.neuramark_orchestrator_conversations (id) ON DELETE CASCADE,
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  ui_message_id text NOT NULL,
  role text NOT NULL,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_orchestrator_messages_role_chk
    CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT neuramark_orchestrator_messages_ui_message_id_len_chk
    CHECK (
      char_length(ui_message_id) >= 1
      AND char_length(ui_message_id) <= 128
    ),
  CONSTRAINT neuramark_orchestrator_messages_parts_is_array_chk
    CHECK (jsonb_typeof(parts) = 'array'),
  CONSTRAINT neuramark_orchestrator_messages_parts_size_chk
    CHECK (octet_length(parts::text) <= 524288)
);

CREATE UNIQUE INDEX IF NOT EXISTS neuramark_orchestrator_messages_conversation_ui_uidx
  ON public.neuramark_orchestrator_messages (conversation_id, ui_message_id);

CREATE INDEX IF NOT EXISTS neuramark_orchestrator_messages_conversation_created_idx
  ON public.neuramark_orchestrator_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS neuramark_orchestrator_messages_client_id_idx
  ON public.neuramark_orchestrator_messages (client_id);

ALTER TABLE public.neuramark_orchestrator_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neuramark_orchestrator_messages ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated.
-- Owner scope enforced in Next.js via getCurrentUser().id = client_id.

COMMENT ON TABLE public.neuramark_orchestrator_conversations IS
  'KAN-95: Orchestrator chat threads per Cliente; title + timestamps.';
COMMENT ON TABLE public.neuramark_orchestrator_messages IS
  'KAN-95: UIMessage parts (role + parts jsonb) for orchestrator conversations.';
COMMENT ON COLUMN public.neuramark_orchestrator_messages.ui_message_id IS
  'AI SDK UIMessage.id (opaque token); unique per conversation.';
COMMENT ON COLUMN public.neuramark_orchestrator_messages.parts IS
  'AI SDK UIMessage.parts JSON array for resume rendering.';
