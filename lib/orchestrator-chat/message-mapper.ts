import type { UIMessage } from "ai";

import {
  orchestratorPersistedMessageSchema,
  type OrchestratorPersistedMessage,
} from "@/lib/contracts/orchestrator-chat";

/** Map AI SDK UIMessages into the persisted conversation message contract. */
export function toPersistedMessages(
  messages: UIMessage[],
): OrchestratorPersistedMessage[] {
  const out: OrchestratorPersistedMessage[] = [];
  for (const message of messages) {
    if (
      message.role !== "user" &&
      message.role !== "assistant" &&
      message.role !== "system"
    ) {
      continue;
    }
    const parsed = orchestratorPersistedMessageSchema.safeParse({
      id: message.id,
      role: message.role,
      parts: message.parts,
    });
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}
