/**
 * QA check contract (US-3.4).
 * FE imports types only; evaluators stay server-side.
 */
import { z } from "zod";

import { QA_CHECK_SEVERITY } from "@/lib/qa/check-classes";

export const GENERIC_AVATAR_NOT_OWNER_CHECK_KEY =
  "generic_avatar_not_owner" as const;

export const genericAvatarNotOwnerCheckInputSchema = z
  .object({
    mustDiscloseNotOwner: z.boolean(),
    scriptText: z.string(),
    ownerDisplayName: z.string().min(2).optional(),
  })
  .strict();

export type GenericAvatarNotOwnerCheckInput = z.infer<
  typeof genericAvatarNotOwnerCheckInputSchema
>;

export const genericAvatarNotOwnerCheckResultSchema = z
  .object({
    checkKey: z.literal(GENERIC_AVATAR_NOT_OWNER_CHECK_KEY),
    status: z.enum(["pass", "fail"]),
    severity: z.literal(QA_CHECK_SEVERITY.blocking),
    evidence: z
      .object({
        messageKey: z.string(),
        matchedPhrase: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type GenericAvatarNotOwnerCheckResult = z.infer<
  typeof genericAvatarNotOwnerCheckResultSchema
>;
