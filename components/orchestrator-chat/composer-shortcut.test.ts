import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("Cmd/Ctrl+J composer shortcut", () => {
  it("context focuses layout composer instead of toggling sheet only", () => {
    const src = readFileSync(
      join(__dirname, "OrchestratorChatContext.tsx"),
      "utf8",
    );
    assert.match(src, /focusComposer/);
    assert.match(src, /metaKey|\|\| event\.ctrlKey/);
    assert.match(src, /key\.toLowerCase\(\) !== "j"/);
    assert.match(src, /registerComposerInput/);
    // Must not solely toggle open/closed on J anymore
    assert.match(src, /focusComposer\(\)/);
  });

  it("OwnerComposer registers the layout textarea for focus", () => {
    const src = readFileSync(
      join(__dirname, "../layout/OwnerComposer.tsx"),
      "utf8",
    );
    assert.match(src, /owner-layout-composer/);
    assert.match(src, /registerComposerInput/);
    assert.match(src, /sendFromComposer/);
  });
});
