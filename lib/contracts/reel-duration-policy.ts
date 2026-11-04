/**
 * Reel duration policy contract — modality-keyed bounds for script clamp,
 * TTS validation, avatar segment split, avatar job duration, and assembly.
 *
 * Live values come from neuramark_reel_duration_policies via the cached
 * loader. Hardcoded FALLBACK_* values are used ONLY when DB load fails.
 */
import { z } from "zod";

import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { VisualMode } from "@/lib/contracts/providers";

export const reelDurationModalityKeySchema = z.enum(["avatar", "faceless"]);
export type ReelDurationModalityKey = z.infer<
  typeof reelDurationModalityKeySchema
>;

export const reelDurationPolicySchema = z
  .object({
    modalityKey: reelDurationModalityKeySchema,
    targetDurationSecMin: z.number().int().positive(),
    targetDurationSecMax: z.number().int().positive(),
    avatarSegmentMaxSec: z.number().int().positive().nullable(),
    avatarSegmentsMin: z.number().int().min(1).nullable(),
    avatarSegmentsMax: z.number().int().min(1).nullable(),
    brollCutawaysAllowed: z.boolean(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.targetDurationSecMin > row.targetDurationSecMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetDurationSecMin must be <= targetDurationSecMax",
        path: ["targetDurationSecMin"],
      });
    }
    if (row.modalityKey === "avatar") {
      if (
        row.avatarSegmentMaxSec == null ||
        row.avatarSegmentsMin == null ||
        row.avatarSegmentsMax == null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "avatar policy requires segment max/min/max counts",
          path: ["avatarSegmentMaxSec"],
        });
        return;
      }
      if (row.avatarSegmentsMin > row.avatarSegmentsMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "avatarSegmentsMin must be <= avatarSegmentsMax",
          path: ["avatarSegmentsMin"],
        });
      }
      if (row.avatarSegmentMaxSec > row.targetDurationSecMax) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "avatarSegmentMaxSec must be <= targetDurationSecMax",
          path: ["avatarSegmentMaxSec"],
        });
      }
    } else if (
      row.avatarSegmentMaxSec != null ||
      row.avatarSegmentsMin != null ||
      row.avatarSegmentsMax != null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "faceless policy must leave avatar segment fields null",
        path: ["avatarSegmentMaxSec"],
      });
    }
  });

export type ReelDurationPolicy = z.infer<typeof reelDurationPolicySchema>;

export const reelDurationPolicyCatalogSchema = z
  .object({
    avatar: reelDurationPolicySchema,
    faceless: reelDurationPolicySchema,
  })
  .strict()
  .superRefine((catalog, ctx) => {
    if (catalog.avatar.modalityKey !== "avatar") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "avatar slot must have modalityKey avatar",
        path: ["avatar", "modalityKey"],
      });
    }
    if (catalog.faceless.modalityKey !== "faceless") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "faceless slot must have modalityKey faceless",
        path: ["faceless", "modalityKey"],
      });
    }
  });

export type ReelDurationPolicyCatalog = z.infer<
  typeof reelDurationPolicyCatalogSchema
>;

/** Safe hardcoded defaults — loader fallback ONLY when DB is unavailable. */
export const FALLBACK_REEL_DURATION_POLICIES: ReelDurationPolicyCatalog = {
  avatar: {
    modalityKey: "avatar",
    targetDurationSecMin: 8,
    targetDurationSecMax: 15,
    avatarSegmentMaxSec: 8,
    avatarSegmentsMin: 1,
    avatarSegmentsMax: 2,
    brollCutawaysAllowed: true,
  },
  faceless: {
    modalityKey: "faceless",
    targetDurationSecMin: 15,
    targetDurationSecMax: 45,
    avatarSegmentMaxSec: null,
    avatarSegmentsMin: null,
    avatarSegmentsMax: null,
    brollCutawaysAllowed: false,
  },
};

/** Package-wide Zod union bounds (avatar min … faceless max). */
export const REEL_SCRIPT_TARGET_DURATION_SEC_MIN =
  FALLBACK_REEL_DURATION_POLICIES.avatar.targetDurationSecMin;
export const REEL_SCRIPT_TARGET_DURATION_SEC_MAX =
  FALLBACK_REEL_DURATION_POLICIES.faceless.targetDurationSecMax;

export function isAvatarVisualModality(
  modalidad: VisualModality | VisualMode | null | undefined,
): boolean {
  return modalidad === "own_avatar" || modalidad === "generic_avatar";
}

export function reelDurationModalityKeyFor(
  modalidad: VisualModality | VisualMode | null | undefined,
): ReelDurationModalityKey {
  return isAvatarVisualModality(modalidad) ? "avatar" : "faceless";
}

export function policyForVisualModality(
  catalog: ReelDurationPolicyCatalog,
  modalidad: VisualModality | VisualMode | null | undefined,
): ReelDurationPolicy {
  return catalog[reelDurationModalityKeyFor(modalidad)];
}

export function reelTargetDurationBoundsFromPolicy(
  policy: ReelDurationPolicy,
): { min: number; max: number } {
  return {
    min: policy.targetDurationSecMin,
    max: policy.targetDurationSecMax,
  };
}

/** @deprecated Prefer policy-aware helpers; uses FALLBACK catalog. */
export function reelTargetDurationBoundsForModality(
  modalidad: VisualModality | VisualMode | null | undefined,
): { min: number; max: number } {
  return reelTargetDurationBoundsFromPolicy(
    policyForVisualModality(FALLBACK_REEL_DURATION_POLICIES, modalidad),
  );
}

export function clampReelTargetDurationSec(params: {
  targetDurationSec: number;
  modality?: VisualModality | VisualMode | null;
  /** Preferred: explicit policy from loader. */
  policy?: ReelDurationPolicy;
  /** @deprecated alias for modality */
  modalidad?: VisualModality | VisualMode | null;
}): number {
  const policy =
    params.policy ??
    policyForVisualModality(
      FALLBACK_REEL_DURATION_POLICIES,
      params.modality ?? params.modalidad,
    );
  const { min, max } = reelTargetDurationBoundsFromPolicy(policy);
  const rounded = Math.round(params.targetDurationSec);
  if (!Number.isFinite(rounded)) {
    return min;
  }
  return Math.min(max, Math.max(min, rounded));
}

export function avatarSegmentMaxSecFromPolicy(
  policy: ReelDurationPolicy,
): number {
  return (
    policy.avatarSegmentMaxSec ??
    FALLBACK_REEL_DURATION_POLICIES.avatar.avatarSegmentMaxSec!
  );
}

export function avatarSegmentsMaxFromPolicy(policy: ReelDurationPolicy): number {
  return (
    policy.avatarSegmentsMax ??
    FALLBACK_REEL_DURATION_POLICIES.avatar.avatarSegmentsMax!
  );
}

export function avatarSegmentsMinFromPolicy(policy: ReelDurationPolicy): number {
  return (
    policy.avatarSegmentsMin ??
    FALLBACK_REEL_DURATION_POLICIES.avatar.avatarSegmentsMin!
  );
}
