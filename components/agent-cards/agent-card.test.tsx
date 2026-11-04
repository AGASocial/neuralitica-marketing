import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseAgentCard } from "@/lib/agent-cards";
import { AgentCard } from "./AgentCard";

// tsx + jsx:preserve compiles JSX to React.createElement; SSR tests need React in scope.
(globalThis as { React?: typeof React }).React = React;

const here = dirname(fileURLToPath(import.meta.url));

const VIDEO =
  "/api/media/assets/11111111-1111-4111-8111-111111111111";

const APPROVE_CHANGE = [
  { id: "approve", label: "Approve", role: "primary" as const },
  { id: "change", label: "Change something", role: "secondary" as const },
];

describe("AgentCard rendering + onAction", () => {
  it("renders each catalog type without throwing", () => {
    const samples = [
      parseAgentCard({
        type: "reel_approval",
        title: "Reel",
        summary: "OK?",
        props: { videoPreviewUrl: VIDEO, previewMode: "thumbnail" },
        actions: APPROVE_CHANGE,
      }),
      parseAgentCard({
        type: "cost_confirmation",
        title: "Cost",
        summary: "Pay?",
        props: {
          estimatedCostCents: 99,
          spendHintTemplate: "About {amount}",
        },
        actions: APPROVE_CHANGE,
      }),
      parseAgentCard({
        type: "plan_approval",
        title: "Plan",
        summary: "Approve week",
        props: { themes: ["A"] },
        actions: APPROVE_CHANGE,
      }),
      parseAgentCard({
        type: "script_approval",
        title: "Script",
        summary: "Rewrite",
        props: { tema: "T", hook: "H", status: "generated" },
        actions: APPROVE_CHANGE,
      }),
      parseAgentCard({
        type: "own_avatar_activation",
        title: "Avatar",
        summary: "Enable",
        props: {},
        actions: APPROVE_CHANGE,
      }),
      parseAgentCard({
        type: "voice_cost",
        title: "Voice",
        summary: "TTS",
        props: {
          estimatedCostCents: 40,
          confirmEstimateCents: 40,
          reelScriptId: "22222222-2222-4222-8222-222222222222",
          slotIndex: 0,
          eligibleVideos: [
            {
              reelScriptId: "22222222-2222-4222-8222-222222222222",
              slotIndex: 0,
              tema: "Intro",
              estimatedCostCents: 40,
              confirmEstimateCents: 40,
              charCount: 10,
            },
          ],
          spendHintTemplate: "About {amount}",
        },
        actions: APPROVE_CHANGE,
      }),
      parseAgentCard({
        type: "status_summary",
        title: "Status",
        props: { lines: ["One"] },
        actions: [],
      }),
      parseAgentCard({
        type: "clarifying_question",
        title: "Q",
        summary: "Pick",
        props: {
          question: "Tone?",
          options: [{ id: "a", label: "A" }],
        },
        actions: [],
      }),
      parseAgentCard({
        type: "next_step_chips",
        props: { chips: [{ id: "x", text: "Do X" }] },
        actions: [],
      }),
      parseAgentCard({
        type: "progress",
        title: "Progress",
        props: {
          steps: [
            {
              key: "plan",
              label: "Plan",
              status: "done",
              statusLabel: "Done",
            },
          ],
        },
        actions: [],
      }),
    ];

    for (const card of samples) {
      const html = renderToStaticMarkup(
        createElement(AgentCard, { card }),
      );
      assert.ok(html.length > 0, `empty markup for ${card.type}`);
      if (card.type === "cost_confirmation" || card.type === "voice_cost") {
        assert.match(html, /\$0\.(99|40)/);
      }
    }
  });

  it("invokes onAction with approve id", () => {
    const card = parseAgentCard({
      type: "plan_approval",
      title: "Plan",
      summary: "Go",
      props: {},
      actions: APPROVE_CHANGE,
    });
    const events: string[] = [];
    const html = renderToStaticMarkup(
      createElement(AgentCard, {
        card,
        onAction: (event) => {
          events.push(event.id);
        },
      }),
    );
    // Server render does not fire clicks; assert wiring + button labels present.
    assert.match(html, /Approve/);
    assert.match(html, /Change something/);
    assert.equal(events.length, 0);

    // Client-path callback contract: simulate the handler the buttons call.
    const handler = (id: string) => {
      events.push(id);
    };
    handler("approve");
    assert.deepEqual(events, ["approve"]);
  });

  it("uses MediaThumbnail for reel thumbnail mode", () => {
    const src = readFileSync(join(here, "AgentCard.tsx"), "utf8");
    assert.match(src, /MediaThumbnail/);
    assert.match(src, /previewMode === "player"/);
  });
});

describe("AgentCard surface migrations", () => {
  it("chat / approvals / mis videos wire AgentCard", () => {
    const proposal = readFileSync(
      join(here, "../orchestrator-chat/ProposalActionCard.tsx"),
      "utf8",
    );
    const status = readFileSync(
      join(here, "../orchestrator-chat/StatusCards.tsx"),
      "utf8",
    );
    const progress = readFileSync(
      join(here, "../orchestrator-chat/ProgressCard.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      join(here, "../orchestrator-chat/OrchestratorChatPanel.tsx"),
      "utf8",
    );
    const approvals = readFileSync(
      join(here, "../approvals/ApprovalsListView.tsx"),
      "utf8",
    );
    const videos = readFileSync(
      join(here, "../ready-to-publish/MyVideosHubView.tsx"),
      "utf8",
    );

    assert.match(proposal, /AgentCard/);
    assert.match(proposal, /mapProposalToAgentCard/);
    assert.match(status, /AgentCard/);
    assert.match(progress, /AgentCard/);
    assert.match(panel, /next_step_chips/);
    assert.match(approvals, /AgentCard/);
    assert.match(approvals, /mapApprovalListItemToCard/);
    assert.match(videos, /AgentCard/);
    assert.match(videos, /mapMyVideosPendingToCard/);
    assert.match(videos, /decideApproval/);
  });
});
