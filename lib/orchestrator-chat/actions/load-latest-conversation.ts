"use server";

import {
  loadLatestOrchestratorConversationResultSchema,
  type LoadLatestOrchestratorConversationResult,
} from "@/lib/contracts/orchestrator-chat";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import { loadLatestConversationForClient } from "@/lib/orchestrator-chat/persistence";

/**
 * Load the caller's most recently updated orchestrator conversation + messages.
 * Frontend: OrchestratorChatPanel on first open (KAN-95).
 */
export async function loadLatestOrchestratorConversation(): Promise<LoadLatestOrchestratorConversationResult> {
  try {
    const user = await requireActive("handler");
    const { conversation, messages } = await loadLatestConversationForClient(
      user.id,
    );
    return loadLatestOrchestratorConversationResultSchema.parse({
      ok: true,
      conversation,
      messages,
    });
  } catch (error) {
    if (isAuthGuardError(error)) {
      throw error;
    }
    console.error("[orchestrator-chat] loadLatestOrchestratorConversation failed");
    return loadLatestOrchestratorConversationResultSchema.parse({
      ok: true,
      conversation: null,
      messages: [],
    });
  }
}
