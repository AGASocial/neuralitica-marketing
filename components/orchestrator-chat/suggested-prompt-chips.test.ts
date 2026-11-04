import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("SuggestedPromptChips + panel hide-on-user-messages", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("uses ≥44px tap targets, wrap, and horizontal scroll", () => {
    const src = readFileSync(join(here, "SuggestedPromptChips.tsx"), "utf8");
    assert.match(src, /min-h-11/);
    assert.match(src, /flex-wrap/);
    assert.match(src, /overflow-x-auto/);
  });

  it("panel hides chips once any user message exists", () => {
    const panel = readFileSync(join(here, "OrchestratorChatPanel.tsx"), "utf8");
    assert.match(panel, /conversationHasUserMessages/);
    assert.match(panel, /SuggestedPromptChips/);
    assert.match(
      panel,
      /!hasUserMessages[\s\S]*SuggestedPromptChips|showSuggested[\s\S]*SuggestedPromptChips/,
    );
  });

  it("EN/ES catalogs expose fixed capability chip", () => {
    const es = JSON.parse(
      readFileSync(join(here, "../../messages/es.json"), "utf8"),
    );
    const en = JSON.parse(
      readFileSync(join(here, "../../messages/en.json"), "utf8"),
    );
    assert.equal(
      es.orchestratorChat.suggestedPrompts.whatCanYouDo,
      "¿Qué puedes hacer por mí?",
    );
    assert.equal(
      en.orchestratorChat.suggestedPrompts.whatCanYouDo,
      "What can you do for me?",
    );
  });
});
