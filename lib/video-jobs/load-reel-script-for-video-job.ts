import "server-only";

import { reelScriptPackageSchema, type ReelScriptPackage } from "@/lib/contracts/reel-script";
import type { VisualMode } from "@/lib/contracts/providers";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { hasReferenceLoopAssetForClient } from "@/lib/media/has-reference-loop-asset-for-client";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { loadApprovedStrategyForScriptJob } from "@/lib/reel-scripts/load-approved-strategy-for-script-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ReelScriptForVideoJob = {
  reelScriptId: string;
  clientId: string;
  strategyId: string;
  slotIndex: number;
  package: ReelScriptPackage;
  visualMode: VisualMode;
  modalidad: VisualModality;
  hasReferenceLoop: boolean;
};

function deriveVisualMode(
  allowedModes: VisualMode[],
): VisualMode {
  if (allowedModes.includes("own_avatar")) {
    return "own_avatar";
  }
  if (allowedModes.includes("generic_avatar")) {
    return "generic_avatar";
  }
  return "faceless";
}

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

export async function loadReelScriptForVideoJob(params: {
  reelScriptId: string;
  clientId: string;
}): Promise<ReelScriptForVideoJob | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select(
      "id, client_id, strategy_id, slot_index, hook, body, cta, on_screen_text, voiceover_text, target_duration_sec, broll_beats, cold_open_notes, editing_notes",
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
  if (typeof raw.slot_index !== "number" || typeof raw.strategy_id !== "string") {
    return null;
  }

  const strategy = await loadApprovedStrategyForScriptJob({
    strategyId: raw.strategy_id,
    clientId: params.clientId,
  });
  if (!strategy) {
    return null;
  }

  const slot = strategy.brief.slots.find((s) => s.slotIndex === raw.slot_index);
  if (!slot) {
    return null;
  }

  const profile = await getBusinessProfileForAgents(params.clientId);
  if (!profile.exists || profile.visualModeSummary === null) {
    return null;
  }

  const visualMode = deriveVisualMode(profile.visualModeSummary.allowedModes);

  const hasReferenceLoop =
    visualMode === "generic_avatar" &&
    slot.modalidad !== "faceless" &&
    (await hasReferenceLoopAssetForClient(params.clientId));

  return {
    reelScriptId: raw.id as string,
    clientId: params.clientId,
    strategyId: raw.strategy_id,
    slotIndex: raw.slot_index,
    package: pkg,
    visualMode,
    modalidad: slot.modalidad,
    hasReferenceLoop,
  };
}
