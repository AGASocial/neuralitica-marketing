import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { titleFromPersistedMessages } from "./title-from-messages";

describe("titleFromPersistedMessages", () => {
  it("uses the first user text part, trimmed and capped", () => {
    const title = titleFromPersistedMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
      },
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "  How is my campaign this week?  " }],
      },
    ]);
    assert.equal(title, "How is my campaign this week?");
  });

  it("returns empty when no user text exists", () => {
    assert.equal(
      titleFromPersistedMessages([
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Hi" }],
        },
      ]),
      "",
    );
  });

  it("caps long titles at 120 chars", () => {
    const long = "x".repeat(200);
    const title = titleFromPersistedMessages([
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: long }],
      },
    ]);
    assert.equal(title.length, 120);
  });
});
