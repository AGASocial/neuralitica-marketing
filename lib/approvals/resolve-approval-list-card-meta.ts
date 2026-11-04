import "server-only";

import type { AssemblyJobRow } from "@/lib/assembly/assembly-job-row";
import { loadStrategyRowForOperator } from "@/lib/content-strategy/load-strategy-row-for-operator";
import { contentStrategyBriefSchema } from "@/lib/contracts/content-strategy";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { loadReelScriptForQa } from "@/lib/qa/load-reel-script-for-qa";

export type ApprovalListCardMeta = {
  title: string;
  formatKey?: VisualModality;
  assembledAt: string;
};

/**
 * Resolve owner-facing list card title/format/date from assembly → script → strategy slot.
 */
export async function resolveApprovalListCardMeta(params: {
  clientId: string;
  assembly: AssemblyJobRow | null;
  captionPreview?: string;
  fallbackCreatedAt: string;
}): Promise<ApprovalListCardMeta> {
  const assembledAt =
    params.assembly?.updatedAt ?? params.fallbackCreatedAt;

  if (!params.assembly) {
    const caption = params.captionPreview?.trim() ?? "";
    return { title: caption, assembledAt };
  }

  let tema = "";
  let hook = "";
  let formatKey: VisualModality | undefined;

  try {
    const script = await loadReelScriptForQa({
      reelScriptId: params.assembly.reelScriptId,
      clientId: params.clientId,
    });
    if (script) {
      hook = script.package.hook?.trim() ?? "";
      if (
        script.modalidad === "own_avatar" ||
        script.modalidad === "generic_avatar" ||
        script.modalidad === "faceless"
      ) {
        formatKey = script.modalidad;
      }
      if (
        typeof script.strategyId === "string" &&
        typeof script.slotIndex === "number"
      ) {
        try {
          const strategy = await loadStrategyRowForOperator({
            strategyId: script.strategyId,
            clientId: params.clientId,
          });
          const briefParsed = contentStrategyBriefSchema.safeParse(
            strategy?.brief,
          );
          if (briefParsed.success) {
            const slot = briefParsed.data.slots.find(
              (s) => s.slotIndex === script.slotIndex,
            );
            if (slot?.tema?.trim()) {
              tema = slot.tema.trim();
            }
          }
        } catch {
          // Strategy title is best-effort for list cards.
        }
      }
    }
  } catch {
    // Script/format enrichment is best-effort for list cards.
  }

  const caption = params.captionPreview?.trim() ?? "";
  const title = tema || hook || caption;

  return {
    title,
    ...(formatKey ? { formatKey } : {}),
    assembledAt,
  };
}
