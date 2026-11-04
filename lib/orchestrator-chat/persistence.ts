import "server-only";

import {
  orchestratorConversationIdSchema,
  orchestratorPersistedMessageSchema,
  type OrchestratorConversation,
  type OrchestratorPersistedMessage,
  type PersistOrchestratorChatInput,
} from "@/lib/contracts/orchestrator-chat";
import { titleFromPersistedMessages } from "@/lib/orchestrator-chat/title-from-messages";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const CONVERSATIONS_TABLE = "neuramark_orchestrator_conversations";
const MESSAGES_TABLE = "neuramark_orchestrator_messages";

type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  ui_message_id: string;
  role: string;
  parts: unknown;
  created_at: string;
};

function mapConversation(row: ConversationRow): OrchestratorConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): OrchestratorPersistedMessage | null {
  const parsed = orchestratorPersistedMessageSchema.safeParse({
    id: row.ui_message_id,
    role: row.role,
    parts: Array.isArray(row.parts) ? row.parts : [],
  });
  return parsed.success ? parsed.data : null;
}

export async function loadLatestConversationForClient(
  clientId: string,
): Promise<{
  conversation: OrchestratorConversation | null;
  messages: OrchestratorPersistedMessage[];
}> {
  if (!isSupabaseConfigured()) {
    return { conversation: null, messages: [] };
  }

  const supabase = createServerSupabaseClient();
  const { data: conversation, error: conversationError } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select("id, title, created_at, updated_at")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conversationError) {
    console.error("[orchestrator-chat] load latest conversation failed", {
      code: conversationError.code,
    });
    throw new Error("orchestrator_conversation_load_failed");
  }

  if (!conversation) {
    return { conversation: null, messages: [] };
  }

  const { data: rows, error: messagesError } = await supabase
    .from(MESSAGES_TABLE)
    .select("ui_message_id, role, parts, created_at")
    .eq("conversation_id", conversation.id)
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    console.error("[orchestrator-chat] load messages failed", {
      code: messagesError.code,
    });
    throw new Error("orchestrator_messages_load_failed");
  }

  const messages = (rows ?? [])
    .map((row) => mapMessage(row as MessageRow))
    .filter((row): row is OrchestratorPersistedMessage => row !== null);

  return {
    conversation: mapConversation(conversation as ConversationRow),
    messages,
  };
}

/**
 * Insert an empty conversation so “Nueva conversación” survives reload
 * (latest by updated_at).
 */
export async function createEmptyConversationForClient(params: {
  clientId: string;
  conversationId: string;
}): Promise<OrchestratorConversation> {
  const conversationId = orchestratorConversationIdSchema.parse(
    params.conversationId,
  );
  if (!isSupabaseConfigured()) {
    const now = new Date().toISOString();
    return {
      id: conversationId,
      title: "",
      createdAt: now,
      updatedAt: now,
    };
  }

  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .insert({
      id: conversationId,
      client_id: params.clientId,
      title: "",
      updated_at: now,
    })
    .select("id, title, created_at, updated_at")
    .single();

  if (error || !data) {
    console.error("[orchestrator-chat] create empty conversation failed", {
      code: error?.code,
    });
    throw new Error("orchestrator_conversation_create_failed");
  }

  return mapConversation(data as ConversationRow);
}

/**
 * Ensure conversation row exists for this client, then insert any new
 * user/assistant messages (idempotent on conversation_id + ui_message_id).
 */
export async function persistConversationMessages(params: {
  clientId: string;
  input: PersistOrchestratorChatInput;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const conversationId = orchestratorConversationIdSchema.parse(
    params.input.conversationId,
  );
  const messages = params.input.messages;
  if (messages.length === 0) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const title = titleFromPersistedMessages(messages);

  const { data: existing, error: existingError } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select("id, title")
    .eq("id", conversationId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (existingError) {
    console.error("[orchestrator-chat] conversation lookup failed", {
      code: existingError.code,
    });
    throw new Error("orchestrator_conversation_lookup_failed");
  }

  if (!existing) {
    const { error: insertConversationError } = await supabase
      .from(CONVERSATIONS_TABLE)
      .insert({
        id: conversationId,
        client_id: params.clientId,
        title,
      });

    if (insertConversationError) {
      // Race: another finish may have created it — re-check ownership.
      const { data: raced, error: raceError } = await supabase
        .from(CONVERSATIONS_TABLE)
        .select("id")
        .eq("id", conversationId)
        .eq("client_id", params.clientId)
        .maybeSingle();
      if (raceError || !raced) {
        console.error("[orchestrator-chat] conversation insert failed", {
          code: insertConversationError.code,
        });
        throw new Error("orchestrator_conversation_insert_failed");
      }
    }
  } else if (
    typeof existing.title === "string" &&
    existing.title.trim().length === 0 &&
    title.length > 0
  ) {
    const { error: titleError } = await supabase
      .from(CONVERSATIONS_TABLE)
      .update({ title })
      .eq("id", conversationId)
      .eq("client_id", params.clientId);
    if (titleError) {
      console.error("[orchestrator-chat] title update failed", {
        code: titleError.code,
      });
    }
  }

  const { data: existingMessages, error: existingMessagesError } =
    await supabase
      .from(MESSAGES_TABLE)
      .select("ui_message_id")
      .eq("conversation_id", conversationId)
      .eq("client_id", params.clientId);

  if (existingMessagesError) {
    console.error("[orchestrator-chat] existing messages lookup failed", {
      code: existingMessagesError.code,
    });
    throw new Error("orchestrator_messages_lookup_failed");
  }

  const known = new Set(
    (existingMessages ?? []).map(
      (row) => (row as { ui_message_id: string }).ui_message_id,
    ),
  );

  const toInsert = messages.filter((message) => !known.has(message.id));
  if (toInsert.length === 0) {
    const { error: touchError } = await supabase
      .from(CONVERSATIONS_TABLE)
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("client_id", params.clientId);
    if (touchError) {
      console.error("[orchestrator-chat] conversation touch failed", {
        code: touchError.code,
      });
    }
    return;
  }

  const { error: insertMessagesError } = await supabase
    .from(MESSAGES_TABLE)
    .insert(
      toInsert.map((message) => ({
        conversation_id: conversationId,
        client_id: params.clientId,
        ui_message_id: message.id,
        role: message.role,
        parts: message.parts,
      })),
    );

  if (insertMessagesError) {
    // Unique race is acceptable — another finish may have written the same ids.
    if (insertMessagesError.code !== "23505") {
      console.error("[orchestrator-chat] messages insert failed", {
        code: insertMessagesError.code,
      });
      throw new Error("orchestrator_messages_insert_failed");
    }
  }

  const { error: touchError } = await supabase
    .from(CONVERSATIONS_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("client_id", params.clientId);

  if (touchError) {
    console.error("[orchestrator-chat] conversation touch failed", {
      code: touchError.code,
    });
  }
}
