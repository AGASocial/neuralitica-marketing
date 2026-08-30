import "server-only";

import type { ReelScriptPackage } from "@/lib/contracts/reel-script";
import { reelScriptPackageSchema } from "@/lib/contracts/reel-script";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ReelScriptForQa = {
  id: string;
  clientId: string;
  strategyId: string;
  slotIndex: number;
  modalidad: VisualModality;
  mustDiscloseNotOwner: boolean;
  package: ReelScriptPackage;
  updatedAt: string;
};

export async function loadReelScriptForQa(params: {
  reelScriptId: string;
  clientId: string;
}): Promise<ReelScriptForQa | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select(
      "id, client_id, strategy_id, slot_index, modalidad, must_disclose_not_owner, hook, body, cta, on_screen_text, voiceover_text, target_duration_sec, broll_beats, cold_open_notes, editing_notes, updated_at",
    )
    .eq("id", params.reelScriptId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const raw = data as Record<string, unknown>;
  const modalidad = raw.modalidad;
  if (
    modalidad !== "own_avatar" &&
    modalidad !== "generic_avatar" &&
    modalidad !== "faceless"
  ) {
    return null;
  }

  if (typeof raw.must_disclose_not_owner !== "boolean") {
    return null;
  }
  if (typeof raw.strategy_id !== "string" || typeof raw.slot_index !== "number") {
    return null;
  }
  if (typeof raw.updated_at !== "string" || typeof raw.id !== "string") {
    return null;
  }

  const packageParsed = reelScriptPackageSchema.safeParse({
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
  if (!packageParsed.success) {
    return null;
  }

  return {
    id: raw.id,
    clientId: params.clientId,
    strategyId: raw.strategy_id,
    slotIndex: raw.slot_index,
    modalidad,
    mustDiscloseNotOwner: raw.must_disclose_not_owner,
    package: packageParsed.data,
    updatedAt: raw.updated_at,
  };
}
