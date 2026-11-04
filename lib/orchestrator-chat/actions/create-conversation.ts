"use server";

import { randomUUID } from "node:crypto";

import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  loadLatestOrchestratorConversationResultSchema,
  type LoadLatestOrchestratorConversationResult,
} from "@/lib/contracts/orchestrator-chat";
import { createEmptyConversationForClient } from "@/lib/orchestrator-chat/persistence";

/**
 * Persist a new empty conversation as the latest for this client (KAN / Mis chat).
 */
export async function createOrchestratorConversation(): Promise<LoadLatestOrchestratorConversationResult> {
  try {
    const user = await requireActive("handler");
    const conversation = await createEmptyConversationForClient({
      clientId: user.id,
      conversationId: randomUUID(),
    });
    return loadLatestOrchestratorConversationResultSchema.parse({
      ok: true,
      conversation,
      messages: [],
    });
  } catch (error) {
    if (isAuthGuardError(error)) {
      throw error;
    }
    console.error("[orchestrator-chat] createOrchestratorConversation failed");
    return loadLatestOrchestratorConversationResultSchema.parse({
      ok: true,
      conversation: null,
      messages: [],
    });
  }
}
