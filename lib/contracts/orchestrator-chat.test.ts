import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertProposalIsNonMutating,
  getScriptsStatusOutputSchema,
  getWeeklyStrategyOutputSchema,
  listCampaignStatusInputSchema,
  listCampaignStatusOutputSchema,
  orchestratorProposalMetaSchema,
  proposeApprovePendingVideoOutputSchema,
  proposeApproveStrategyOutputSchema,
  proposeGenerateStrategyOutputSchema,
  type OrchestratorProposalMeta,
} from "./orchestrator-chat";

const WEEK = "2026-11-02";

describe("orchestrator-chat contracts", () => {
  it("listCampaignStatus input rejects unknown keys", () => {
    const result = listCampaignStatusInputSchema.safeParse({
      weekStart: WEEK,
      hack: true,
    });
    assert.equal(result.success, false);
  });

  it("listCampaignStatus output accepts owner summary", () => {
    const parsed = listCampaignStatusOutputSchema.parse({
      ok: true,
      role: "client",
      weekStart: WEEK,
      pendingApprovalsCount: 2,
      approvedReadyCount: 1,
      pendingApprovals: [],
      strategyStatus: "draft",
    });
    assert.equal(parsed.pendingApprovalsCount, 2);
  });

  it("getWeeklyStrategy output allows null plan", () => {
    const parsed = getWeeklyStrategyOutputSchema.parse({
      ok: true,
      weekStart: WEEK,
      strategy: null,
    });
    assert.equal(parsed.strategy, null);
  });

  it("getScriptsStatus output accepts items", () => {
    const parsed = getScriptsStatusOutputSchema.parse({
      ok: true,
      weekStart: WEEK,
      approvedStrategyId: null,
      items: [
        {
          slotIndex: 0,
          scriptId: null,
          tema: "Fix a leaky faucet tip",
          status: "pending",
          modalidad: "faceless",
        },
      ],
    });
    assert.equal(parsed.items.length, 1);
  });

  it("proposal meta requires confirmation and forbids mutate", () => {
    const meta: OrchestratorProposalMeta = {
      kind: "generate_strategy",
      requiresConfirmation: true,
      mutates: false,
      incursSpend: true,
      estimatedCostCents: null,
      summary: "Create this week’s plan.",
    };
    assert.doesNotThrow(() => assertProposalIsNonMutating(meta));
    assert.equal(
      orchestratorProposalMetaSchema.safeParse({
        ...meta,
        mutates: true,
      }).success,
      false,
    );
    assert.equal(
      orchestratorProposalMetaSchema.safeParse({
        ...meta,
        requiresConfirmation: false,
      }).success,
      false,
    );
  });

  it("proposeGenerateStrategy output is non-mutating proposal", () => {
    const parsed = proposeGenerateStrategyOutputSchema.parse({
      ok: true,
      proposal: {
        kind: "generate_strategy",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: true,
        estimatedCostCents: null,
        summary: "Create this week’s content plan.",
        weekStart: WEEK,
        action: "generateContentStrategy",
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
    assert.equal(parsed.proposal.mutates, false);
  });

  it("proposeApproveStrategy output is non-mutating proposal", () => {
    const strategyId = "11111111-1111-4111-8111-111111111111";
    const parsed = proposeApproveStrategyOutputSchema.parse({
      ok: true,
      proposal: {
        kind: "approve_strategy",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: false,
        estimatedCostCents: null,
        summary: "Approve this week’s plan.",
        weekStart: WEEK,
        strategyId,
        action: "approveContentStrategy",
        slotCount: 3,
        themes: ["Local trust"],
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
  });

  it("proposeApprovePendingVideo output is non-mutating proposal", () => {
    const approvalId = "22222222-2222-4222-8222-222222222222";
    const parsed = proposeApprovePendingVideoOutputSchema.parse({
      ok: true,
      proposal: {
        kind: "approve_pending_video",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: false,
        estimatedCostCents: null,
        summary: "Approve this video.",
        approvalId,
        action: "decideApproval",
        decision: "approved",
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
    assert.equal(parsed.proposal.action, "decideApproval");
  });
});
