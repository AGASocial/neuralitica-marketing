import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autosizeComposerTextarea,
  shouldSendOnEnterKey,
} from "./composer-keydown";

describe("shouldSendOnEnterKey", () => {
  it("sends on Enter when ready", () => {
    assert.equal(
      shouldSendOnEnterKey(
        { key: "Enter", shiftKey: false },
        { busy: false, hasText: true },
      ),
      true,
    );
  });

  it("does not send on Shift+Enter", () => {
    assert.equal(
      shouldSendOnEnterKey(
        { key: "Enter", shiftKey: true },
        { busy: false, hasText: true },
      ),
      false,
    );
  });

  it("ignores Enter during IME composing", () => {
    assert.equal(
      shouldSendOnEnterKey(
        {
          key: "Enter",
          shiftKey: false,
          nativeEvent: { isComposing: true },
        },
        { busy: false, hasText: true },
      ),
      false,
    );
  });

  it("ignores Enter when keyCode is 229", () => {
    assert.equal(
      shouldSendOnEnterKey(
        { key: "Enter", shiftKey: false, keyCode: 229 },
        { busy: false, hasText: true },
      ),
      false,
    );
    assert.equal(
      shouldSendOnEnterKey(
        {
          key: "Enter",
          shiftKey: false,
          nativeEvent: { keyCode: 229 },
        },
        { busy: false, hasText: true },
      ),
      false,
    );
  });

  it("does not send empty or while busy", () => {
    assert.equal(
      shouldSendOnEnterKey(
        { key: "Enter", shiftKey: false },
        { busy: false, hasText: false },
      ),
      false,
    );
    assert.equal(
      shouldSendOnEnterKey(
        { key: "Enter", shiftKey: false },
        { busy: true, hasText: true },
      ),
      false,
    );
  });

  it("ignores non-Enter keys", () => {
    assert.equal(
      shouldSendOnEnterKey(
        { key: "a", shiftKey: false },
        { busy: false, hasText: true },
      ),
      false,
    );
  });
});

describe("autosizeComposerTextarea", () => {
  it("no-ops on null", () => {
    assert.doesNotThrow(() => autosizeComposerTextarea(null));
  });
});
