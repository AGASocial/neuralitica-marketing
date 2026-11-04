/**
 * Orchestrator chat contracts (KAN-84 / ADR-0009).
 * Tool I/O is zod-strict; action tools return proposals only (no mutation).
 */
import { z } from "zod";

import { interviewStepKeySchema } from "@/lib/contracts/interview";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import {
  facelessStyleSchema,
  visualModalitySchema,
} from "@/lib/contracts/visual-preferences";

/**
 * Default orchestration model via AI Gateway.
 * flash-lite leaked chain-of-thought + tool names into owner-visible text in
 * prod smoke; gemini-2.5-flash is the minimum reliable default (ADR-0009).
 * Override with ORCHESTRATOR_CHAT_MODEL. KAN-97 may re-eval.
 */
export const ORCHESTRATOR_CHAT_DEFAULT_MODEL =
  "google/gemini-2.5-flash" as const;

export const ORCHESTRATOR_PROPOSAL_KINDS = [
  "generate_strategy",
  "approve_strategy",
  "approve_pending_video",
  "generate_scripts",
  "generate_videos",
  "request_video_changes",
  "regenerate_script",
  "confirm_paid_generation",
  "grant_presenter_consent",
  "set_presenter_voice",
  "save_interview_answer",
  "submit_interview",
  "enable_own_avatar",
  "confirm_tts_generation",
] as const;

/** Owner-safe media preview path (same shape as approval packages). */
export const orchestratorPreviewUrlSchema = z
  .string()
  .regex(/^\/api\/media\/assets\/[0-9a-f-]{36}$/i);

export const orchestratorProposalKindSchema = z.enum(ORCHESTRATOR_PROPOSAL_KINDS);
export type OrchestratorProposalKind = z.infer<
  typeof orchestratorProposalKindSchema
>;

/** Marker every action-tool output must carry — UI requires explicit Approve. */
export const orchestratorProposalMetaSchema = z
  .object({
    kind: orchestratorProposalKindSchema,
    requiresConfirmation: z.literal(true),
    mutates: z.literal(false),
    incursSpend: z.boolean(),
    estimatedCostCents: z.number().int().nonnegative().nullable(),
    summary: z.string().trim().min(1).max(500),
  })
  .strict();

export type OrchestratorProposalMeta = z.infer<
  typeof orchestratorProposalMetaSchema
>;

export const listCampaignStatusInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict();

export type ListCampaignStatusInput = z.infer<
  typeof listCampaignStatusInputSchema
>;

export const campaignStatusApprovalItemSchema = z
  .object({
    approvalId: z.string().uuid(),
    status: z.string().min(1).max(40),
    captionPreview: z.string().max(200).optional(),
  })
  .strict();

export const listCampaignStatusOutputSchema = z
  .object({
    ok: z.literal(true),
    role: z.enum(["client", "operator"]),
    weekStart: trendWeekStartSchema.optional(),
    pendingApprovalsCount: z.number().int().nonnegative(),
    approvedReadyCount: z.number().int().nonnegative(),
    pendingApprovals: z.array(campaignStatusApprovalItemSchema).max(10),
    strategyStatus: z.enum(["none", "draft", "approved", "unknown"]).optional(),
    strategyId: z.string().uuid().optional(),
    scriptsGeneratedCount: z.number().int().nonnegative().optional(),
    scriptsPendingCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ListCampaignStatusOutput = z.infer<
  typeof listCampaignStatusOutputSchema
>;

export const getWeeklyStrategyInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict();

export type GetWeeklyStrategyInput = z.infer<
  typeof getWeeklyStrategyInputSchema
>;

export const strategySlotPreviewSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(6),
    tema: z.string().max(200),
    goal: z.string().max(40),
    formatoPlaybookSlug: z.string().max(80),
    modalidad: z.string().max(40),
  })
  .strict();

export const getWeeklyStrategyOutputSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    strategy: z
      .object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        status: z.enum(["draft", "approved"]),
        pillars: z.array(z.string().max(80)).max(8),
        themes: z.array(z.string().max(200)).max(8),
        slots: z.array(strategySlotPreviewSchema).max(7),
        isEditable: z.boolean(),
      })
      .nullable(),
  })
  .strict();

export type GetWeeklyStrategyOutput = z.infer<
  typeof getWeeklyStrategyOutputSchema
>;

export const getScriptsStatusInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict();

export type GetScriptsStatusInput = z.infer<typeof getScriptsStatusInputSchema>;

export const scriptStatusItemSchema = z
  .object({
    slotIndex: z.number().int().min(0).max(6),
    scriptId: z.string().uuid().nullable(),
    tema: z.string().max(200),
    status: z.enum(["pending", "generated"]),
    modalidad: z.string().max(40),
  })
  .strict();

export const getScriptsStatusOutputSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    approvedStrategyId: z.string().uuid().nullable(),
    items: z.array(scriptStatusItemSchema).max(7),
  })
  .strict();

export type GetScriptsStatusOutput = z.infer<
  typeof getScriptsStatusOutputSchema
>;

export const proposeGenerateStrategyInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict();

export type ProposeGenerateStrategyInput = z.infer<
  typeof proposeGenerateStrategyInputSchema
>;

export const proposeGenerateStrategyOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("generate_strategy"),
      weekStart: trendWeekStartSchema,
      action: z.literal("generateContentStrategy"),
    }),
  })
  .strict();

export type ProposeGenerateStrategyOutput = z.infer<
  typeof proposeGenerateStrategyOutputSchema
>;

export const proposeApproveStrategyInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
    strategyId: z.string().uuid().optional(),
  })
  .strict();

export type ProposeApproveStrategyInput = z.infer<
  typeof proposeApproveStrategyInputSchema
>;

export const proposeApproveStrategyOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("approve_strategy"),
      weekStart: trendWeekStartSchema,
      strategyId: z.string().uuid(),
      action: z.literal("approveContentStrategy"),
      slotCount: z.number().int().min(0).max(7),
      themes: z.array(z.string().max(200)).max(8),
    }),
  })
  .strict();

export type ProposeApproveStrategyOutput = z.infer<
  typeof proposeApproveStrategyOutputSchema
>;

export const proposeApprovePendingVideoInputSchema = z
  .object({
    approvalId: z.string().uuid().optional(),
  })
  .strict();

export type ProposeApprovePendingVideoInput = z.infer<
  typeof proposeApprovePendingVideoInputSchema
>;

export const proposeApprovePendingVideoOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("approve_pending_video"),
      approvalId: z.string().uuid(),
      action: z.literal("decideApproval"),
      decision: z.literal("approved"),
      captionPreview: z.string().max(500).optional(),
      videoPreviewUrl: orchestratorPreviewUrlSchema.optional(),
      coverPreviewUrl: orchestratorPreviewUrlSchema.optional(),
    }),
  })
  .strict();

export type ProposeApprovePendingVideoOutput = z.infer<
  typeof proposeApprovePendingVideoOutputSchema
>;

export const getVideoPreviewInputSchema = z
  .object({
    approvalId: z.string().uuid().optional(),
  })
  .strict();

export type GetVideoPreviewInput = z.infer<typeof getVideoPreviewInputSchema>;

export const getVideoPreviewOutputSchema = z
  .object({
    ok: z.literal(true),
    approvalId: z.string().uuid(),
    status: z.string().min(1).max(40),
    videoPreviewUrl: orchestratorPreviewUrlSchema,
    coverPreviewUrl: orchestratorPreviewUrlSchema.optional(),
    captionBody: z.string().max(2000),
    selectedCtaText: z.string().max(200).optional(),
  })
  .strict();

export type GetVideoPreviewOutput = z.infer<typeof getVideoPreviewOutputSchema>;

export const getScriptPreviewInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
    slotIndex: z.number().int().min(0).max(6).optional(),
  })
  .strict();

export type GetScriptPreviewInput = z.infer<typeof getScriptPreviewInputSchema>;

export const getScriptPreviewOutputSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slotIndex: z.number().int().min(0).max(6),
    scriptId: z.string().uuid().nullable(),
    tema: z.string().max(200),
    status: z.enum(["pending", "generated"]),
    hook: z.string().max(500).optional(),
    body: z.string().max(2000).optional(),
    cta: z.string().max(300).optional(),
  })
  .strict();

export type GetScriptPreviewOutput = z.infer<
  typeof getScriptPreviewOutputSchema
>;

export const proposeRequestVideoChangesInputSchema = z
  .object({
    approvalId: z.string().uuid().optional(),
    changeSummary: z.string().trim().min(1).max(500),
    tags: z
      .array(z.enum(["script", "caption", "assembly", "branding"]))
      .min(1)
      .max(4)
      .optional(),
  })
  .strict();

export type ProposeRequestVideoChangesInput = z.infer<
  typeof proposeRequestVideoChangesInputSchema
>;

export const proposeRequestVideoChangesOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("request_video_changes"),
      approvalId: z.string().uuid(),
      action: z.literal("decideApproval"),
      decision: z.literal("request_changes"),
      changeSummary: z.string().min(1).max(500),
      tags: z
        .array(z.enum(["script", "caption", "assembly", "branding"]))
        .min(1)
        .max(4),
      videoPreviewUrl: orchestratorPreviewUrlSchema.optional(),
      coverPreviewUrl: orchestratorPreviewUrlSchema.optional(),
      captionPreview: z.string().max(500).optional(),
    }),
  })
  .strict();

export type ProposeRequestVideoChangesOutput = z.infer<
  typeof proposeRequestVideoChangesOutputSchema
>;

export const proposeRegenerateScriptInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
    slotIndex: z.number().int().min(0).max(6),
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type ProposeRegenerateScriptInput = z.infer<
  typeof proposeRegenerateScriptInputSchema
>;

export const proposeRegenerateScriptOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("regenerate_script"),
      weekStart: trendWeekStartSchema,
      slotIndex: z.number().int().min(0).max(6),
      action: z.literal("regenerateReelScriptSlot"),
      changeSummary: z.string().max(500).optional(),
      tema: z.string().max(200).optional(),
      hook: z.string().max(500).optional(),
      body: z.string().max(2000).optional(),
      cta: z.string().max(300).optional(),
    }),
  })
  .strict();

export type ProposeRegenerateScriptOutput = z.infer<
  typeof proposeRegenerateScriptOutputSchema
>;

export const proposeGenerateScriptsInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict();

export type ProposeGenerateScriptsInput = z.infer<
  typeof proposeGenerateScriptsInputSchema
>;

export const proposeGenerateScriptsOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("generate_scripts"),
      weekStart: trendWeekStartSchema,
      action: z.literal("generateReelScripts"),
      pendingSlotCount: z.number().int().min(0).max(7),
    }),
  })
  .strict();

export type ProposeGenerateScriptsOutput = z.infer<
  typeof proposeGenerateScriptsOutputSchema
>;

export const proposeGenerateVideosInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict();

export type ProposeGenerateVideosInput = z.infer<
  typeof proposeGenerateVideosInputSchema
>;

export const proposeGenerateVideosOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("generate_videos"),
      weekStart: trendWeekStartSchema,
      action: z.literal("generateReelScripts"),
      readyScriptCount: z.number().int().min(0).max(7),
      /** Paid media starts only after a later cost-confirm card (KAN-93). */
      paidMediaRequiresCostConfirm: z.literal(true),
    }),
  })
  .strict();

export type ProposeGenerateVideosOutput = z.infer<
  typeof proposeGenerateVideosOutputSchema
>;

export const guidedProgressStepKeySchema = z.enum([
  "interview",
  "plan",
  "scripts",
  "videos",
  "approve",
  "ready",
]);

export type GuidedProgressStepKey = z.infer<typeof guidedProgressStepKeySchema>;

export const guidedProgressStepSchema = z
  .object({
    key: guidedProgressStepKeySchema,
    status: z.enum(["todo", "current", "done"]),
  })
  .strict();

export const getGuidedProgressInputSchema = z.object({}).strict();

export type GetGuidedProgressInput = z.infer<
  typeof getGuidedProgressInputSchema
>;

export const getGuidedProgressOutputSchema = z
  .object({
    ok: z.literal(true),
    interviewStatus: z.enum(["not_started", "in_progress", "completed"]),
    interviewHref: z.literal("/interview"),
    weekStart: trendWeekStartSchema,
    strategyStatus: z.enum(["none", "draft", "approved", "unknown"]),
    scriptsReadyCount: z.number().int().nonnegative(),
    scriptsPendingCount: z.number().int().nonnegative(),
    pendingApprovalsCount: z.number().int().nonnegative(),
    readyVideosCount: z.number().int().nonnegative(),
    steps: z.array(guidedProgressStepSchema).min(1).max(8),
    nextStepKey: guidedProgressStepKeySchema,
    nextStepHint: z.string().min(1).max(300),
  })
  .strict();

export type GetGuidedProgressOutput = z.infer<
  typeof getGuidedProgressOutputSchema
>;

export const getSetupStatusInputSchema = z.object({}).strict();

export const getSetupStatusStepSchema = z
  .object({
    id: z.enum([
      "business_profile",
      "interview",
      "visual_preferences",
      "instagram_connected",
      "plan_approved",
      "presenter_avatar",
    ]),
    done: z.boolean(),
    required: z.boolean(),
  })
  .strict();

export const getSetupStatusOutputSchema = z
  .object({
    ok: z.literal(true),
    percentComplete: z.number().int().min(0).max(100),
    requiredDone: z.number().int().min(0),
    requiredTotal: z.number().int().min(1),
    steps: z.array(getSetupStatusStepSchema).min(1),
  })
  .strict();

export type GetSetupStatusOutput = z.infer<typeof getSetupStatusOutputSchema>;

export const suggestNextActionsInputSchema = z.object({}).strict();

export type SuggestNextActionsInput = z.infer<
  typeof suggestNextActionsInputSchema
>;

export const suggestNextActionItemSchema = z
  .object({
    id: z.enum([
      "finishSetup",
      "showPendingApprovals",
      "makeWeeklyPlan",
      "howIsCampaign",
      "writeScripts",
    ]),
    text: z.string().min(1).max(200),
  })
  .strict();

export const suggestNextActionsOutputSchema = z
  .object({
    ok: z.literal(true),
    actions: z.array(suggestNextActionItemSchema).max(5),
  })
  .strict();

export type SuggestNextActionsOutput = z.infer<
  typeof suggestNextActionsOutputSchema
>;

export const getReadyVideoDownloadInputSchema = z
  .object({
    approvalId: z.string().uuid().optional(),
  })
  .strict();

export type GetReadyVideoDownloadInput = z.infer<
  typeof getReadyVideoDownloadInputSchema
>;

export const getReadyVideoDownloadOutputSchema = z
  .object({
    ok: z.literal(true),
    approvalId: z.string().uuid(),
    videoPreviewUrl: orchestratorPreviewUrlSchema,
    downloadUrl: orchestratorPreviewUrlSchema,
    coverPreviewUrl: orchestratorPreviewUrlSchema.optional(),
    captionBody: z.string().max(2000).optional(),
    readyToPublishHref: z.literal("/ready-to-publish"),
  })
  .strict();

export type GetReadyVideoDownloadOutput = z.infer<
  typeof getReadyVideoDownloadOutputSchema
>;

export const proposeConfirmPaidGenerationInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
    slotIndex: z.number().int().min(0).max(6).optional(),
    reelScriptId: z.string().uuid().optional(),
  })
  .strict();

export type ProposeConfirmPaidGenerationInput = z.infer<
  typeof proposeConfirmPaidGenerationInputSchema
>;

export const proposeConfirmPaidGenerationOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("confirm_paid_generation"),
      weekStart: trendWeekStartSchema,
      slotIndex: z.number().int().min(0).max(6),
      reelScriptId: z.string().uuid(),
      tema: z.string().max(200).optional(),
      /** Plain owner label: on-camera vs images-and-text. */
      styleLabel: z.enum(["presenter", "images_and_text"]),
      paidKind: z.enum(["broll", "heygen"]),
      action: z.literal("confirmPaidGenerationFromChat"),
      /** Must match live estimate at Approve time for heygen. */
      confirmEstimateCents: z.number().int().nonnegative(),
      targetDurationSec: z.number().int().positive().max(120).optional(),
      incursSpend: z.literal(true),
      estimatedCostCents: z.number().int().nonnegative(),
    }),
  })
  .strict();

export type ProposeConfirmPaidGenerationOutput = z.infer<
  typeof proposeConfirmPaidGenerationOutputSchema
>;

/** Client → server action body for paid confirm (no clientId — server fills). */
export const confirmPaidGenerationFromChatInputSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    paidKind: z.enum(["broll", "heygen"]),
    confirmEstimateCents: z.number().int().nonnegative(),
    targetDurationSec: z.number().int().positive().max(120).optional(),
  })
  .strict();

export type ConfirmPaidGenerationFromChatInput = z.infer<
  typeof confirmPaidGenerationFromChatInputSchema
>;

export const getPresenterSetupStatusInputSchema = z.object({}).strict();

export const getPresenterSetupStatusOutputSchema = z
  .object({
    ok: z.literal(true),
    consentActive: z.boolean(),
    onCameraEnabled: z.boolean(),
    hasPresenterConfig: z.boolean(),
    gender: z.enum(["male", "female"]).nullable(),
    language: z.enum(["en", "es"]).nullable(),
    nextHint: z.string().min(1).max(300),
  })
  .strict();

export type GetPresenterSetupStatusOutput = z.infer<
  typeof getPresenterSetupStatusOutputSchema
>;

export const proposeGrantPresenterConsentInputSchema = z.object({}).strict();

export const proposeGrantPresenterConsentOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("grant_presenter_consent"),
      action: z.literal("grantAvatarConsent"),
      incursSpend: z.literal(false),
      estimatedCostCents: z.null(),
    }),
  })
  .strict();

export type ProposeGrantPresenterConsentOutput = z.infer<
  typeof proposeGrantPresenterConsentOutputSchema
>;

export const proposeSetPresenterVoiceInputSchema = z
  .object({
    gender: z.enum(["male", "female"]),
    language: z.enum(["en", "es"]),
  })
  .strict();

export const proposeSetPresenterVoiceOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("set_presenter_voice"),
      action: z.literal("upsertAvatar"),
      gender: z.enum(["male", "female"]),
      language: z.enum(["en", "es"]),
      incursSpend: z.literal(false),
      estimatedCostCents: z.null(),
    }),
  })
  .strict();

export type ProposeSetPresenterVoiceOutput = z.infer<
  typeof proposeSetPresenterVoiceOutputSchema
>;

/** Chat-driven Entrevista (same neuramark_interview_sessions; no new tables). */
export const getInterviewStatusInputSchema = z.object({}).strict();

export type GetInterviewStatusInput = z.infer<
  typeof getInterviewStatusInputSchema
>;

export const getInterviewStatusOutputSchema = z
  .object({
    ok: z.literal(true),
    status: z.enum(["not_started", "in_progress", "completed"]),
    currentStep: interviewStepKeySchema,
    stepIndex: z.number().int().min(1).max(7),
    totalSteps: z.literal(7),
    answeredCount: z.number().int().min(0).max(7),
    stepLabel: z.string().min(1).max(80),
    question: z.string().min(1).max(300),
    helper: z.string().min(1).max(400),
    answerKind: z.enum(["list", "text"]),
    canSubmit: z.boolean(),
    interviewHref: z.literal("/interview"),
    progressLabel: z.string().min(1).max(40),
  })
  .strict();

export type GetInterviewStatusOutput = z.infer<
  typeof getInterviewStatusOutputSchema
>;

export const proposeSaveInterviewAnswerInputSchema = z
  .object({
    currentStep: interviewStepKeySchema,
    /** Text steps: zone / tone / style */
    description: z.string().trim().min(1).max(2000).optional(),
    /** List steps: services / offers / objections / restrictions (empty OK for restrictions) */
    items: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  })
  .strict();

export type ProposeSaveInterviewAnswerInput = z.infer<
  typeof proposeSaveInterviewAnswerInputSchema
>;

export const proposeSaveInterviewAnswerOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("save_interview_answer"),
      action: z.literal("persistInterviewDraft"),
      currentStep: interviewStepKeySchema,
      stepLabel: z.string().min(1).max(80),
      answerPreview: z.string().min(0).max(500),
      description: z.string().trim().min(1).max(2000).optional(),
      items: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
      incursSpend: z.literal(false),
      estimatedCostCents: z.null(),
    }),
  })
  .strict();

export type ProposeSaveInterviewAnswerOutput = z.infer<
  typeof proposeSaveInterviewAnswerOutputSchema
>;

export const proposeSubmitInterviewInputSchema = z.object({}).strict();

export type ProposeSubmitInterviewInput = z.infer<
  typeof proposeSubmitInterviewInputSchema
>;

export const proposeSubmitInterviewOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("submit_interview"),
      action: z.literal("submitInterview"),
      incursSpend: z.literal(false),
      estimatedCostCents: z.null(),
    }),
  })
  .strict();

export type ProposeSubmitInterviewOutput = z.infer<
  typeof proposeSubmitInterviewOutputSchema
>;

/**
 * Enable on-camera (`own_avatar`) modality via Preferencias upsert only.
 * Never starts HeyGen / avatar video generation.
 * If photo consent is missing, returns the grant_presenter_consent card instead.
 */
export const proposeEnableOwnAvatarInputSchema = z.object({}).strict();

export type ProposeEnableOwnAvatarInput = z.infer<
  typeof proposeEnableOwnAvatarInputSchema
>;

const enableOwnAvatarProposalSchema = orchestratorProposalMetaSchema.extend({
  kind: z.literal("enable_own_avatar"),
  action: z.literal("upsertVisualPreferences"),
  allowedModes: z.array(visualModalitySchema).min(1).max(3),
  facelessStyle: facelessStyleSchema.nullable(),
  incursSpend: z.literal(false),
  estimatedCostCents: z.null(),
});

/** Consent redirect when owner asks for on-camera but has not granted photo consent. */
const enableOwnAvatarConsentRedirectSchema = orchestratorProposalMetaSchema.extend({
  kind: z.literal("grant_presenter_consent"),
  action: z.literal("grantAvatarConsent"),
  incursSpend: z.literal(false),
  estimatedCostCents: z.null(),
});

export const proposeEnableOwnAvatarOutputSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      proposal: enableOwnAvatarProposalSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(true),
      redirectedToConsent: z.literal(true),
      proposal: enableOwnAvatarConsentRedirectSchema,
    })
    .strict(),
]);

export type ProposeEnableOwnAvatarOutput = z.infer<
  typeof proposeEnableOwnAvatarOutputSchema
>;

/** Eligible write-up option for the TTS cost card video picker. */
export const confirmTtsEligibleVideoSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    slotIndex: z.number().int().min(0).max(6),
    tema: z.string().max(200),
    estimatedCostCents: z.number().int().nonnegative(),
    confirmEstimateCents: z.number().int().nonnegative(),
    charCount: z.number().int().nonnegative(),
  })
  .strict();

export type ConfirmTtsEligibleVideo = z.infer<
  typeof confirmTtsEligibleVideoSchema
>;

/**
 * Separate TTS/voice spend confirm (KAN-84.15) — not b-roll/HeyGen.
 * Estimate from ElevenLabs catalog constants; nothing runs until Approve.
 * When no video is specified, defaults to the latest eligible script and
 * includes `eligibleVideos` for an in-card picker.
 */
export const proposeConfirmTtsGenerationInputSchema = z
  .object({
    weekStart: trendWeekStartSchema.optional(),
    slotIndex: z.number().int().min(0).max(6).optional(),
    reelScriptId: z.string().uuid().optional(),
  })
  .strict();

export type ProposeConfirmTtsGenerationInput = z.infer<
  typeof proposeConfirmTtsGenerationInputSchema
>;

export const proposeConfirmTtsGenerationOutputSchema = z
  .object({
    ok: z.literal(true),
    proposal: orchestratorProposalMetaSchema.extend({
      kind: z.literal("confirm_tts_generation"),
      weekStart: trendWeekStartSchema,
      slotIndex: z.number().int().min(0).max(6),
      reelScriptId: z.string().uuid(),
      tema: z.string().max(200).optional(),
      styleLabel: z.literal("voice"),
      paidKind: z.literal("tts"),
      action: z.literal("confirmTtsGenerationFromChat"),
      confirmEstimateCents: z.number().int().nonnegative(),
      charCount: z.number().int().nonnegative(),
      incursSpend: z.literal(true),
      estimatedCostCents: z.number().int().nonnegative(),
      /** Recent eligible write-ups for in-card picker (defaults to latest). */
      eligibleVideos: z.array(confirmTtsEligibleVideoSchema).min(1).max(7),
    }),
  })
  .strict();

export type ProposeConfirmTtsGenerationOutput = z.infer<
  typeof proposeConfirmTtsGenerationOutputSchema
>;

export const confirmTtsGenerationFromChatInputSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    confirmEstimateCents: z.number().int().nonnegative(),
  })
  .strict();

export type ConfirmTtsGenerationFromChatInput = z.infer<
  typeof confirmTtsGenerationFromChatInputSchema
>;

export const orchestratorToolErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.enum([
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "VALIDATION_ERROR",
      "NOT_FOUND",
      "INTERNAL",
    ]),
    message: z.string().max(300).optional(),
  })
  .strict();

export type OrchestratorToolError = z.infer<typeof orchestratorToolErrorSchema>;

export const chatAttachmentAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1).max(100),
  })
  .strict();

export type ChatAttachmentAsset = z.infer<typeof chatAttachmentAssetSchema>;

/** KAN-95: persisted conversation identity (UIMessage chat id). */
export const orchestratorConversationIdSchema = z.string().uuid();

export const orchestratorChatMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);

export type OrchestratorChatMessageRole = z.infer<
  typeof orchestratorChatMessageRoleSchema
>;

/** Opaque AI SDK UIMessage.id — not necessarily a UUID. */
export const orchestratorUiMessageIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128);

/**
 * Persisted UIMessage shape for resume (parts kept as JSON array;
 * tool/schema validation happens when messages are sent to the model).
 */
export const orchestratorPersistedMessageSchema = z
  .object({
    id: orchestratorUiMessageIdSchema,
    role: orchestratorChatMessageRoleSchema,
    parts: z.array(z.unknown()).max(200),
  })
  .strict();

export type OrchestratorPersistedMessage = z.infer<
  typeof orchestratorPersistedMessageSchema
>;

export const orchestratorConversationSchema = z
  .object({
    id: orchestratorConversationIdSchema,
    title: z.string().max(200),
    createdAt: z.string().min(1).max(40),
    updatedAt: z.string().min(1).max(40),
  })
  .strict();

export type OrchestratorConversation = z.infer<
  typeof orchestratorConversationSchema
>;

export const loadLatestOrchestratorConversationResultSchema = z
  .object({
    ok: z.literal(true),
    conversation: orchestratorConversationSchema.nullable(),
    messages: z.array(orchestratorPersistedMessageSchema).max(500),
  })
  .strict();

export type LoadLatestOrchestratorConversationResult = z.infer<
  typeof loadLatestOrchestratorConversationResultSchema
>;

export const persistOrchestratorChatInputSchema = z
  .object({
    conversationId: orchestratorConversationIdSchema,
    messages: z.array(orchestratorPersistedMessageSchema).max(500),
  })
  .strict();

export type PersistOrchestratorChatInput = z.infer<
  typeof persistOrchestratorChatInputSchema
>;

export const chatRequestBodySchema = z
  .object({
    id: orchestratorConversationIdSchema.optional(),
    messages: z.array(z.unknown()).max(500).optional(),
    locale: z.unknown().optional(),
  })
  .passthrough();

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;

/** Assert proposal outputs never claim mutation or skip confirmation. */
export function assertProposalIsNonMutating(
  proposal: OrchestratorProposalMeta,
): void {
  if (proposal.mutates !== false) {
    throw new Error("orchestrator_proposal_must_not_mutate");
  }
  if (proposal.requiresConfirmation !== true) {
    throw new Error("orchestrator_proposal_requires_confirmation");
  }
}
