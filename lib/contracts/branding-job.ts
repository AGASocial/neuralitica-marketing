/**
 * Branding job contract (US-9.2).
 * FE imports types and assemblyConfigSchema only; Zod validation stays server-side.
 */
import { z } from "zod";

import { mediaUploadErrorCodeSchema } from "@/lib/contracts/media-assets";

export const NEURAMARK_MEDIA_MAX_LOGO_BYTES = 2_097_152 as const;
export const CLIENT_LOGO_HINT_MAX_MIB = 2 as const;

export const brandingJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "skipped",
]);

export type BrandingJobStatus = z.infer<typeof brandingJobStatusSchema>;

export const assemblyConfigSchema = z
  .object({
    subtitlesEnabled: z.boolean().default(true),
    logoEnabled: z.boolean().default(true),
    coverFrameSec: z.number().min(0).max(45).default(1.0),
  })
  .strict();

export type AssemblyConfig = z.infer<typeof assemblyConfigSchema>;

export const DEFAULT_ASSEMBLY_CONFIG: AssemblyConfig = {
  subtitlesEnabled: true,
  logoEnabled: true,
  coverFrameSec: 1.0,
};

export const brandingConfigSnapshotSchema = assemblyConfigSchema.extend({
  subtitleBeatCount: z.number().int().min(0).max(8),
  subtitleSourceHash: z.string().length(64),
});

export type BrandingConfigSnapshot = z.infer<
  typeof brandingConfigSnapshotSchema
>;

export const businessProfileBrandingSchema = z
  .object({
    logoAssetId: z.string().uuid().nullable(),
    logoPreviewUrl: z.string().nullable(),
    assemblyConfig: assemblyConfigSchema,
  })
  .strict();

export type BusinessProfileBranding = z.infer<
  typeof businessProfileBrandingSchema
>;

export const brandingJobErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "BRANDING_BASE_INCOMPLETE",
  "SUBTITLE_SANITIZE_FAILED",
  "LOGO_UPLOAD_INVALID",
  "INTERNAL_ERROR",
]);

export type BrandingJobErrorCode = z.infer<typeof brandingJobErrorCodeSchema>;

export const applyBrandingForAssemblyRequestSchema = z
  .object({
    assemblyJobId: z.string().uuid(),
    subtitlesEnabled: z.boolean().optional(),
    logoEnabled: z.boolean().optional(),
  })
  .strict();

export type ApplyBrandingForAssemblyRequest = z.infer<
  typeof applyBrandingForAssemblyRequestSchema
>;

export const applyBrandingForAssemblySuccessSchema = z
  .object({
    ok: z.literal(true),
    assemblyJobId: z.string().uuid(),
    brandingStatus: brandingJobStatusSchema,
    idempotent: z.boolean(),
    outputMediaAssetId: z.string().uuid().optional(),
    coverMediaAssetId: z.string().uuid().optional(),
    inFlight: z.boolean().optional(),
  })
  .strict();

export type ApplyBrandingForAssemblySuccess = z.infer<
  typeof applyBrandingForAssemblySuccessSchema
>;

export const applyBrandingForAssemblyErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: brandingJobErrorCodeSchema,
      messageKey: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    })
    .strict(),
});

export type ApplyBrandingForAssemblyResult =
  | ApplyBrandingForAssemblySuccess
  | z.infer<typeof applyBrandingForAssemblyErrorEnvelopeSchema>;

export const uploadClientLogoSuccessSchema = z
  .object({
    ok: z.literal(true),
    logoAssetId: z.string().uuid(),
    logoPreviewUrl: z.string(),
  })
  .strict();

export type UploadClientLogoSuccess = z.infer<
  typeof uploadClientLogoSuccessSchema
>;

export type UploadClientLogoResult =
  | UploadClientLogoSuccess
  | {
      ok: false;
      error: {
        code: z.infer<typeof mediaUploadErrorCodeSchema>;
        messageKey?: string;
        fields?: Record<string, string[]>;
      };
    };

export const removeClientLogoSuccessSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export type RemoveClientLogoResult =
  | z.infer<typeof removeClientLogoSuccessSchema>
  | {
      ok: false;
      error: {
        code:
          | "UNAUTHENTICATED"
          | "FORBIDDEN"
          | "NOT_FOUND"
          | "INTERNAL_ERROR";
        messageKey?: string;
      };
    };

export const updateAssemblyConfigDefaultsSuccessSchema = z
  .object({
    ok: z.literal(true),
    assemblyConfig: assemblyConfigSchema,
  })
  .strict();

export type UpdateAssemblyConfigDefaultsResult =
  | z.infer<typeof updateAssemblyConfigDefaultsSuccessSchema>
  | {
      ok: false;
      error: {
        code:
          | "VALIDATION_ERROR"
          | "FORBIDDEN_FIELDS"
          | "UNAUTHENTICATED"
          | "FORBIDDEN"
          | "INTERNAL_ERROR";
        messageKey?: string;
        fields?: Record<string, string[]>;
      };
    };
