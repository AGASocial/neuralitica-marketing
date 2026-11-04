import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertProposalIsNonMutating,
  getScriptsStatusOutputSchema,
  getWeeklyStrategyOutputSchema,
  listCampaignStatusInputSchema,
  listCampaignStatusOutputSchema,
  orchestratorProposalMetaSchema,
  ORCHESTRATOR_CHAT_DEFAULT_MODEL,
  proposeApprovePendingVideoOutputSchema,
  proposeApproveStrategyOutputSchema,
  proposeGenerateScriptsOutputSchema,
  proposeGenerateStrategyOutputSchema,
  proposeGenerateVideosOutputSchema,
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

  it("default model is gemini-2.5-flash (not flash-lite)", () => {
    assert.equal(ORCHESTRATOR_CHAT_DEFAULT_MODEL, "google/gemini-2.5-flash");
    assert.doesNotMatch(ORCHESTRATOR_CHAT_DEFAULT_MODEL, /flash-lite/);
  });

  it("proposeGenerateScripts output is non-mutating proposal", () => {
    const parsed = proposeGenerateScriptsOutputSchema.parse({
      ok: true,
      proposal: {
        kind: "generate_scripts",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: true,
        estimatedCostCents: null,
        summary: "Write this week’s video texts.",
        weekStart: WEEK,
        action: "generateReelScripts",
        pendingSlotCount: 3,
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
  });

  it("proposeGenerateVideos output flags paid media cost confirm", () => {
    const parsed = proposeGenerateVideosOutputSchema.parse({
      ok: true,
      proposal: {
        kind: "generate_videos",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: true,
        estimatedCostCents: null,
        summary: "Prepare generating your videos.",
        weekStart: WEEK,
        action: "generateReelScripts",
        readyScriptCount: 2,
        paidMediaRequiresCostConfirm: true,
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
    assert.equal(parsed.proposal.paidMediaRequiresCostConfirm, true);
  });

  it("guided progress and ready download schemas parse", async () => {
    const {
      getGuidedProgressOutputSchema: progressSchema,
      getReadyVideoDownloadOutputSchema: downloadSchema,
    } = await import("./orchestrator-chat");
    const assetId = "55555555-5555-4555-8555-555555555555";
    progressSchema.parse({
      ok: true,
      interviewStatus: "completed",
      interviewHref: "/interview",
      weekStart: WEEK,
      strategyStatus: "approved",
      scriptsReadyCount: 3,
      scriptsPendingCount: 0,
      pendingApprovalsCount: 1,
      readyVideosCount: 0,
      steps: [
        { key: "interview", status: "done" },
        { key: "plan", status: "done" },
        { key: "scripts", status: "done" },
        { key: "videos", status: "done" },
        { key: "approve", status: "current" },
        { key: "ready", status: "todo" },
      ],
      nextStepKey: "approve",
      nextStepHint: "Next: watch your videos.",
    });
    downloadSchema.parse({
      ok: true,
      approvalId: "66666666-6666-4666-8666-666666666666",
      videoPreviewUrl: `/api/media/assets/${assetId}`,
      downloadUrl: `/api/media/assets/${assetId}`,
      readyToPublishHref: "/ready-to-publish",
    });
  });

  it("confirm_paid_generation requires a concrete estimate", async () => {
    const { proposeConfirmPaidGenerationOutputSchema: schema } = await import(
      "./orchestrator-chat"
    );
    const parsed = schema.parse({
      ok: true,
      proposal: {
        kind: "confirm_paid_generation",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: true,
        estimatedCostCents: 120,
        confirmEstimateCents: 120,
        summary: "Creating this video costs about $1.20.",
        weekStart: WEEK,
        slotIndex: 0,
        reelScriptId: "44444444-4444-4444-8444-444444444444",
        styleLabel: "images_and_text",
        paidKind: "broll",
        action: "confirmPaidGenerationFromChat",
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
    assert.equal(parsed.proposal.estimatedCostCents, 120);
  });

  it("proposeRequestVideoChanges and regenerate_script are non-mutating", async () => {
    const {
      proposeRequestVideoChangesOutputSchema: reqSchema,
      proposeRegenerateScriptOutputSchema: regenSchema,
      getVideoPreviewOutputSchema: videoSchema,
      getScriptPreviewOutputSchema: scriptSchema,
    } = await import("./orchestrator-chat");
    const approvalId = "22222222-2222-4222-8222-222222222222";
    const assetId = "33333333-3333-4333-8333-333333333333";
    const req = reqSchema.parse({
      ok: true,
      proposal: {
        kind: "request_video_changes",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: false,
        estimatedCostCents: null,
        summary: "Request changes.",
        approvalId,
        action: "decideApproval",
        decision: "request_changes",
        changeSummary: "Make the opening shorter",
        tags: ["script"],
        videoPreviewUrl: `/api/media/assets/${assetId}`,
      },
    });
    assertProposalIsNonMutating(req.proposal);

    const regen = regenSchema.parse({
      ok: true,
      proposal: {
        kind: "regenerate_script",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: true,
        estimatedCostCents: null,
        summary: "Rewrite write-up.",
        weekStart: WEEK,
        slotIndex: 0,
        action: "regenerateReelScriptSlot",
        hook: "Hi neighbors",
        body: "We fix leaks fast.",
        cta: "Call us",
      },
    });
    assertProposalIsNonMutating(regen.proposal);

    videoSchema.parse({
      ok: true,
      approvalId,
      status: "pending",
      videoPreviewUrl: `/api/media/assets/${assetId}`,
      captionBody: "Caption",
    });
    scriptSchema.parse({
      ok: true,
      weekStart: WEEK,
      slotIndex: 0,
      scriptId: null,
      tema: "Tip",
      status: "pending",
    });
  });
});
