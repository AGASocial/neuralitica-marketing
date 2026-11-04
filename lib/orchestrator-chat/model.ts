import "server-only";

import { gateway } from "ai";

import { ORCHESTRATOR_CHAT_DEFAULT_MODEL } from "@/lib/contracts/orchestrator-chat";

/**
 * Resolve orchestrator chat model via AI Gateway.
 * Default is google/gemini-2.5-flash (ADR-0009). Override with
 * ORCHESTRATOR_CHAT_MODEL (e.g. google/gemini-2.5-pro) when needed.
 */
export function getOrchestratorChatModel() {
  const fromEnv = process.env.ORCHESTRATOR_CHAT_MODEL?.trim();
  const modelId =
    fromEnv && fromEnv.length > 0
      ? fromEnv
      : ORCHESTRATOR_CHAT_DEFAULT_MODEL;
  return gateway(modelId);
}

export function getOrchestratorChatModelId(): string {
  const fromEnv = process.env.ORCHESTRATOR_CHAT_MODEL?.trim();
  return fromEnv && fromEnv.length > 0
    ? fromEnv
    : ORCHESTRATOR_CHAT_DEFAULT_MODEL;
}
