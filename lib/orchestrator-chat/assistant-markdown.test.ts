import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAssistantMarkdown, parseInline } from "./render-assistant-markdown";

describe("assistant markdown parser", () => {
  it("parses bold markers", () => {
    const nodes = parseInline("Hello **world** today");
    assert.deepEqual(nodes, [
      { type: "text", value: "Hello " },
      { type: "strong", value: "world" },
      { type: "text", value: " today" },
    ]);
  });

  it("parses italic and inline code", () => {
    const nodes = parseInline("Say *hi* and `ok`");
    assert.deepEqual(nodes, [
      { type: "text", value: "Say " },
      { type: "em", value: "hi" },
      { type: "text", value: " and " },
      { type: "code", value: "ok" },
    ]);
  });

  it("parses list blocks", () => {
    const blocks = parseAssistantMarkdown("- one\n- **two**");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.type, "list");
    if (blocks[0]?.type === "list") {
      assert.equal(blocks[0].items.length, 2);
      assert.deepEqual(blocks[0].items[1], [
        { type: "strong", value: "two" },
      ]);
    }
  });
});
