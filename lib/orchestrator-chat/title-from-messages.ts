import type { OrchestratorPersistedMessage } from "@/lib/contracts/orchestrator-chat";

/** Derive a short conversation title from the first user text part. */
export function titleFromPersistedMessages(
  messages: OrchestratorPersistedMessage[],
): string {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    for (const part of message.parts) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        (part as { type?: unknown }).type === "text" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        const text = (part as { text: string }).text.trim().replace(/\s+/g, " ");
        if (text.length > 0) {
          return text.slice(0, 120);
        }
      }
    }
  }
  return "";
}
