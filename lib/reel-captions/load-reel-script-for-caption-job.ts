import "server-only";

import { reelScriptPackageSchema, type ReelScriptPackage } from "@/lib/contracts/reel-script";
import { loadApprovedStrategyForScriptJob } from "@/lib/reel-scripts/load-approved-strategy-for-script-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ReelScriptForCaption = {
  reelScriptId: string;
  clientId: string;
  strategyId: string;
  slotIndex: number;
  package: ReelScriptPackage;
  scriptUpdatedAt: string;
};

function mapScriptPackage(raw: Record<string, unknown>): ReelScriptPackage | null {
  const parsed = reelScriptPackageSchema.safeParse({
    hook: raw.hook,
    body: raw.body,
    cta: raw.cta,
    onScreenText: raw.on_screen_text,
    voiceoverText: raw.voiceover_text,
    targetDurationSec: raw.target_duration_sec,
    brollBeats: raw.broll_beats ?? undefined,
    coldOpenNotes: raw.cold_open_notes ?? undefined,
    editingNotes: raw.editing_notes ?? undefined,
  });
  return parsed.success ? parsed.data : null;
}

export async function loadReelScriptForCaptionJob(params: {
  reelScriptId: string;
  clientId: string;
}): Promise<ReelScriptForCaption | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select(
      "id, client_id, strategy_id, slot_index, hook, body, cta, on_screen_text, voiceover_text, target_duration_sec, broll_beats, cold_open_notes, editing_notes, updated_at",
    )
    .eq("id", params.reelScriptId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const raw = data as Record<string, unknown>;
  const pkg = mapScriptPackage(raw);
  if (!pkg) {
    return null;
  }
  if (typeof raw.slot_index !== "number" || typeof raw.updated_at !== "string") {
    return null;
  }
  if (typeof raw.strategy_id !== "string" || typeof raw.client_id !== "string") {
    return null;
  }

  const strategy = await loadApprovedStrategyForScriptJob({
    strategyId: raw.strategy_id,
    clientId: params.clientId,
  });
  if (!strategy) {
    return null;
  }

  return {
    reelScriptId: raw.id as string,
    clientId: raw.client_id,
    strategyId: raw.strategy_id,
    slotIndex: raw.slot_index,
    package: pkg,
    scriptUpdatedAt: raw.updated_at,
  };
}
