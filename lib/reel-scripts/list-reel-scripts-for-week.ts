import "server-only";

import type { ContentStrategyBrief } from "@/lib/contracts/content-strategy";
import type { ReelScriptListItem } from "@/lib/contracts/reel-script";
import { computeScriptReadabilityMetrics } from "@/lib/reel-scripts/compute-script-readability";
import {
  hasOrphanedScriptsForWeek,
  listReelScriptsForStrategy,
} from "@/lib/reel-scripts/persist-reel-script";

export async function buildReelScriptListForStrategy(params: {
  clientId: string;
  weekStart: string;
  strategyId: string;
  version: number;
  brief: ContentStrategyBrief;
}): Promise<{ items: ReelScriptListItem[]; strategyVersionChanged: boolean }> {
  const scripts = await listReelScriptsForStrategy({
    clientId: params.clientId,
    strategyId: params.strategyId,
  });

  const scriptBySlot = new Map(scripts.map((s) => [s.slotIndex, s]));

  const items: ReelScriptListItem[] = params.brief.slots.map((slot) => {
    const script = scriptBySlot.get(slot.slotIndex);
    if (!script) {
      return {
        scriptId: null,
        slotIndex: slot.slotIndex,
        tema: slot.tema,
        dayOfWeek: slot.dayOfWeek,
        goal: slot.goal,
        formatoPlaybookSlug: slot.formatoPlaybookSlug,
        modalidad: slot.modalidad,
        targetDurationSec: null,
        status: "pending" as const,
        package: null,
        mustDiscloseNotOwner: null,
        readability: null,
      };
    }

    return {
      scriptId: script.id,
      slotIndex: slot.slotIndex,
      tema: slot.tema,
      dayOfWeek: slot.dayOfWeek,
      goal: slot.goal,
      formatoPlaybookSlug: slot.formatoPlaybookSlug,
      modalidad: slot.modalidad,
      targetDurationSec: script.package.targetDurationSec,
      status: "generated" as const,
      package: script.package,
      mustDiscloseNotOwner: script.mustDiscloseNotOwner,
      readability: computeScriptReadabilityMetrics(script.package),
    };
  });

  const strategyVersionChanged = await hasOrphanedScriptsForWeek({
    clientId: params.clientId,
    weekStart: params.weekStart,
    currentStrategyId: params.strategyId,
  });

  return { items, strategyVersionChanged };
}
