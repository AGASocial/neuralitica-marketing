/**
 * Shared agent card catalog (KAN-103 / ADR-0011).
 * A2UI-shaped (type + props + actions) without the A2UI dependency (ADR-0012).
 */
import { z } from "zod";

export const AGENT_CARD_TYPES = [
  "reel_approval",
  "cost_confirmation",
  "plan_approval",
  "script_approval",
  "own_avatar_activation",
  "voice_cost",
  "status_summary",
  "clarifying_question",
  "next_step_chips",
  "progress",
] as const;

export const agentCardTypeSchema = z.enum(AGENT_CARD_TYPES);
export type AgentCardType = z.infer<typeof agentCardTypeSchema>;

export const agentCardActionRoleSchema = z.enum(["primary", "secondary"]);

export const agentCardActionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    role: agentCardActionRoleSchema.default("primary"),
    href: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type AgentCardAction = z.infer<typeof agentCardActionSchema>;

const actionsMaxTwoPrimary = z
  .array(agentCardActionSchema)
  .max(8)
  .superRefine((actions, ctx) => {
    const primaryCount = actions.filter((a) => a.role === "primary").length;
    if (primaryCount > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most 2 primary actions allowed",
      });
    }
  });

const mediaPreviewUrlSchema = z.union([
  z.string().regex(/^\/api\/media\/assets\/[0-9a-f-]{36}$/i),
  z.string().url(),
  z.string().trim().min(1).max(500),
]);

export const reelApprovalCardSchema = z
  .object({
    type: z.literal("reel_approval"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(500).optional(),
    props: z
      .object({
        approvalId: z.string().uuid().optional(),
        videoPreviewUrl: mediaPreviewUrlSchema.optional(),
        coverPreviewUrl: mediaPreviewUrlSchema.optional(),
        captionPreview: z.string().max(2000).optional(),
        previewMode: z.enum(["thumbnail", "player"]).default("thumbnail"),
        badges: z.array(z.string().max(80)).max(6).optional(),
        createdAtIso: z.string().trim().min(1).max(64).optional(),
        createdAtTemplate: z.string().max(120).optional(),
        locale: z.enum(["en", "es"]).optional(),
        thumbnailAlt: z.string().max(120).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary,
  })
  .strict();

export const costConfirmationCardSchema = z
  .object({
    type: z.literal("cost_confirmation"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    props: z
      .object({
        estimatedCostCents: z.number().int().nonnegative().nullable(),
        tema: z.string().max(200).optional(),
        styleLabel: z.string().max(80).optional(),
        spendHintTemplate: z.string().max(200).optional(),
        spendUnknownLabel: z.string().max(200).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary,
  })
  .strict();

export const planApprovalCardSchema = z
  .object({
    type: z.literal("plan_approval"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    props: z
      .object({
        weekStart: z.string().max(40).optional(),
        themes: z.array(z.string().max(200)).max(8).optional(),
        incursSpend: z.boolean().optional(),
        estimatedCostCents: z.number().int().nonnegative().nullable().optional(),
        spendHintTemplate: z.string().max(200).optional(),
        spendUnknownLabel: z.string().max(200).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary,
  })
  .strict();

export const scriptApprovalCardSchema = z
  .object({
    type: z.literal("script_approval"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    props: z
      .object({
        tema: z.string().max(200).optional(),
        status: z.enum(["pending", "generated"]).optional(),
        hook: z.string().max(2000).optional(),
        body: z.string().max(8000).optional(),
        cta: z.string().max(500).optional(),
        changeSummary: z.string().max(500).optional(),
        hookLabel: z.string().max(80).optional(),
        bodyLabel: z.string().max(80).optional(),
        ctaLabel: z.string().max(80).optional(),
        pendingLabel: z.string().max(200).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary,
  })
  .strict();

export const ownAvatarActivationCardSchema = z
  .object({
    type: z.literal("own_avatar_activation"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    props: z
      .object({
        detail: z.string().max(500).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary,
  })
  .strict();

export const voiceCostEligibleVideoSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    slotIndex: z.number().int().min(0).max(6),
    tema: z.string().max(200),
    estimatedCostCents: z.number().int().nonnegative(),
    confirmEstimateCents: z.number().int().nonnegative(),
    charCount: z.number().int().nonnegative(),
  })
  .strict();

export const voiceCostCardSchema = z
  .object({
    type: z.literal("voice_cost"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    props: z
      .object({
        estimatedCostCents: z.number().int().nonnegative(),
        confirmEstimateCents: z.number().int().nonnegative(),
        reelScriptId: z.string().uuid(),
        slotIndex: z.number().int().min(0).max(6),
        tema: z.string().max(200).optional(),
        styleLabel: z.string().max(80).optional(),
        eligibleVideos: z.array(voiceCostEligibleVideoSchema).max(7),
        pickVideoLabel: z.string().max(120).optional(),
        videoOptionTemplate: z.string().max(120).optional(),
        spendHintTemplate: z.string().max(200).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary,
  })
  .strict();

export const statusSummaryCardSchema = z
  .object({
    type: z.literal("status_summary"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(500).optional(),
    props: z
      .object({
        lines: z.array(z.string().max(300)).max(12),
        listItems: z.array(z.string().max(300)).max(12).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary.default([]),
  })
  .strict();

export const clarifyingQuestionCardSchema = z
  .object({
    type: z.literal("clarifying_question"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(500),
    props: z
      .object({
        question: z.string().trim().min(1).max(500),
        helper: z.string().max(500).optional(),
        options: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(80),
                label: z.string().trim().min(1).max(120),
              })
              .strict(),
          )
          .max(8),
      })
      .strict(),
    actions: actionsMaxTwoPrimary.default([]),
  })
  .strict();

export const nextStepChipsCardSchema = z
  .object({
    type: z.literal("next_step_chips"),
    title: z.string().trim().max(200).optional(),
    props: z
      .object({
        chips: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(80),
                text: z.string().trim().min(1).max(200),
              })
              .strict(),
          )
          .min(1)
          .max(12),
        ariaLabel: z.string().max(120).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary.default([]),
  })
  .strict();

export const progressCardSchema = z
  .object({
    type: z.literal("progress"),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().max(500).optional(),
    props: z
      .object({
        steps: z
          .array(
            z
              .object({
                key: z.string().min(1).max(40),
                label: z.string().min(1).max(120),
                status: z.enum(["todo", "current", "done"]),
                statusLabel: z.string().min(1).max(80),
              })
              .strict(),
          )
          .min(1)
          .max(12),
        nextStepHint: z.string().max(300).optional(),
      })
      .strict(),
    actions: actionsMaxTwoPrimary,
  })
  .strict();

export const agentCardSchema = z.discriminatedUnion("type", [
  reelApprovalCardSchema,
  costConfirmationCardSchema,
  planApprovalCardSchema,
  scriptApprovalCardSchema,
  ownAvatarActivationCardSchema,
  voiceCostCardSchema,
  statusSummaryCardSchema,
  clarifyingQuestionCardSchema,
  nextStepChipsCardSchema,
  progressCardSchema,
]);

export type AgentCardData = z.infer<typeof agentCardSchema>;

export function parseAgentCard(input: unknown): AgentCardData {
  return agentCardSchema.parse(input);
}

export function safeParseAgentCard(input: unknown) {
  return agentCardSchema.safeParse(input);
}
