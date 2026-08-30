/**
 * Manual video upload contract (US-8.3).
 * FE imports types and constants only; Zod validation stays server-side.
 */
import { z } from "zod";

import { operatorVideoJobSummaryDtoSchema } from "@/lib/contracts/video-job";
import { videoJobStatusSchema } from "@/lib/contracts/providers";

/** Catalog / job provider key for Operator manual upload (US-X.4 seed). */
export const MANUAL_PROVIDER_KEY = "manual" as const;

/** Thrown by manual adapter vendor I/O methods — sync orchestrator owns I/O. */
export const MANUAL_UPLOAD_SYNC_ONLY = "MANUAL_UPLOAD_SYNC_ONLY" as const;

/** Server-generated external_job_id prefix for manual jobs. */
export const MANUAL_EXTERNAL_JOB_ID_PREFIX = "manual-" as const;

/** Duration probe library frozen in US-8.3 CONTRACT. */
export const MANUAL_UPLOAD_DURATION_PROBE_LIBRARY = "mp4box" as const;

/** Default next.config serverActions.bodySizeLimit BUILD target (≥ getMaxVideoBytes()). */
export const MANUAL_UPLOAD_SERVER_ACTION_BODY_LIMIT = "52mb" as const;

/** Keys rejected on manual upload FormData / JSON (US-8.3 SECURITY). */
export const FORBIDDEN_MANUAL_UPLOAD_AUTHORITY_KEYS = [
  "status",
  "outputUrl",
  "output_url",
  "outputMediaAssetId",
  "output_media_asset_id",
  "providerKey",
  "provider_key",
  "externalJobId",
  "external_job_id",
  "estimatedCostCents",
  "actualCostCents",
  "estimated_cost_cents",
  "actual_cost_cents",
  "operatorClientId",
  "operator_client_id",
  "storageKey",
  "storage_key",
  "assetType",
  "asset_type",
  "metadata",
  "skipConsentCheck",
  "skip_consent_check",
  "skipBudgetCheck",
  "skip_budget_check",
  "skipQa",
  "skip_qa",
  "autoApprove",
  "auto_approve",
  "confirmReplace",
  "confirm_replace",
  "attempt",
  "spendEventId",
  "spend_event_id",
] as const;

export type ForbiddenManualUploadAuthorityKey =
  (typeof FORBIDDEN_MANUAL_UPLOAD_AUTHORITY_KEYS)[number];

export const uploadManualVideoJobErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "MISSING_FILE",
  "INVALID_FILE_TYPE",
  "FILE_TOO_LARGE",
  "VIDEO_TOO_LONG",
  "CONSENT_REVOKED",
  "SLOT_JOB_IN_FLIGHT",
  "SLOT_COMPLETED_JOB_EXISTS",
  "INTERNAL_ERROR",
]);

export type UploadManualVideoJobErrorCode = z.infer<
  typeof uploadManualVideoJobErrorCodeSchema
>;

/** Non-file FormData / action fields (file validated separately). */
export const uploadManualVideoJobRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    parentJobId: z.string().uuid().optional(),
  })
  .strict();

export type UploadManualVideoJobRequest = z.infer<
  typeof uploadManualVideoJobRequestSchema
>;

export const uploadManualVideoJobSuccessSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().uuid(),
    mediaAssetId: z.string().uuid(),
    status: z.literal("completed"),
    job: operatorVideoJobSummaryDtoSchema,
  })
  .strict();

export type UploadManualVideoJobSuccess = z.infer<
  typeof uploadManualVideoJobSuccessSchema
>;

export const uploadManualVideoJobErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: uploadManualVideoJobErrorCodeSchema,
        messageKey: z.string().optional(),
        fields: z.record(z.string(), z.array(z.string())).optional(),
      })
      .strict(),
  })
  .strict();

export type UploadManualVideoJobErrorEnvelope = z.infer<
  typeof uploadManualVideoJobErrorEnvelopeSchema
>;

export type UploadManualVideoJobResult =
  | UploadManualVideoJobSuccess
  | UploadManualVideoJobErrorEnvelope;

/** i18n prefix for manual upload error strings. */
export const MANUAL_UPLOAD_ERROR_I18N_PREFIX =
  "scripts.videoJob.manualUpload.errors" as const;

/** i18n keys mapped from error codes (BUILD). */
export const MANUAL_UPLOAD_ERROR_MESSAGE_KEYS: Record<
  UploadManualVideoJobErrorCode,
  string
> = {
  UNAUTHENTICATED: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.unauthenticated`,
  FORBIDDEN: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.forbidden`,
  NOT_FOUND: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.notFound`,
  VALIDATION_ERROR: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.validation`,
  FORBIDDEN_FIELDS: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.forbiddenFields`,
  MISSING_FILE: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.missingFile`,
  INVALID_FILE_TYPE: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.invalidFileType`,
  FILE_TOO_LARGE: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.fileTooLarge`,
  VIDEO_TOO_LONG: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.durationExceeded`,
  CONSENT_REVOKED: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.consentRevoked`,
  SLOT_JOB_IN_FLIGHT: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.slotJobInFlight`,
  SLOT_COMPLETED_JOB_EXISTS: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.slotCompletedJobExists`,
  INTERNAL_ERROR: `${MANUAL_UPLOAD_ERROR_I18N_PREFIX}.internal`,
};

/** Slot states that allow manual upload button visibility (FE). */
export const MANUAL_UPLOAD_VISIBLE_JOB_STATUSES = [
  null,
  "failed",
  "cancelled",
] as const;

/** Slot states that block manual upload (orchestrator). */
export const MANUAL_UPLOAD_BLOCKED_IN_FLIGHT_STATUSES = [
  "queued",
  "processing",
] as const satisfies ReadonlyArray<z.infer<typeof videoJobStatusSchema>>;
