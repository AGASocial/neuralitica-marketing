import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  conversationHasUserMessages,
  selectSuggestedPromptChips,
  type SuggestedPromptLabels,
} from "@/lib/orchestrator-chat/select-suggested-prompt-chips";

const esLabels: SuggestedPromptLabels = {
  whatCanYouDo: "¿Qué puedes hacer por mí?",
  finishSetup: "Termina de configurar mi negocio",
  showPendingApprovals: "Muéstrame lo que espera mi OK",
  makeWeeklyPlan: "Hazme el plan de esta semana",
  howIsCampaign: "¿Cómo va mi campaña?",
  writeScripts: "Escribe los textos de los videos",
};

const enLabels: SuggestedPromptLabels = {
  whatCanYouDo: "What can you do for me?",
  finishSetup: "Finish setting up my business",
  showPendingApprovals: "Show me what is waiting for my OK",
  makeWeeklyPlan: "Make this week's plan",
  howIsCampaign: "How's my campaign?",
  writeScripts: "Write the video texts",
};

describe("selectSuggestedPromptChips", () => {
  it("setup 80% + 4 pending + approved plan → fixed + finish + pending + campaign", () => {
    const chips = selectSuggestedPromptChips(
      {
        percentComplete: 80,
        pendingApprovalsCount: 4,
        hasApprovedPlan: true,
        scriptsMissing: false,
      },
      esLabels,
    );

    assert.deepEqual(
      chips.map((c) => c.id),
      [
        "whatCanYouDo",
        "finishSetup",
        "showPendingApprovals",
        "howIsCampaign",
      ],
    );
    assert.equal(chips[0]?.text, "¿Qué puedes hacer por mí?");
    assert.ok(!chips.some((c) => c.id === "makeWeeklyPlan"));
    assert.ok(!chips.some((c) => c.id === "writeScripts"));
  });

  it("no approved plan uses makeWeeklyPlan and not howIsCampaign", () => {
    const chips = selectSuggestedPromptChips(
      {
        percentComplete: 100,
        pendingApprovalsCount: 0,
        hasApprovedPlan: false,
        scriptsMissing: false,
      },
      enLabels,
    );

    assert.equal(chips[0]?.id, "whatCanYouDo");
    assert.ok(chips.some((c) => c.id === "makeWeeklyPlan"));
    assert.ok(!chips.some((c) => c.id === "howIsCampaign"));
  });

  it("approved plan with missing scripts adds writeScripts", () => {
    const chips = selectSuggestedPromptChips(
      {
        percentComplete: 100,
        pendingApprovalsCount: 0,
        hasApprovedPlan: true,
        scriptsMissing: true,
      },
      enLabels,
    );

    assert.deepEqual(
      chips.map((c) => c.id),
      ["whatCanYouDo", "howIsCampaign", "writeScripts"],
    );
  });

  it("follow-up mode omits whatCanYouDo", () => {
    const chips = selectSuggestedPromptChips(
      {
        percentComplete: 80,
        pendingApprovalsCount: 4,
        hasApprovedPlan: true,
        scriptsMissing: false,
      },
      esLabels,
      { includeWhatCanYouDo: false },
    );

    assert.equal(chips[0]?.id, "finishSetup");
    assert.ok(!chips.some((c) => c.id === "whatCanYouDo"));
  });
});

describe("conversationHasUserMessages", () => {
  it("is false for empty or assistant-only", () => {
    assert.equal(conversationHasUserMessages([]), false);
    assert.equal(
      conversationHasUserMessages([{ role: "assistant" }]),
      false,
    );
  });

  it("is true when any user message exists", () => {
    assert.equal(
      conversationHasUserMessages([
        { role: "assistant" },
        { role: "user" },
      ]),
      true,
    );
  });
});
