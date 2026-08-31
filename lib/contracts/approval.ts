/**
 * Client approval package contract (US-11.1 + US-11.2 + US-11.3 extensions).
 * FE imports types + constants; Zod validation stays server-side.
 * Gate readiness authority remains getQaGateStatusForAssembledReel (DB-only).
 * Revision-round schemas: lib/contracts/approval-revision.ts
 * Ready-to-publish list/export: US-11.3 CONTRACT — plan/stories/US-11.3/CONTRACT.md
 */
import { z } from "zod";

import {
  changeRequestInputSchema,
  lastChangeRequestDtoSchema,
} from "@/lib/contracts/approval-revision";
import {
  qaGateStatusSchema,
  qaReportStatusSchema,
} from "@/lib/contracts/qa-report";

export {
  APPROVAL_MAX_CLIENT_REVISION_ROUNDS_DEFAULT,
  APPROVAL_OPERATOR_GRANT_AGENT_KEY,
  APPROVAL_OPERATOR_GRANT_MAX_PER_WINDOW,
  approvalChangeTagSchema,
  changeRequestInputSchema,
  computeRevisionRoutingPlan,
  findForbiddenChangeRequestKeys,
  lastChangeRequestDtoSchema,
  operatorGrantExtraRevisionInputSchema,
  revisionContextSchema,
  UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG,
} from "@/lib/contracts/approval-revision";
export type {
  ApprovalChangeTag,
  ChangeRequestInput,
  LastChangeRequestDto,
  OperatorGrantExtraRevisionInput,
  RevisionContext,
} from "@/lib/contracts/approval-revision";

export const APPROVAL_FEEDBACK_MIN_LENGTH = 0 as const;
export const APPROVAL_FEEDBACK_MAX_LENGTH = 500 as const;

export const APPROVAL_ENSURE_AGENT_KEY = "approval_ensure" as const;
export const APPROVAL_DECIDE_AGENT_KEY = "approval_decide" as const;
/** Caption export route rate limit (US-11.3). */
export const APPROVAL_EXPORT_AGENT_KEY = "approval_export" as const;
export const APPROVAL_RATE_WINDOW_MS = 60 * 60 * 1000;
export const APPROVAL_MAX_PER_WINDOW = 30;

/** Whitelisted media serve query value for backup video download (US-11.3). */
export const MEDIA_ASSET_DISPOSITION_ATTACHMENT = "attachment" as const;

/** DB + DTO status enum (changes_requested reserved for US-11.2 writes). */
export const approvalStatusSchema = z.enum([
  "pending_client",
  "approved",
  "rejected",
  "changes_requested",
]);

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

/** Decide wire values — request_changes writes status changes_requested (US-11.2). */
export const approvalDecisionSchema = z.enum([
  "approved",
  "rejected",
  "request_changes",
]);

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

/** Terminal decide outcomes persisted on neuramark_approvals.status. */
export const approvalDecidedStatusSchema = z.enum([
  "approved",
  "rejected",
  "changes_requested",
]);

export type ApprovalDecidedStatus = z.infer<typeof approvalDecidedStatusSchema>;

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
  "revisionCount",
  "change_requests",
  "changeRequests",
  "extra_revision_granted",
  "extraRevisionGranted",
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

/** US-11.3 — ready-to-publish list; no request filter params. */
export const listApprovedApprovalsInputSchema = z.object({}).strict();

export type ListApprovedApprovalsInput = z.infer<
  typeof listApprovedApprovalsInputSchema
>;

export const decideApprovalInputSchema = z
  .object({
    approvalId: z.string().uuid(),
    decision: approvalDecisionSchema,
    clientFeedback: optionalFeedbackSchema,
    changeRequest: changeRequestInputSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.decision === "request_changes") {
      if (!data.changeRequest) {
        ctx.addIssue({
          code: "custom",
          path: ["changeRequest"],
          message: "REQUIRED",
        });
      }
      if (data.clientFeedback !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["clientFeedback"],
          message: "FORBIDDEN_FOR_REQUEST_CHANGES",
        });
      }
      return;
    }

    if (data.changeRequest !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["changeRequest"],
        message: "FORBIDDEN",
      });
    }
  });

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
    /** US-11.2 — BUILD always populates after migration; optional in Zod until persist layer lands. */
    revisionCount: z.number().int().nonnegative().optional(),
    maxRevisionRounds: z.number().int().positive().optional(),
    revisionsRemaining: z.number().int().nonnegative().optional(),
    extraRevisionGranted: z.boolean().optional(),
    lastChangeRequest: lastChangeRequestDtoSchema.optional(),
    changeRequestHistory: z.array(lastChangeRequestDtoSchema).optional(),
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

/** US-11.3 — approved-only list card (decided_at DESC on server). */
export const approvedListItemDtoSchema = z
  .object({
    approvalId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    status: z.literal("approved"),
    decidedAt: z.string().datetime({ offset: true }),
    captionPreview: z.string().optional(),
    hasDisclosure: z.boolean().optional(),
    videoAssetId: z.string().uuid().optional(),
  })
  .strict();

export type ApprovedListItemDto = z.infer<typeof approvedListItemDtoSchema>;

/** US-11.3 — download href shapes for ready-to-publish detail / post-approve panel. */
export const readyToPublishDownloadUrlsSchema = z
  .object({
    videoDownloadUrl: z
      .string()
      .regex(
        /^\/api\/media\/assets\/[0-9a-f-]{36}\?disposition=attachment$/i,
      ),
    captionDownloadUrl: z
      .string()
      .regex(/^\/api\/approvals\/[0-9a-f-]{36}\/caption\.txt$/i),
  })
  .strict();

export type ReadyToPublishDownloadUrls = z.infer<
  typeof readyToPublishDownloadUrlsSchema
>;

/** US-11.3 — subset of ApprovalPackageDto for approved detail + download wiring. */
export const readyToPublishPackageDtoSchema = z
  .object({
    approvalId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    status: z.literal("approved"),
    video: approvalMediaRefSchema,
    cover: approvalMediaRefSchema.nullable().optional(),
    caption: approvalCaptionDtoSchema,
    hashtags: z.array(z.string()),
    disclosure: approvalDisclosureDtoSchema,
    decidedAt: z.string().datetime({ offset: true }),
    downloads: readyToPublishDownloadUrlsSchema,
  })
  .strict();

export type ReadyToPublishPackageDto = z.infer<
  typeof readyToPublishPackageDtoSchema
>;

/** Structured server log on approve success (US-11.3 — no outbound HTTP). */
export const approvalReadyToPublishLogEventSchema = z
  .object({
    event: z.literal("approval_ready_to_publish"),
    approvalId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    clientId: z.string().uuid(),
    decidedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type ApprovalReadyToPublishLogEvent = z.infer<
  typeof approvalReadyToPublishLogEventSchema
>;

const UUID_IN_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Authenticated backup MP4 download URL (Cliente attachment mode). */
export function mediaAttachmentDownloadUrl(assetId: string): string {
  if (!UUID_IN_PATH_RE.test(assetId)) {
    throw new Error("mediaAttachmentDownloadUrl: invalid assetId");
  }
  return `/api/media/assets/${assetId}?disposition=${MEDIA_ASSET_DISPOSITION_ATTACHMENT}`;
}

/** Authenticated caption `.txt` export URL. */
export function captionExportUrl(approvalId: string): string {
  if (!UUID_IN_PATH_RE.test(approvalId)) {
    throw new Error("captionExportUrl: invalid approvalId");
  }
  return `/api/approvals/${approvalId}/caption.txt`;
}

/** Server-chosen caption export filename (Content-Disposition). */
export function buildCaptionExportFilename(assembledReelId: string): string {
  const shortId = assembledReelId.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `reel-${shortId}-caption.txt`;
}

/** Build ready-to-publish download URLs from package ids. */
export function buildReadyToPublishDownloadUrls(params: {
  approvalId: string;
  videoAssetId: string;
}): ReadyToPublishDownloadUrls {
  return {
    videoDownloadUrl: mediaAttachmentDownloadUrl(params.videoAssetId),
    captionDownloadUrl: captionExportUrl(params.approvalId),
  };
}

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
  "REVISION_LIMIT_EXCEEDED",
  "REVISION_ROUTING_FAILED",
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

export const listApprovedApprovalsSuccessSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(approvedListItemDtoSchema),
  })
  .strict();

export type ListApprovedApprovalsSuccess = z.infer<
  typeof listApprovedApprovalsSuccessSchema
>;

export type ListApprovedApprovalsResult =
  | ListApprovedApprovalsSuccess
  | ApprovalMutationError;

/** Route Handler JSON error codes for caption export (US-11.3). */
export const approvalExportRouteErrorCodeSchema = z.enum([
  "NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export type ApprovalExportRouteErrorCode = z.infer<
  typeof approvalExportRouteErrorCodeSchema
>;

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
    status: approvalDecidedStatusSchema,
    decidedAt: z.string().datetime({ offset: true }),
    summary: approvalListItemDtoSchema,
    revisionCount: z.number().int().nonnegative().optional(),
    revisionsRemaining: z.number().int().nonnegative().optional(),
  })
  .strict();

export type DecideApprovalSuccess = z.infer<typeof decideApprovalSuccessSchema>;

export type DecideApprovalResult =
  | DecideApprovalSuccess
  | ApprovalMutationError;

/** Re-export gate schema for FE informational typing on package.gate. */
export { qaGateStatusSchema };
