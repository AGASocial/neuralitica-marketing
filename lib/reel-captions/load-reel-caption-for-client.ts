import "server-only";

import type { ReelCaptionRecord } from "@/lib/contracts/reel-caption";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { getReelCaptionByScriptId } from "@/lib/reel-captions/persist-reel-caption";
import { listReelScriptsForStrategy } from "@/lib/reel-scripts/persist-reel-script";

export type ReelCaptionForClient = {
  captionId: string;
  reelScriptId: string;
  clientId: string;
  slotIndex: number;
  record: ReelCaptionRecord;
  selectedCtaIndex: number | null;
  updatedAt: string;
};

export async function loadReelCaptionForClient(params: {
  clientId: string;
  weekStart: string;
  slotIndex: number;
}): Promise<ReelCaptionForClient | null> {
  const strategy = await getApprovedStrategyForWeek({
    clientId: params.clientId,
    weekStart: params.weekStart,
  });
  if (!strategy || strategy.status !== "approved") {
    return null;
  }

  const scripts = await listReelScriptsForStrategy({
    clientId: params.clientId,
    strategyId: strategy.id,
  });
  const script = scripts.find((row) => row.slotIndex === params.slotIndex);
  if (!script) {
    return null;
  }

  const caption = await getReelCaptionByScriptId({
    clientId: params.clientId,
    reelScriptId: script.id,
  });
  if (!caption) {
    return null;
  }

  return {
    captionId: caption.id,
    reelScriptId: caption.reelScriptId,
    clientId: caption.clientId,
    slotIndex: params.slotIndex,
    record: caption.record,
    selectedCtaIndex: caption.selectedCtaIndex,
    updatedAt: caption.updatedAt,
  };
}
