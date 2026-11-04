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

  it("confirm_tts_generation is distinct from video paid confirm", async () => {
    const { proposeConfirmTtsGenerationOutputSchema: schema } = await import(
      "./orchestrator-chat"
    );
    const reelScriptId = "44444444-4444-4444-8444-444444444444";
    const parsed = schema.parse({
      ok: true,
      proposal: {
        kind: "confirm_tts_generation",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: true,
        estimatedCostCents: 1,
        confirmEstimateCents: 1,
        summary: "Creating the voice costs about $0.01.",
        weekStart: WEEK,
        slotIndex: 0,
        reelScriptId,
        styleLabel: "voice",
        paidKind: "tts",
        action: "confirmTtsGenerationFromChat",
        charCount: 120,
        eligibleVideos: [
          {
            reelScriptId,
            slotIndex: 0,
            tema: "Promo",
            estimatedCostCents: 1,
            confirmEstimateCents: 1,
            charCount: 120,
          },
          {
            reelScriptId: "55555555-5555-4555-8555-555555555555",
            slotIndex: 1,
            tema: "Tips",
            estimatedCostCents: 2,
            confirmEstimateCents: 2,
            charCount: 200,
          },
        ],
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
    assert.equal(parsed.proposal.paidKind, "tts");
    assert.equal(parsed.proposal.styleLabel, "voice");
    assert.equal(parsed.proposal.eligibleVideos.length, 2);
  });

  it("enable_own_avatar is non-mutating Preferencias proposal", async () => {
    const { proposeEnableOwnAvatarOutputSchema: schema } = await import(
      "./orchestrator-chat"
    );
    const parsed = schema.parse({
      ok: true,
      proposal: {
        kind: "enable_own_avatar",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: false,
        estimatedCostCents: null,
        summary: "Enable on-camera videos in Preferences.",
        action: "upsertVisualPreferences",
        allowedModes: ["faceless", "own_avatar"],
        facelessStyle: {
          voice: "ai_voiceover",
          onScreenText: "captions",
          broll: "stock",
        },
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
    assert.equal(parsed.proposal.action, "upsertVisualPreferences");
  });

  it("enable_own_avatar redirects to consent card when consent missing", async () => {
    const { proposeEnableOwnAvatarOutputSchema: schema } = await import(
      "./orchestrator-chat"
    );
    const parsed = schema.parse({
      ok: true,
      redirectedToConsent: true,
      proposal: {
        kind: "grant_presenter_consent",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: false,
        estimatedCostCents: null,
        summary: "Confirm photo consent.",
        action: "grantAvatarConsent",
      },
    });
    assertProposalIsNonMutating(parsed.proposal);
    assert.equal(parsed.proposal.kind, "grant_presenter_consent");
    assert.ok("redirectedToConsent" in parsed && parsed.redirectedToConsent === true);
  });

  it("interview chat tools are non-mutating proposals + status shape", async () => {
    const {
      getInterviewStatusOutputSchema: statusSchema,
      proposeSaveInterviewAnswerOutputSchema: saveSchema,
      proposeSubmitInterviewOutputSchema: submitSchema,
    } = await import("./orchestrator-chat");

    statusSchema.parse({
      ok: true,
      status: "in_progress",
      currentStep: "services",
      stepIndex: 1,
      totalSteps: 7,
      answeredCount: 0,
      stepLabel: "Services",
      question: "What services do you offer?",
      helper: "List the services customers can hire you for.",
      answerKind: "list",
      canSubmit: false,
      interviewHref: "/interview",
      progressLabel: "1 / 7",
    });

    const save = saveSchema.parse({
      ok: true,
      proposal: {
        kind: "save_interview_answer",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: false,
        estimatedCostCents: null,
        summary: "Save your Services answer.",
        action: "persistInterviewDraft",
        currentStep: "services",
        stepLabel: "Services",
        answerPreview: "Emergency plumbing",
        items: ["Emergency plumbing"],
      },
    });
    assertProposalIsNonMutating(save.proposal);

    const submit = submitSchema.parse({
      ok: true,
      proposal: {
        kind: "submit_interview",
        requiresConfirmation: true,
        mutates: false,
        incursSpend: false,
        estimatedCostCents: null,
        summary: "Submit the finished interview.",
        action: "submitInterview",
      },
    });
    assertProposalIsNonMutating(submit.proposal);
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

  it("KAN-95 conversation persistence contracts accept round-trip shapes", async () => {
    const {
      orchestratorPersistedMessageSchema: msgSchema,
      orchestratorConversationSchema: convoSchema,
      loadLatestOrchestratorConversationResultSchema: loadSchema,
      persistOrchestratorChatInputSchema: persistSchema,
    } = await import("./orchestrator-chat");

    const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const message = msgSchema.parse({
      id: "msg_abc123",
      role: "user",
      parts: [{ type: "text", text: "How is my campaign?" }],
    });
    assert.equal(message.role, "user");

    const conversation = convoSchema.parse({
      id: conversationId,
      title: "How is my campaign?",
      createdAt: "2026-11-04T12:00:00.000Z",
      updatedAt: "2026-11-04T12:05:00.000Z",
    });
    assert.equal(conversation.id, conversationId);

    loadSchema.parse({
      ok: true,
      conversation,
      messages: [message],
    });

    persistSchema.parse({
      conversationId,
      messages: [message],
    });

    assert.equal(
      persistSchema.safeParse({
        conversationId: "not-a-uuid",
        messages: [],
      }).success,
      false,
    );
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
