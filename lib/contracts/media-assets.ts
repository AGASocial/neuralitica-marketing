/**
 * Avatar reference assets contract (US-3.3).
 * FE imports types only; Zod validation stays server-side on upload/delete.
 * Technical tokens are code/DB only — never primary UI headlines.
 */
import { z } from "zod";

/** Frozen V1 max avatar_reference rows per client (CONTRACT). */
export const AVATAR_REFERENCE_MAX_ASSETS = 10 as const;

/** V1 asset_type enum value (code/DB only). */
export const MEDIA_ASSET_TYPE_AVATAR_REFERENCE = "avatar_reference" as const;

/** Operator manual / provider output video asset type (US-8.3 / US-8.4 enum). */
export const MEDIA_ASSET_TYPE_GENERATED_VIDEO = "generated_video" as const;

/** TTS voiceover asset type (US-9.3 enum). */
export const MEDIA_ASSET_TYPE_VOICEOVER = "voiceover" as const;

/** FFmpeg assembled Reel output (US-9.1 enum). */
export const MEDIA_ASSET_TYPE_ASSEMBLED_REEL = "assembled_reel" as const;

/** US-9.1 assembled output keys */
export const ASSEMBLED_REEL_STORAGE_KEY_REGEX =
  /^neuramark\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/assembled-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/;

/** Shared upload validator asset type union (US-3.3 + US-8.3). */
export const mediaUploadAssetTypeSchema = z.enum([
  "avatar_reference",
  "generated_video",
]);

export type MediaUploadAssetType = z.infer<typeof mediaUploadAssetTypeSchema>;

/**
 * Server-generated storage_key shape (CONTRACT).
 * UUID v4 + safe extension from detected MIME only (legacy flat keys).
 */
export const STORAGE_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$/;

/** US-9.3 voiceover path keys: neuramark/{clientId}/{reelScriptId}/{uuid}.mp3|wav|m4a */
export const VOICEOVER_STORAGE_KEY_REGEX =
  /^neuramark\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp3|wav|m4a)$/;

/** Display hints only — server enforces via magic bytes + env limits. */
export const AVATAR_REFERENCE_HINT_MAX_IMAGE_MIB = 10 as const;
export const AVATAR_REFERENCE_HINT_MAX_VIDEO_MIB = 50 as const;

export const mediaDetectedMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

export type MediaDetectedMime = z.infer<typeof mediaDetectedMimeSchema>;

export const avatarReferenceAssetMetadataSchema = z
  .object({
    originalFilename: z.string().max(255),
    detectedMime: mediaDetectedMimeSchema,
    sizeBytes: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSec: z.number().positive().optional(),
  })
  .strict();

export type AvatarReferenceAssetMetadata = z.infer<
  typeof avatarReferenceAssetMetadataSchema
>;

/** Metadata persisted on generated_video rows (manual upload + API fetchAsset). */
export const generatedVideoAssetMetadataSchema = z
  .object({
    originalFilename: z.string().max(255),
    detectedMime: z.enum(["video/mp4", "video/quicktime"]),
    sizeBytes: z.number().int().positive(),
    durationSec: z.number().positive(),
    /** Distinguishes manual Operator upload from API provider output. */
    source: z.enum(["manual_upload", "provider_fetch"]),
  })
  .strict();

export type GeneratedVideoAssetMetadata = z.infer<
  typeof generatedVideoAssetMetadataSchema
>;

export const voiceoverDetectedMimeSchema = z.enum([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
]);

export type VoiceoverDetectedMime = z.infer<typeof voiceoverDetectedMimeSchema>;

/** Metadata persisted on voiceover rows (TTS synthesize). */
export const voiceoverAssetMetadataSchema = z
  .object({
    originalFilename: z.string().max(255),
    detectedMime: voiceoverDetectedMimeSchema,
    sizeBytes: z.number().int().positive(),
    durationSec: z.number().positive().optional(),
    source: z.literal("tts_synthesize"),
    reelScriptId: z.string().uuid(),
    voiceId: z.enum([
      "en_warm_female",
      "en_professional_male",
      "es_warm_female",
      "es_professional_male",
    ]),
    providerKey: z.string().min(1),
    supersedesAssetId: z.string().uuid().optional(),
  })
  .strict();

export type VoiceoverAssetMetadata = z.infer<
  typeof voiceoverAssetMetadataSchema
>;

/** Metadata persisted on assembled_reel rows (US-9.1 FFmpeg output). */
export const assembledReelAssetMetadataSchema = z
  .object({
    detectedMime: z.literal("video/mp4"),
    sizeBytes: z.number().int().positive(),
    durationSec: z.number().positive(),
    width: z.literal(1080),
    height: z.literal(1920),
    source: z.literal("assembly_ffmpeg"),
    templateId: z.literal("reel_v1_basic"),
    assemblyJobId: z.string().uuid(),
  })
  .strict();

export type AssembledReelAssetMetadata = z.infer<
  typeof assembledReelAssetMetadataSchema
>;

export const avatarReferenceAssetItemSchema = z
  .object({
    id: z.string().uuid(),
    assetType: z.literal("avatar_reference"),
    createdAt: z.string().datetime({ offset: true }),
    metadata: avatarReferenceAssetMetadataSchema,
    /** Same-origin authenticated serve path — not a public CDN URL */
    previewUrl: z.string().regex(/^\/api\/media\/assets\/[0-9a-f-]{36}$/),
  })
  .strict();

export type AvatarReferenceAssetItem = z.infer<
  typeof avatarReferenceAssetItemSchema
>;

export const avatarReferenceAssetsForClientSchema = z
  .object({
    assets: z.array(avatarReferenceAssetItemSchema),
    /** CONTRACT default 10; env may override at runtime. */
    maxAssets: z.number().int().positive(),
    canUpload: z.boolean(),
    ownAvatarConsentActive: z.boolean(),
  })
  .strict();

export type AvatarReferenceAssetsForClientResult = z.infer<
  typeof avatarReferenceAssetsForClientSchema
>;

/** Soft load-failed shape for Preferencias page composition (mirrors prefs pattern). */
export type AvatarReferenceAssetsLoadFailed = {
  assets: [];
  maxAssets: number;
  canUpload: false;
  ownAvatarConsentActive: boolean;
  loadFailed: true;
};

export type AvatarReferenceAssetsPageResult =
  | AvatarReferenceAssetsForClientResult
  | AvatarReferenceAssetsLoadFailed;

export const uploadAvatarReferenceAssetSuccessSchema = z
  .object({
    ok: z.literal(true),
    asset: avatarReferenceAssetItemSchema,
  })
  .strict();

export const mediaUploadErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "MISSING_FILE",
  "INVALID_FILE_TYPE",
  "FILE_TOO_LARGE",
  "VIDEO_TOO_LONG",
  "ASSET_LIMIT_REACHED",
  "OWN_AVATAR_CONSENT_REQUIRED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export type MediaUploadErrorCode = z.infer<typeof mediaUploadErrorCodeSchema>;

export const uploadAvatarReferenceAssetErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: mediaUploadErrorCodeSchema,
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type UploadAvatarReferenceAssetResult =
  | z.infer<typeof uploadAvatarReferenceAssetSuccessSchema>
  | z.infer<typeof uploadAvatarReferenceAssetErrorEnvelopeSchema>;

export const deleteAvatarReferenceAssetInputSchema = z
  .object({
    assetId: z.string().uuid(),
  })
  .strict();

export type DeleteAvatarReferenceAssetInput = z.infer<
  typeof deleteAvatarReferenceAssetInputSchema
>;

export const deleteAvatarReferenceAssetSuccessSchema = z
  .object({
    ok: z.literal(true),
    deletedAssetId: z.string().uuid(),
  })
  .strict();

export const deleteAvatarReferenceAssetErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "NOT_FOUND",
  "ASSET_REFERENCED_BY_JOB",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export type DeleteAvatarReferenceAssetErrorCode = z.infer<
  typeof deleteAvatarReferenceAssetErrorCodeSchema
>;

export type DeleteAvatarReferenceAssetResult =
  | z.infer<typeof deleteAvatarReferenceAssetSuccessSchema>
  | {
      ok: false;
      error: {
        code: DeleteAvatarReferenceAssetErrorCode;
        messageKey?: string;
      };
    };
