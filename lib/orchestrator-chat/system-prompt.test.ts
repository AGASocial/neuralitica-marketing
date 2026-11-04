import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildOrchestratorSystemPrompt } from "@/lib/orchestrator-chat/system-prompt";
import type { CurrentUser } from "@/lib/auth/get-current-user-types";

const owner: CurrentUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  displayName: "Owner",
  preferredLocale: "es",
  role: "client",
  active: true,
};

describe("orchestrator system prompt card discipline", () => {
  it("Spanish locale requires own-avatar and TTS confirm tool calls", () => {
    const prompt = buildOrchestratorSystemPrompt(owner, "es");
    assert.match(prompt, /Always reply in Spanish/);
    assert.match(prompt, /Quiero usar mi propio avatar/);
    assert.match(prompt, /quiero salir yo en los videos/);
    assert.match(prompt, /activa videos con mi cara/);
    assert.match(prompt, /proposeEnableOwnAvatar/);
    assert.match(prompt, /¿Cuánto cuesta la voz para mi video\?/);
    assert.match(prompt, /proposeConfirmTtsGeneration/);
    assert.match(prompt, /confirm_tts_generation/);
    assert.match(prompt, /NEVER start avatar\/video generation/i);
  });

  it("English locale still requires the same tool cards", () => {
    const prompt = buildOrchestratorSystemPrompt(owner, "en");
    assert.match(prompt, /proposeEnableOwnAvatar/);
    assert.match(prompt, /proposeConfirmTtsGeneration/);
    assert.match(prompt, /confirm_tts_generation/);
  });
});
