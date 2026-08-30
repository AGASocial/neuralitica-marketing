/**
 * Client approval package contract (US-11.1).
 * FE imports types + constants; Zod validation stays server-side.
 * Gate readiness authority remains getQaGateStatusForAssembledReel (DB-only).
 */
import { z } from "zod";

import {
  qaGateStatusSchema,
  qaReportStatusSchema,
} from "@/lib/contracts/qa-report";

export const APPROVAL_FEEDBACK_MIN_LENGTH = 0 as const;
export const APPROVAL_FEEDBACK_MAX_LENGTH = 500 as const;

export const APPROVAL_ENSURE_AGENT_KEY = "approval_ensure" as const;
export const APPROVAL_DECIDE_AGENT_KEY = "approval_decide" as const;
export const APPROVAL_RATE_WINDOW_MS = 60 * 60 * 1000;
export const APPROVAL_MAX_PER_WINDOW = 30;

/** DB + DTO status enum (changes_requested reserved for US-11.2 writes). */
export const approvalStatusSchema = z.enum([
  "pending_client",
  "approved",
  "rejected",
  "changes_requested",
]);

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

/** Phase A decide values only — never changes_requested. */
export const approvalDecisionSchema = z.enum(["approved", "rejected"]);

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const FORBIDDEN_APPROVAL_AUTHORITY_KEYS = [
  "qaPassed",
  "qa_passed",
  "passed",
  "ready",
  "gate",
  "overrides",
  "overrideAll",
  "override_all",
  "qaOverrides",
  "overriddenCheckKeys",
  "uncoveredFailedCheckKeys",
  "hasBlockingFailures",
  "hasOverridableFailures",
  "status",
  "checks",
  "severity",
  "blocking",
  "overridable",
  "clientId",
  "client_id",
  "decidedBy",
  "decided_by",
  "decidedAt",
  "decided_at",
  "operatorClientId",
  "operator_client_id",
  "userId",
  "user_id",
  "force",
  "skipGateCheck",
  "skip_gate_check",
  "previewUrl",
  "storage_key",
  "storageKey",
  "outputMediaAssetId",
  "output_media_asset_id",
  "caption",
  "hashtags",
  "selectedCtaText",
  "selected_cta_index",
  "disclosure",
  "video",
  "costCents",
  "estimatedCostCents",
  "changes_requested",
  "revision_count",
  "change_requests",
] as const;

export type ForbiddenApprovalAuthorityKey =
  (typeof FORBIDDEN_APPROVAL_AUTHORITY_KEYS)[number];

/** Extra forbidden pointers — union with authority keys in findForbiddenApprovalKeys. */
export const FORBIDDEN_APPROVAL_ENSURE_EXTRA_KEYS = [
  "approvalId",
  "approval_id",
] as const;

export const FORBIDDEN_APPROVAL_DECIDE_EXTRA_KEYS = [
  "assembledReelId",
  "assembled_reel_id",
] as const;

export const FORBIDDEN_APPROVAL_GET_EXTRA_KEYS = [
  "assembledReelId",
  "assembled_reel_id",
  "decision",
  "clientFeedback",
] as const;

export type ApprovalForbiddenScanSurface = "ensure" | "list" | "get" | "decide";

const optionalFeedbackSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(APPROVAL_FEEDBACK_MAX_LENGTH)
      .transform((value) => (value.length === 0 ? undefined : value)),
  )
  .optional();

export const ensureApprovalPackageInputSchema = z
  .object({
    assembledReelId: z.string().uuid(),
  })
  .strict();

export type EnsureApprovalPackageInput = z.infer<
  typeof ensureApprovalPackageInputSchema
>;

export const getApprovalPackageInputSchema = z
  .object({
    approvalId: z.string().uuid(),
  })
  .strict();

export type GetApprovalPackageInput = z.infer<
  typeof getApprovalPackageInputSchema
>;

export const listPendingApprovalsInputSchema = z.object({}).strict();

export type ListPendingApprovalsInput = z.infer<
  typeof listPendingApprovalsInputSchema
>;

export const decideApprovalInputSchema = z
  .object({
    approvalId: z.string().uuid(),
    decision: approvalDecisionSchema,
    clientFeedback: optionalFeedbackSchema,
  })
  .strict();

export type DecideApprovalInput = z.infer<typeof decideApprovalInputSchema>;

export const approvalMediaRefSchema = z
  .object({
    assetId: z.string().uuid(),
    previewUrl: z
      .string()
      .regex(/^\/api\/media\/assets\/[0-9a-f-]{36}$/i),
  })
  .strict();

export type ApprovalMediaRef = z.infer<typeof approvalMediaRefSchema>;

export const approvalCaptionDtoSchema = z
  .object({
    body: z.string().min(1),
    selectedCtaText: z.string().min(1),
    effectiveCaption: z.string().min(1),
  })
  .strict();

export type ApprovalCaptionDto = z.infer<typeof approvalCaptionDtoSchema>;

export const approvalDisclosureDtoSchema = z
  .object({
    required: z.boolean(),
    text: z.string().min(1).optional(),
    messageKey: z.string().min(1).optional(),
  })
  .strict();

export type ApprovalDisclosureDto = z.infer<typeof approvalDisclosureDtoSchema>;

/** Cliente-readable override audit (US-10.2 handoff; no operatorDisplayName). */
export const approvalQaOverrideDtoSchema = z
  .object({
    overrideId: z.string().uuid(),
    checkKey: z.string().min(1),
    reason: z.string().min(1).max(500),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type ApprovalQaOverrideDto = z.infer<typeof approvalQaOverrideDtoSchema>;

/** Informational gate slice — never write authority. */
export const approvalGateInfoSchema = z
  .object({
    ready: z.boolean(),
    status: qaReportStatusSchema.nullable(),
    overriddenCheckKeys: z.array(z.string()).default([]),
    uncoveredFailedCheckKeys: z.array(z.string()).default([]),
  })
  .strict();

export type ApprovalGateInfo = z.infer<typeof approvalGateInfoSchema>;

export const approvalPackageDtoSchema = z
  .object({
    approvalId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    status: approvalStatusSchema,
    video: approvalMediaRefSchema,
    cover: approvalMediaRefSchema.nullable().optional(),
    caption: approvalCaptionDtoSchema,
    hashtags: z.array(z.string()),
    disclosure: approvalDisclosureDtoSchema,
    qaOverrides: z.array(approvalQaOverrideDtoSchema).default([]),
    gate: approvalGateInfoSchema.optional(),
    decidedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type ApprovalPackageDto = z.infer<typeof approvalPackageDtoSchema>;

export const approvalListItemDtoSchema = z
  .object({
    approvalId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    status: approvalStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    captionPreview: z.string().optional(),
    hasDisclosure: z.boolean().optional(),
    overrideCount: z.number().int().nonnegative().optional(),
    videoAssetId: z.string().uuid().optional(),
  })
  .strict();

export type ApprovalListItemDto = z.infer<typeof approvalListItemDtoSchema>;

export const approvalErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN_FIELDS",
  "QA_GATE_NOT_READY",
  "ASSEMBLY_NOT_READY",
  "BRANDING_REQUIRED",
  "CAPTION_REQUIRED",
  "CAPTION_CTA_NOT_SELECTED",
  "INVALID_TRANSITION",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export type ApprovalErrorCode = z.infer<typeof approvalErrorCodeSchema>;

export const approvalErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: approvalErrorCodeSchema,
      messageKey: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    })
    .strict(),
});

export type ApprovalMutationError = z.infer<typeof approvalErrorEnvelopeSchema>;

export const ensureApprovalPackageSuccessSchema = z
  .object({
    ok: z.literal(true),
    package: approvalPackageDtoSchema,
    created: z.boolean(),
  })
  .strict();

export type EnsureApprovalPackageSuccess = z.infer<
  typeof ensureApprovalPackageSuccessSchema
>;

export type EnsureApprovalPackageResult =
  | EnsureApprovalPackageSuccess
  | ApprovalMutationError;

export const listPendingApprovalsSuccessSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(approvalListItemDtoSchema),
  })
  .strict();

export type ListPendingApprovalsSuccess = z.infer<
  typeof listPendingApprovalsSuccessSchema
>;

export type ListPendingApprovalsResult =
  | ListPendingApprovalsSuccess
  | ApprovalMutationError;

export const getApprovalPackageSuccessSchema = z
  .object({
    ok: z.literal(true),
    package: approvalPackageDtoSchema,
  })
  .strict();

export type GetApprovalPackageSuccess = z.infer<
  typeof getApprovalPackageSuccessSchema
>;

export type GetApprovalPackageResult =
  | GetApprovalPackageSuccess
  | ApprovalMutationError;

export const decideApprovalSuccessSchema = z
  .object({
    ok: z.literal(true),
    approvalId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    status: approvalDecisionSchema,
    decidedAt: z.string().datetime({ offset: true }),
    summary: approvalListItemDtoSchema,
  })
  .strict();

export type DecideApprovalSuccess = z.infer<typeof decideApprovalSuccessSchema>;

export type DecideApprovalResult =
  | DecideApprovalSuccess
  | ApprovalMutationError;

/** Re-export gate schema for FE informational typing on package.gate. */
export { qaGateStatusSchema };
