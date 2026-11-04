import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("createOrchestratorConversation", () => {
  it("persists an empty conversation row with fresh updated_at", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const persistence = readFileSync(join(here, "persistence.ts"), "utf8");
    const action = readFileSync(
      join(here, "actions/create-conversation.ts"),
      "utf8",
    );
    const panel = readFileSync(
      join(
        here,
        "../../components/orchestrator-chat/OrchestratorChatPanel.tsx",
      ),
      "utf8",
    );
    assert.match(persistence, /createEmptyConversationForClient/);
    assert.match(persistence, /updated_at:\s*now/);
    assert.match(action, /createEmptyConversationForClient/);
    assert.match(panel, /createOrchestratorConversation/);
    assert.match(panel, /startNewConversation/);
  });
});
