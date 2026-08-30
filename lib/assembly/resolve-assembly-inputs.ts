import "server-only";

import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { findLatestVoiceoverAssetId } from "@/lib/tts/get-voiceover-summaries-for-reel-scripts";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { VIDEO_JOBS_TABLE } from "@/lib/video-jobs/video-job-row";

import { loadMediaAssetForAssembly } from "./load-media-asset-for-assembly";

export type ResolveAssemblyInputsSuccess = {
  ok: true;
  primaryVideoAssetId: string;
  voiceoverAssetId: string | null;
  remuxVoiceover: boolean;
};

export type ResolveAssemblyInputsResult =
  | ResolveAssemblyInputsSuccess
  | {
      ok: false;
      code: "ASSEMBLY_INPUTS_INCOMPLETE";
      messageKey: string;
    };

async function verifyMediaAssetOwned(params: {
  assetId: string;
  clientId: string;
}): Promise<boolean> {
  const asset = await loadMediaAssetForAssembly(params.assetId);
  return asset !== null && asset.clientId === params.clientId;
}

/**
 * Resolve latest completed primary video + optional voiceover for assembly (US-9.1).
 */
export async function resolveAssemblyInputs(input: {
  clientId: string;
  reelScriptId: string;
  modalidad: VisualModality;
}): Promise<ResolveAssemblyInputsResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      code: "ASSEMBLY_INPUTS_INCOMPLETE",
      messageKey: "scripts.assembly.errors.inputsIncomplete",
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("output_media_asset_id, status")
    .eq("client_id", input.clientId)
    .eq("reel_script_id", input.reelScriptId)
    .eq("asset_role", "primary")
    .eq("status", "completed")
    .not("output_media_asset_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (input.modalidad === "faceless") {
      return {
        ok: false,
        code: "ASSEMBLY_INPUTS_INCOMPLETE",
        messageKey: "scripts.assembly.errors.facelessNoPrimary",
      };
    }
    return {
      ok: false,
      code: "ASSEMBLY_INPUTS_INCOMPLETE",
      messageKey: "scripts.assembly.errors.inputsIncomplete",
    };
  }

  const primaryVideoAssetId = (data as { output_media_asset_id: string })
    .output_media_asset_id;

  const primaryOwned = await verifyMediaAssetOwned({
    assetId: primaryVideoAssetId,
    clientId: input.clientId,
  });
  if (!primaryOwned) {
    return {
      ok: false,
      code: "ASSEMBLY_INPUTS_INCOMPLETE",
      messageKey: "scripts.assembly.errors.inputsIncomplete",
    };
  }

  const voiceoverAssetId = await findLatestVoiceoverAssetId({
    clientId: input.clientId,
    reelScriptId: input.reelScriptId,
  });

  if (voiceoverAssetId) {
    const voiceoverOwned = await verifyMediaAssetOwned({
      assetId: voiceoverAssetId,
      clientId: input.clientId,
    });
    if (!voiceoverOwned) {
      return {
        ok: false,
        code: "ASSEMBLY_INPUTS_INCOMPLETE",
        messageKey: "scripts.assembly.errors.inputsIncomplete",
      };
    }
  }

  return {
    ok: true,
    primaryVideoAssetId,
    voiceoverAssetId,
    remuxVoiceover: false,
  };
}

export async function areAssemblyInputsComplete(input: {
  clientId: string;
  reelScriptId: string;
  modalidad: VisualModality;
}): Promise<boolean> {
  const resolved = await resolveAssemblyInputs(input);
  return resolved.ok;
}
