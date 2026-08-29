/**
 * Living profile / Ficha viva view contract (US-2.1).
 * FE imports types only; read validation stays server-side.
 */
import { z } from "zod";

import {
  interviewAnswersCompleteSchema,
  type InterviewAnswersComplete,
} from "@/lib/contracts/interview";

/** Ficha viva fields jsonb — 1:1 with complete interview answers (V1). */
export type BusinessProfileFields = InterviewAnswersComplete;

export const businessProfileViewSchema = z
  .object({
    exists: z.literal(true),
    fields: interviewAnswersCompleteSchema,
    updatedAt: z.string().datetime({ offset: true }).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();

export type BusinessProfileView = z.infer<typeof businessProfileViewSchema>;

export const businessProfileMissingSchema = z
  .object({
    exists: z.literal(false),
  })
  .strict();

export type BusinessProfileMissing = z.infer<typeof businessProfileMissingSchema>;

/**
 * Soft load failure — same UX class as dashboard interview loadFailed.
 * Do not distinguish foreign-tenant cases (no foreign-id surface).
 */
export const businessProfileLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type BusinessProfileLoadFailed = z.infer<
  typeof businessProfileLoadFailedSchema
>;

export type BusinessProfileForClientResult =
  | BusinessProfileView
  | BusinessProfileMissing
  | BusinessProfileLoadFailed;
