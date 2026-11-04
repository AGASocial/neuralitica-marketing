import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_CARD_TYPES,
  parseAgentCard,
  safeParseAgentCard,
} from "./schemas";

const APPROVE_CHANGE = [
  { id: "approve", label: "Approve", role: "primary" as const },
  { id: "change", label: "Change", role: "secondary" as const },
];

const VIDEO =
  "/api/media/assets/11111111-1111-4111-8111-111111111111";

describe("agent-cards catalog schemas", () => {
  it("exposes all KAN-103 catalog types", () => {
    assert.deepEqual([...AGENT_CARD_TYPES].sort(), [
      "clarifying_question",
      "cost_confirmation",
      "next_step_chips",
      "own_avatar_activation",
      "plan_approval",
      "progress",
      "reel_approval",
      "script_approval",
      "status_summary",
      "voice_cost",
    ]);
  });

  it("parses reel_approval", () => {
    const card = parseAgentCard({
      type: "reel_approval",
      title: "Video 1",
      summary: "Needs OK",
      props: {
        videoPreviewUrl: VIDEO,
        previewMode: "player",
      },
      actions: APPROVE_CHANGE,
    });
    assert.equal(card.type, "reel_approval");
  });

  it("parses cost_confirmation", () => {
    const card = parseAgentCard({
      type: "cost_confirmation",
      title: "Create video?",
      summary: "Approx cost",
      props: {
        estimatedCostCents: 120,
        spendHintTemplate: "About {amount}",
      },
      actions: APPROVE_CHANGE,
    });
    assert.equal(card.type, "cost_confirmation");
    assert.equal(card.props.estimatedCostCents, 120);
  });

  it("parses plan_approval", () => {
    assert.equal(
      parseAgentCard({
        type: "plan_approval",
        title: "Plan",
        summary: "Approve this week",
        props: { themes: ["A", "B"] },
        actions: APPROVE_CHANGE,
      }).type,
      "plan_approval",
    );
  });

  it("parses script_approval", () => {
    assert.equal(
      parseAgentCard({
        type: "script_approval",
        title: "Write-up",
        summary: "Rewrite?",
        props: { tema: "Leak fix", hook: "Hook", status: "generated" },
        actions: APPROVE_CHANGE,
      }).type,
      "script_approval",
    );
  });

  it("parses own_avatar_activation", () => {
    assert.equal(
      parseAgentCard({
        type: "own_avatar_activation",
        title: "On camera",
        summary: "Use your look",
        props: {},
        actions: APPROVE_CHANGE,
      }).type,
      "own_avatar_activation",
    );
  });

  it("parses voice_cost", () => {
    const card = parseAgentCard({
      type: "voice_cost",
      title: "Voice",
      summary: "TTS cost",
      props: {
        estimatedCostCents: 45,
        confirmEstimateCents: 45,
        reelScriptId: "22222222-2222-4222-8222-222222222222",
        slotIndex: 0,
        eligibleVideos: [
          {
            reelScriptId: "22222222-2222-4222-8222-222222222222",
            slotIndex: 0,
            tema: "Intro",
            estimatedCostCents: 45,
            confirmEstimateCents: 45,
            charCount: 120,
          },
        ],
        spendHintTemplate: "About {amount}",
      },
      actions: APPROVE_CHANGE,
    });
    assert.equal(card.type, "voice_cost");
  });

  it("parses status_summary", () => {
    assert.equal(
      parseAgentCard({
        type: "status_summary",
        title: "Campaign",
        props: { lines: ["2 waiting", "1 ready"] },
        actions: [],
      }).type,
      "status_summary",
    );
  });

  it("parses clarifying_question", () => {
    const card = parseAgentCard({
      type: "clarifying_question",
      title: "Quick question",
      summary: "Pick one",
      props: {
        question: "Which tone?",
        options: [
          { id: "friendly", label: "Friendly" },
          { id: "pro", label: "Professional" },
        ],
      },
      actions: [],
    });
    assert.equal(card.type, "clarifying_question");
    assert.equal(card.props.options.length, 2);
  });

  it("parses next_step_chips", () => {
    assert.equal(
      parseAgentCard({
        type: "next_step_chips",
        props: {
          chips: [{ id: "a", text: "Approve all" }],
        },
        actions: [],
      }).type,
      "next_step_chips",
    );
  });

  it("parses progress", () => {
    assert.equal(
      parseAgentCard({
        type: "progress",
        title: "Where you are",
        props: {
          steps: [
            {
              key: "plan",
              label: "Plan",
              status: "current",
              statusLabel: "Now",
            },
          ],
        },
        actions: [],
      }).type,
      "progress",
    );
  });

  it("rejects unknown type", () => {
    const result = safeParseAgentCard({
      type: "not_a_real_card",
      title: "x",
      props: {},
      actions: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects more than two primary actions", () => {
    const result = safeParseAgentCard({
      type: "plan_approval",
      title: "Plan",
      summary: "x",
      props: {},
      actions: [
        { id: "a", label: "A", role: "primary" },
        { id: "b", label: "B", role: "primary" },
        { id: "c", label: "C", role: "primary" },
      ],
    });
    assert.equal(result.success, false);
  });
});
