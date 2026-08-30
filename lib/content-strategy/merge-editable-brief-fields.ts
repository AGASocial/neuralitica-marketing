import {
  contentStrategyBriefSchema,
  type ContentStrategyBrief,
  type ContentStrategyBriefEditable,
} from "@/lib/contracts/content-strategy";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

export type MergeEditableBriefFieldsResult =
  | { ok: true; brief: ContentStrategyBrief }
  | { ok: false; fields: Record<string, string[]> };

/**
 * Applies Operator-editable patch onto stored brief (US-4.2).
 * Locked fields are preserved from the stored brief.
 */
export function mergeEditableBriefFields(
  stored: ContentStrategyBrief,
  editable: ContentStrategyBriefEditable,
): MergeEditableBriefFieldsResult {
  const slots = stored.slots.map((slot) => ({ ...slot }));

  for (const patch of editable.slots) {
    const slotIdx = slots.findIndex((slot) => slot.slotIndex === patch.slotIndex);
    if (slotIdx === -1) {
      return {
        ok: false,
        fields: {
          [`slots.${patch.slotIndex}.slotIndex`]: ["UNKNOWN_SLOT_INDEX"],
        },
      };
    }

    const updated = { ...slots[slotIdx]! };
    if (patch.angle !== undefined) {
      updated.angle = patch.angle;
    }
    if (patch.ctaHint !== undefined) {
      updated.ctaHint = patch.ctaHint;
    }
    slots[slotIdx] = updated;
  }

  const merged = {
    ...stored,
    themes: editable.themes,
    slots,
  };

  const parsed = contentStrategyBriefSchema.safeParse(merged);
  if (!parsed.success) {
    return {
      ok: false,
      fields: zodInterviewErrorToFieldErrors(parsed.error),
    };
  }

  return { ok: true, brief: parsed.data };
}
