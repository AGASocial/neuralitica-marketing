import "server-only";

import type { ReelScriptListItem } from "@/lib/contracts/reel-script";
import type {
  TtsVoiceId,
  VoiceoverSummaryByReelMap,
  VoiceoverSummaryDto,
} from "@/lib/contracts/tts-voiceover";
import {
  MEDIA_ASSET_TYPE_VOICEOVER,
  voiceoverAssetMetadataSchema,
} from "@/lib/contracts/media-assets";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type VoiceoverAssetRow = {
  id: string;
  created_at: string;
  metadata: unknown;
};

function buildSummaryForScript(params: {
  scriptId: string | null;
  item: ReelScriptListItem | undefined;
  latestAsset: VoiceoverAssetRow | null;
}): VoiceoverSummaryDto | null {
  if (!params.scriptId || !params.item) {
    return null;
  }

  const canSynthesize =
    params.item.status === "generated" &&
    params.item.package !== null &&
    params.item.package.voiceoverText.trim().length > 0;

  let voiceoverAssetId: string | null = null;
  let voiceId: TtsVoiceId | null = null;
  let createdAt: string | null = null;

  if (params.latestAsset) {
    voiceoverAssetId = params.latestAsset.id;
    createdAt = params.latestAsset.created_at;

    const metaParsed = voiceoverAssetMetadataSchema.safeParse(
      params.latestAsset.metadata ?? {},
    );
    if (metaParsed.success) {
      voiceId = metaParsed.data.voiceId;
    }
  }

  return {
    voiceoverAssetId,
    voiceId,
    createdAt,
    canSynthesize,
    canRegenerate: canSynthesize && voiceoverAssetId !== null,
  };
}

export async function getVoiceoverSummariesForReelScripts(params: {
  clientId: string;
  reelScriptIds: string[];
  itemsByScriptId: Map<string, ReelScriptListItem>;
}): Promise<VoiceoverSummaryByReelMap> {
  const result: VoiceoverSummaryByReelMap = {};

  for (const reelScriptId of params.reelScriptIds) {
    result[reelScriptId] = buildSummaryForScript({
      scriptId: reelScriptId,
      item: params.itemsByScriptId.get(reelScriptId),
      latestAsset: null,
    });
  }

  if (!isSupabaseConfigured() || params.reelScriptIds.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .select("id, created_at, metadata")
    .eq("client_id", params.clientId)
    .eq("asset_type", MEDIA_ASSET_TYPE_VOICEOVER)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return result;
  }

  const scriptIdSet = new Set(params.reelScriptIds);
  const latestByReel = new Map<string, VoiceoverAssetRow>();

  for (const raw of data) {
    const row = raw as VoiceoverAssetRow;
    const meta = row.metadata as { reelScriptId?: unknown } | null;
    const reelScriptId =
      meta && typeof meta.reelScriptId === "string" ? meta.reelScriptId : null;
    if (!reelScriptId || !scriptIdSet.has(reelScriptId)) {
      continue;
    }
    if (!latestByReel.has(reelScriptId)) {
      latestByReel.set(reelScriptId, row);
    }
  }

  for (const reelScriptId of params.reelScriptIds) {
    result[reelScriptId] = buildSummaryForScript({
      scriptId: reelScriptId,
      item: params.itemsByScriptId.get(reelScriptId),
      latestAsset: latestByReel.get(reelScriptId) ?? null,
    });
  }

  return result;
}

export async function findLatestVoiceoverAssetId(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .select("id, metadata")
    .eq("client_id", params.clientId)
    .eq("asset_type", MEDIA_ASSET_TYPE_VOICEOVER)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return null;
  }

  for (const raw of data) {
    const row = raw as { id: string; metadata: unknown };
    const meta = row.metadata as { reelScriptId?: unknown } | null;
    if (meta?.reelScriptId === params.reelScriptId) {
      return row.id;
    }
  }

  return null;
}
