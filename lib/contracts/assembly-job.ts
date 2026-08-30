/**
 * Assembly job contract (US-9.1).
 * FE imports types and constants only; Zod validation stays server-side.
 */
import { z } from "zod";

import { assemblyConfigSchema } from "@/lib/contracts/branding-job";
import { assembledReelAssetMetadataSchema } from "@/lib/contracts/media-assets";

export const ASSEMBLY_TEMPLATE_REEL_V1_BASIC = "reel_v1_basic" as const;

export const NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT = 2 as const;
export const NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN_DEFAULT = 30 as const;
export const ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT = 3000 as const;

export const ASSEMBLY_STALE_FAILURE_MESSAGE_KEY =
  "scripts.assembly.failure.staleTimeout" as const;

export const assemblyJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
]);

export type AssemblyJobStatus = z.infer<typeof assemblyJobStatusSchema>;

export const assemblyJobPollModeSchema = z.enum(["fly", "in_process"]);

export type AssemblyJobPollMode = z.infer<typeof assemblyJobPollModeSchema>;

export const assemblyJobStatusUpdateSourceSchema = z.enum([
  "worker",
  "stale_sweeper",
]);

export type AssemblyJobStatusUpdateSource = z.infer<
  typeof assemblyJobStatusUpdateSourceSchema
>;

export const assemblyJobErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "ASSEMBLY_INPUTS_INCOMPLETE",
  "ASSEMBLY_IN_PROGRESS",
  "INTERNAL_ERROR",
]);

export type AssemblyJobErrorCode = z.infer<typeof assemblyJobErrorCodeSchema>;

export const assemblyJobMutationErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: assemblyJobErrorCodeSchema,
      messageKey: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    }),
  })
  .strict();

export type AssemblyJobMutationError = z.infer<
  typeof assemblyJobMutationErrorSchema
>;

export const FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS = [
  "primaryVideoAssetId",
  "primary_video_asset_id",
  "voiceoverAssetId",
  "voiceover_asset_id",
  "templateId",
  "template_id",
  "clientId",
  "client_id",
  "status",
  "outputMediaAssetId",
  "output_media_asset_id",
  "inputFingerprint",
  "input_fingerprint",
  "scriptUpdatedAt",
  "script_updated_at",
  "force",
  "skipIdempotency",
  "skip_idempotency",
  "outputUrl",
  "output_url",
  "previewUrl",
  "preview_url",
  "finalUrl",
  "final_url",
  "primaryVideoUrl",
  "voiceoverUrl",
  "assetUrl",
] as const;

export const assembleReelForScriptRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
  })
  .strict();

export type AssembleReelForScriptRequest = z.infer<
  typeof assembleReelForScriptRequestSchema
>;

export const assembleReelForScriptSuccessSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().uuid(),
    status: assemblyJobStatusSchema,
    idempotent: z.boolean(),
    outputMediaAssetId: z.string().uuid().optional(),
    inFlight: z.boolean().optional(),
  })
  .strict();

export type AssembleReelForScriptSuccess = z.infer<
  typeof assembleReelForScriptSuccessSchema
>;

export type AssembleReelForScriptResult =
  | AssembleReelForScriptSuccess
  | AssemblyJobMutationError;

export const brandingJobStatusDtoSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "skipped",
]);

export const operatorAssemblyJobDtoSchema = z
  .object({
    jobId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    status: assemblyJobStatusSchema,
    templateId: z.literal(ASSEMBLY_TEMPLATE_REEL_V1_BASIC),
    targetDurationSec: z.number().positive(),
    actualDurationSec: z.number().positive().nullable(),
    outputMediaAssetId: z.string().uuid().nullable(),
    failureReason: z.string().nullable(),
    brandingStatus: brandingJobStatusDtoSchema.nullable(),
    brandingConfig: assemblyConfigSchema.nullable(),
    coverMediaAssetId: z.string().uuid().nullable(),
    preBrandingOutputMediaAssetId: z.string().uuid().nullable(),
    canApplyBranding: z.boolean(),
    canRebrand: z.boolean(),
    brandingFailureReason: z.string().nullable(),
    canAssemble: z.boolean(),
    canReassemble: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OperatorAssemblyJobDto = z.infer<
  typeof operatorAssemblyJobDtoSchema
>;

export const operatorAssemblyJobStatusDtoSchema = operatorAssemblyJobDtoSchema
  .omit({ canAssemble: true })
  .strict();

export type OperatorAssemblyJobStatusDto = z.infer<
  typeof operatorAssemblyJobStatusDtoSchema
>;

export const operatorAssemblyJobsByReelMapSchema = z.record(
  z.string().uuid(),
  operatorAssemblyJobDtoSchema.nullable(),
);

export type OperatorAssemblyJobsByReelMap = z.infer<
  typeof operatorAssemblyJobsByReelMapSchema
>;

export const assemblyJobProcessingPatchSchema = z
  .object({
    status: z.literal("processing"),
  })
  .strict();

export const assemblyJobCompletedPatchSchema = z
  .object({
    status: z.literal("completed"),
    outputMediaAssetId: z.string().uuid(),
    actualDurationSec: z.number().positive(),
  })
  .strict();

export const assemblyJobFailedPatchSchema = z
  .object({
    status: z.literal("failed"),
    failureReason: z.string().max(2000),
  })
  .strict();

export const assemblyJobStatusPatchSchema = z.discriminatedUnion("status", [
  assemblyJobProcessingPatchSchema,
  assemblyJobCompletedPatchSchema,
  assemblyJobFailedPatchSchema,
]);

export type AssemblyJobStatusPatch = z.infer<
  typeof assemblyJobStatusPatchSchema
>;

export type ApplyAssemblyJobUpdateInput = {
  assemblyJobId: string;
  patch: AssemblyJobStatusPatch;
  source: AssemblyJobStatusUpdateSource;
};

export type ApplyAssemblyJobUpdateSuccess = {
  ok: true;
  jobId: string;
  status: AssemblyJobStatus;
  idempotent: boolean;
};

export { assembledReelAssetMetadataSchema };
