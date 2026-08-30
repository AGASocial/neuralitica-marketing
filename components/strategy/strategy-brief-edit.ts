import type {
  ContentStrategyBrief,
  ContentStrategyBriefEditable,
} from "@/lib/contracts/content-strategy";

export function buildEditablePatch(
  brief: ContentStrategyBrief,
): ContentStrategyBriefEditable {
  return {
    themes: brief.themes
      .map((theme) => theme.trim())
      .filter((theme) => theme.length > 0),
    slots: brief.slots.map((slot) => ({
      slotIndex: slot.slotIndex,
      ...(slot.angle !== undefined ? { angle: slot.angle } : {}),
      ...(slot.ctaHint !== undefined ? { ctaHint: slot.ctaHint } : {}),
    })),
  };
}

export function hasValidEditableThemes(brief: ContentStrategyBrief): boolean {
  const themes = brief.themes.map((theme) => theme.trim()).filter(Boolean);
  return themes.length >= 1 && themes.length <= 8;
}

export function briefsEqual(
  left: ContentStrategyBrief,
  right: ContentStrategyBrief,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function cloneBrief(brief: ContentStrategyBrief): ContentStrategyBrief {
  return structuredClone(brief);
}
