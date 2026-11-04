/**
 * Materialize per-segment voiceover media assets by ffmpeg-slicing the full VO.
 * When only one segment is planned, returns the original asset id unchanged.
 */
import "server-only";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PlannedAvatarVoiceoverSegment } from "@/lib/video-jobs/plan-avatar-voiceover-segments";
import { MEDIA_ASSET_TYPE_VOICEOVER } from "@/lib/contracts/media-assets";
import { resolveMediaAssetUrlForProvider } from "@/lib/media/resolve-media-asset-url-for-provider";
import { uploadVoiceoverBuffer } from "@/lib/media/upload-voiceover-buffer";
import { splitVoiceoverAudioAtOffsets } from "@/lib/tts/split-voiceover-audio-at-offsets";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type MaterializedAvatarSegmentVoiceover = PlannedAvatarVoiceoverSegment & {
  voiceoverAssetId: string;
};

async function downloadUrlToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download voiceover (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function materializeAvatarSegmentVoiceovers(params: {
  clientId: string;
  reelScriptId: string;
  fullVoiceoverAssetId: string;
  segments: PlannedAvatarVoiceoverSegment[];
}): Promise<MaterializedAvatarSegmentVoiceover[]> {
  if (params.segments.length <= 1) {
    const only = params.segments[0];
    if (!only) {
      return [];
    }
    return [{ ...only, voiceoverAssetId: params.fullVoiceoverAssetId }];
  }

  if (!isSupabaseConfigured()) {
    return params.segments.map((segment) => ({
      ...segment,
      voiceoverAssetId: params.fullVoiceoverAssetId,
    }));
  }

  const url = await resolveMediaAssetUrlForProvider({
    assetId: params.fullVoiceoverAssetId,
    clientId: params.clientId,
    kind: "audio",
  });
  const fullBuffer = await downloadUrlToBuffer(url);

  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "neuramark-avatar-vo-split-"),
  );
  const fullPath = path.join(tempRoot, "full.mp3");
  try {
    await writeFile(fullPath, fullBuffer);

    const slices = params.segments.map((segment) => ({
      index: segment.index,
      startSec: segment.startSec,
      durationSec: segment.durationSec,
      outputPath: path.join(tempRoot, `seg${segment.index}.mp3`),
    }));
    await splitVoiceoverAudioAtOffsets({
      localVoiceoverPath: fullPath,
      slices,
    });

    const supabase = createServerSupabaseClient();
    const results: MaterializedAvatarSegmentVoiceover[] = [];

    for (const segment of params.segments) {
      const slicePath = path.join(tempRoot, `seg${segment.index}.mp3`);
      const sliceBuffer = await readFile(slicePath);
      const uploaded = await uploadVoiceoverBuffer({
        clientId: params.clientId,
        reelScriptId: params.reelScriptId,
        buffer: sliceBuffer,
        mimeType: "audio/mpeg",
      });

      const { data, error } = await supabase
        .from("neuramark_media_assets")
        .insert({
          client_id: params.clientId,
          asset_type: MEDIA_ASSET_TYPE_VOICEOVER,
          storage_key: uploaded.storageKey,
          metadata: {
            originalFilename: `voiceover-seg${segment.index}.mp3`,
            detectedMime: "audio/mpeg",
            sizeBytes: uploaded.sizeBytes,
            source: "avatar_segment_split",
            reelScriptId: params.reelScriptId,
            segmentIndex: segment.index,
            durationSec: segment.durationSec,
            parentVoiceoverAssetId: params.fullVoiceoverAssetId,
          },
        })
        .select("id")
        .single();

      if (error || !data || typeof (data as { id: unknown }).id !== "string") {
        throw new Error("Failed to insert segment voiceover media asset");
      }

      results.push({
        ...segment,
        voiceoverAssetId: (data as { id: string }).id,
      });
    }

    return results;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
