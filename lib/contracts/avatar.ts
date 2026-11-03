/**
 * Avatar presenter config contract — gender, language, optional ElevenLabs clone.
 * FE imports types only; Zod validation stays server-side on upsert.
 */
import { z } from "zod";

export const avatarGenderSchema = z.enum(["male", "female"]);
export type AvatarGender = z.infer<typeof avatarGenderSchema>;

export const avatarLanguageSchema = z.enum(["en", "es"]);
export type AvatarLanguage = z.infer<typeof avatarLanguageSchema>;

/** ElevenLabs voice id (premade / cloned / professional). */
export const elevenLabsVoiceIdSchema = z
  .string()
  .trim()
  .min(10)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const avatarRecordSchema = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    gender: avatarGenderSchema,
    language: avatarLanguageSchema,
    elevenLabsVoiceId: elevenLabsVoiceIdSchema.nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type AvatarRecord = z.infer<typeof avatarRecordSchema>;

export const avatarViewExistsSchema = z
  .object({
    exists: z.literal(true),
    avatar: avatarRecordSchema,
  })
  .strict();

export const avatarViewMissingSchema = z
  .object({
    exists: z.literal(false),
  })
  .strict();

export const avatarViewLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type AvatarForClientResult =
  | z.infer<typeof avatarViewExistsSchema>
  | z.infer<typeof avatarViewMissingSchema>
  | z.infer<typeof avatarViewLoadFailedSchema>;

export const upsertAvatarInputSchema = z
  .object({
    gender: avatarGenderSchema,
    language: avatarLanguageSchema,
    elevenLabsVoiceId: elevenLabsVoiceIdSchema.nullable().optional(),
  })
  .strict();

export type UpsertAvatarInput = z.infer<typeof upsertAvatarInputSchema>;

export const upsertAvatarSuccessSchema = z
  .object({
    ok: z.literal(true),
    avatar: avatarRecordSchema,
  })
  .strict();

export type UpsertAvatarSuccess = z.infer<typeof upsertAvatarSuccessSchema>;

export const upsertAvatarErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export type UpsertAvatarErrorCode = z.infer<typeof upsertAvatarErrorCodeSchema>;

export type UpsertAvatarResult =
  | UpsertAvatarSuccess
  | {
      ok: false;
      code: UpsertAvatarErrorCode;
      fields?: Record<string, string[]>;
    };

/** Optional vision prefill of presenter gender from an uploaded avatar photo. */
export const prefillAvatarGenderSuccessSchema = z
  .object({
    ok: z.literal(true),
    gender: avatarGenderSchema,
    source: z.literal("vision"),
  })
  .strict();

export type PrefillAvatarGenderResult =
  | z.infer<typeof prefillAvatarGenderSuccessSchema>
  | {
      ok: false;
      code:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "PROVIDER_UNAVAILABLE"
        | "INTERNAL_ERROR";
    };
