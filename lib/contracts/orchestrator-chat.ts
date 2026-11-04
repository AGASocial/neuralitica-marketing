/**
 * Orchestrator chat contracts (KAN-84 / ADR-0009).
 * Tool I/O is zod-strict; action tools return proposals only (no mutation).
 */
import { z } from "zod";

import { trendWeekStartSchema } from "@/lib/contracts/trend";

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
] as const;

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
      captionPreview: z.string().max(200).optional(),
    }),
  })
  .strict();

export type ProposeApprovePendingVideoOutput = z.infer<
  typeof proposeApprovePendingVideoOutputSchema
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
