import "server-only";

import { createAssemblyJobForClientTrusted } from "@/lib/assembly/create-assembly-job-for-reel-script";
import { findLatestVoiceoverAssetId } from "@/lib/tts/get-voiceover-summaries-for-reel-scripts";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { VIDEO_JOBS_TABLE } from "./video-job-row";

/**
 * After the last b-roll clip for a script completes, enqueue assembly when
 * voiceover is present. Used by chat faceless Approve (no weekly-cycle
 * step_run). Idempotent via createAssemblyJobForClientTrusted fingerprinting.
 */
export async function maybeAdvanceFacelessAssemblyAfterBroll(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<{ advanced: boolean; reason?: string }> {
  if (!isSupabaseConfigured()) {
    return { advanced: false, reason: "supabase_unconfigured" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id, status")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "broll");

  if (error) {
    console.error("[faceless-pipeline] list broll jobs failed", {
      code: error.code,
    });
    return { advanced: false, reason: "list_failed" };
  }

  const rows = (data ?? []) as Array<{ id: string; status: string }>;
  if (rows.length === 0) {
    return { advanced: false, reason: "no_broll_jobs" };
  }

  const inFlight = rows.some(
    (row) => row.status === "queued" || row.status === "processing",
  );
  if (inFlight) {
    return { advanced: false, reason: "broll_in_flight" };
  }

  const completed = rows.filter((row) => row.status === "completed");
  if (completed.length === 0) {
    return { advanced: false, reason: "no_completed_broll" };
  }

  const voiceoverAssetId = await findLatestVoiceoverAssetId({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
  });
  if (!voiceoverAssetId) {
    return { advanced: false, reason: "missing_voiceover" };
  }

  const result = await createAssemblyJobForClientTrusted({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
    invokedBy: "system",
  });

  if (!result.ok) {
    console.error("[faceless-pipeline] assembly enqueue failed", {
      code: result.error.code,
      reelScriptId: params.reelScriptId,
    });
    return { advanced: false, reason: result.error.code };
  }

  return { advanced: true };
}
