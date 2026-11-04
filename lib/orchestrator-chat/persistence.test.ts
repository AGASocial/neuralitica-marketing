import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UIMessage } from "ai";

import { toPersistedMessages } from "./message-mapper";

describe("toPersistedMessages", () => {
  it("keeps user and assistant messages with parts", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Hi" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "Hello" },
          {
            type: "tool-listCampaignStatus",
            toolCallId: "t1",
            state: "output-available",
            input: {},
            output: { ok: true },
          },
        ],
      },
    ] as UIMessage[];

    const persisted = toPersistedMessages(messages);
    assert.equal(persisted.length, 2);
    assert.equal(persisted[0]?.role, "user");
    assert.equal(persisted[1]?.role, "assistant");
    assert.equal(persisted[1]?.parts.length, 2);
  });

  it("drops messages with empty ids", () => {
    const messages = [
      {
        id: "",
        role: "user",
        parts: [{ type: "text", text: "Hi" }],
      },
    ] as UIMessage[];
    assert.equal(toPersistedMessages(messages).length, 0);
  });
});
