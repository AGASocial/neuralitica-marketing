import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  containsOrchestratorToolName,
  sanitizeOrchestratorVisibleText,
} from "./sanitize-visible-text";

describe("sanitizeOrchestratorVisibleText", () => {
  it("passes through clean Spanish replies", () => {
    const text =
      "Listo — preparé el plan de esta semana. ¿Lo aprobamos?";
    assert.equal(sanitizeOrchestratorVisibleText(text), text);
  });

  it("strips tool names and internal monologue before the real answer", () => {
    const leaked = [
      "Let's re-read the prompt and decide which tools to use.",
      "I should call getScriptsStatus and then proposeApprovePendingVideo.",
      "",
      "¿Quieres que revise cómo van tus videos esta semana?",
    ].join("\n");

    const cleaned = sanitizeOrchestratorVisibleText(leaked);
    assert.equal(
      cleaned,
      "¿Quieres que revise cómo van tus videos esta semana?",
    );
    assert.equal(containsOrchestratorToolName(cleaned), false);
  });

  it("drops sentences that name proposeGenerateVideos", () => {
    const text =
      "I'll use proposeGenerateVideos now. ¿Generamos tus videos?";
    const cleaned = sanitizeOrchestratorVisibleText(text);
    assert.match(cleaned, /¿Generamos tus videos\?/);
    assert.equal(containsOrchestratorToolName(cleaned), false);
  });

  it("returns empty string when only monologue remains", () => {
    const text =
      "Let's re-read the prompt. I need to call listCampaignStatus first.";
    assert.equal(sanitizeOrchestratorVisibleText(text), "");
  });
});
