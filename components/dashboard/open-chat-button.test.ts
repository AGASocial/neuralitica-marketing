import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("OpenChatButton (redesign)", () => {
  it("focuses the persistent composer instead of the old side-sheet launcher", () => {
    const src = readFileSync(
      join(process.cwd(), "components/dashboard/OpenChatButton.tsx"),
      "utf8",
    );
    assert.match(src, /focusComposer\(\)/);
    assert.match(src, /#owner-layout-composer/);
    const panel = readFileSync(
      join(process.cwd(), "components/orchestrator-chat/OrchestratorChatPanel.tsx"),
      "utf8",
    );
    assert.doesNotMatch(panel, /OrchestratorChatToggle/);
  });
});
