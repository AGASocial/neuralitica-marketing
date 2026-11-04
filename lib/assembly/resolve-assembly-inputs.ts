import "server-only";

import {
  ASSEMBLY_BROLL_CLIP_MAX,
  ASSEMBLY_PATH_TAG_AVATAR_SEGMENTS,
  ASSEMBLY_PATH_TAG_BROLL_STITCH,
  ASSEMBLY_PATH_TAG_PRIMARY,
  type AssemblyPathTag,
} from "@/lib/contracts/assembly-job";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { findLatestVoiceoverAssetId } from "@/lib/tts/get-voiceover-summaries-for-reel-scripts";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { VIDEO_JOBS_TABLE } from "@/lib/video-jobs/video-job-row";

import { loadMediaAssetForAssembly } from "./load-media-asset-for-assembly";
import { parseColdOpenTrimSec } from "./parse-cold-open-trim-sec";

export type AssemblyAvatarSegmentInput = {
  outputMediaAssetId: string;
  segmentIndex: number;
  startSec: number;
  durationSec: number;
};

export type ResolveAssemblyInputsSuccess = {
  ok: true;
  pathTag: AssemblyPathTag;
  primaryVideoAssetId: string | null;
  brollAssetIds: string[];
  voiceoverAssetId: string | null;
  remuxVoiceover: boolean;
  coldOpenTrimSec: number | null;
  /** Present when pathTag is avatar_segments (ordered by segment_index). */
  avatarSegments?: AssemblyAvatarSegmentInput[];
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

async function resolveLatestPrimaryAssetId(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("output_media_asset_id, status")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "primary")
    .eq("status", "completed")
    .not("output_media_asset_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const primaryVideoAssetId = (data as { output_media_asset_id: string })
    .output_media_asset_id;

  const owned = await verifyMediaAssetOwned({
    assetId: primaryVideoAssetId,
    clientId: params.clientId,
  });
  return owned ? primaryVideoAssetId : null;
}

/**
 * Completed primary jobs that carry segment metadata (avatar multi-clip).
 * Ordered by segment_index ASC.
 */
export async function resolveCompletedAvatarSegments(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<AssemblyAvatarSegmentInput[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select(
      "output_media_asset_id, segment_index, segment_start_sec, segment_duration_sec",
    )
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "primary")
    .eq("status", "completed")
    .not("output_media_asset_id", "is", null)
    .not("segment_index", "is", null)
    .order("segment_index", { ascending: true })
    .limit(4);

  if (error || !data?.length) {
    return [];
  }

  const segments: AssemblyAvatarSegmentInput[] = [];
  for (const row of data as Array<{
    output_media_asset_id: string;
    segment_index: number | null;
    segment_start_sec: number | null;
    segment_duration_sec: number | null;
  }>) {
    if (
      typeof row.segment_index !== "number" ||
      typeof row.segment_start_sec !== "number" ||
      typeof row.segment_duration_sec !== "number"
    ) {
      continue;
    }
    const owned = await verifyMediaAssetOwned({
      assetId: row.output_media_asset_id,
      clientId: params.clientId,
    });
    if (!owned) continue;
    segments.push({
      outputMediaAssetId: row.output_media_asset_id,
      segmentIndex: row.segment_index,
      startSec: row.segment_start_sec,
      durationSec: row.segment_duration_sec,
    });
  }
  return segments;
}

/**
 * Completed owned broll assets for script, ordered by job created_at ASC, cap 8.
 */
export async function resolveCompletedBrollAssetIds(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("output_media_asset_id, created_at")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "broll")
    .eq("status", "completed")
    .not("output_media_asset_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(ASSEMBLY_BROLL_CLIP_MAX);

  if (error || !data?.length) {
    return [];
  }

  const ordered: string[] = [];
  for (const row of data as Array<{ output_media_asset_id: string }>) {
    const assetId = row.output_media_asset_id;
    const owned = await verifyMediaAssetOwned({
      assetId,
      clientId: params.clientId,
    });
    if (owned) {
      ordered.push(assetId);
    }
  }
  return ordered;
}

async function resolveOwnedVoiceover(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<string | null> {
  const voiceoverAssetId = await findLatestVoiceoverAssetId({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
  });
  if (!voiceoverAssetId) {
    return null;
  }
  const owned = await verifyMediaAssetOwned({
    assetId: voiceoverAssetId,
    clientId: params.clientId,
  });
  return owned ? voiceoverAssetId : null;
}

/**
 * Resolve assembly inputs (US-9.1 Phase A + Phase B faceless stitch).
 */
export async function resolveAssemblyInputs(input: {
  clientId: string;
  reelScriptId: string;
  modalidad: VisualModality;
  targetDurationSec: number;
  coldOpenNotes?: string | null;
}): Promise<ResolveAssemblyInputsResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      code: "ASSEMBLY_INPUTS_INCOMPLETE",
      messageKey: "scripts.assembly.errors.inputsIncomplete",
    };
  }

  const coldOpenTrimSec = parseColdOpenTrimSec({
    coldOpenNotes: input.coldOpenNotes,
    targetDurationSec: input.targetDurationSec,
  });

  // Talking-head / avatar: prefer multi-segment timeline when segment jobs exist.
  if (input.modalidad !== "faceless") {
    const avatarSegments = await resolveCompletedAvatarSegments({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
    });
    const voiceoverAssetId = await resolveOwnedVoiceover({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
    });

    if (avatarSegments.length >= 1 && voiceoverAssetId) {
      const brollAssetIds = await resolveCompletedBrollAssetIds({
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
      });
      return {
        ok: true,
        pathTag: ASSEMBLY_PATH_TAG_AVATAR_SEGMENTS,
        primaryVideoAssetId: avatarSegments[0]!.outputMediaAssetId,
        brollAssetIds,
        voiceoverAssetId,
        remuxVoiceover: true,
        coldOpenTrimSec: null,
        avatarSegments,
      };
    }

    const primaryVideoAssetId = await resolveLatestPrimaryAssetId({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
    });
    if (!primaryVideoAssetId) {
      return {
        ok: false,
        code: "ASSEMBLY_INPUTS_INCOMPLETE",
        messageKey: "scripts.assembly.errors.inputsIncomplete",
      };
    }

    return {
      ok: true,
      pathTag: ASSEMBLY_PATH_TAG_PRIMARY,
      primaryVideoAssetId,
      brollAssetIds: [],
      voiceoverAssetId,
      // Talking-head: remux our TTS over provider-generated clip audio when VO exists.
      remuxVoiceover: voiceoverAssetId != null,
      coldOpenTrimSec: null,
    };
  }

  // Faceless: prefer completed broll stitch; else degrade to primary.
  const brollAssetIds = await resolveCompletedBrollAssetIds({
    clientId: input.clientId,
    reelScriptId: input.reelScriptId,
  });

  if (brollAssetIds.length >= 1) {
    const voiceoverAssetId = await resolveOwnedVoiceover({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
    });
    if (!voiceoverAssetId) {
      return {
        ok: false,
        code: "ASSEMBLY_INPUTS_INCOMPLETE",
        messageKey: "scripts.assembly.errors.facelessMissingVoiceover",
      };
    }

    const primaryVideoAssetId = await resolveLatestPrimaryAssetId({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
    });

    return {
      ok: true,
      pathTag: ASSEMBLY_PATH_TAG_BROLL_STITCH,
      primaryVideoAssetId,
      brollAssetIds,
      voiceoverAssetId,
      remuxVoiceover: true,
      coldOpenTrimSec,
    };
  }

  // Zero completed broll → degrade to Phase A primary if present.
  const primaryVideoAssetId = await resolveLatestPrimaryAssetId({
    clientId: input.clientId,
    reelScriptId: input.reelScriptId,
  });
  if (!primaryVideoAssetId) {
    return {
      ok: false,
      code: "ASSEMBLY_INPUTS_INCOMPLETE",
      messageKey: "scripts.assembly.errors.facelessWaitingForClips",
    };
  }

  const voiceoverAssetId = await resolveOwnedVoiceover({
    clientId: input.clientId,
    reelScriptId: input.reelScriptId,
  });

  return {
    ok: true,
    pathTag: ASSEMBLY_PATH_TAG_PRIMARY,
    primaryVideoAssetId,
    brollAssetIds: [],
    voiceoverAssetId,
    remuxVoiceover: voiceoverAssetId != null,
    coldOpenTrimSec: null,
  };
}

export async function areAssemblyInputsComplete(input: {
  clientId: string;
  reelScriptId: string;
  modalidad: VisualModality;
  targetDurationSec: number;
  coldOpenNotes?: string | null;
}): Promise<boolean> {
  const resolved = await resolveAssemblyInputs(input);
  return resolved.ok;
}
