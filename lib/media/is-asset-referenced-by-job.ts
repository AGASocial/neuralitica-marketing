import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { VIDEO_JOBS_TABLE } from "@/lib/video-jobs/video-job-row";

/**
 * Job-reference gate for media asset delete (US-3.3 / US-8.4).
 */
export async function isAvatarReferenceAssetReferencedByJob(
  assetId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id")
    .or(
      `portrait_asset_id.eq.${assetId},voiceover_asset_id.eq.${assetId},output_media_asset_id.eq.${assetId}`,
    )
    .limit(1);

  if (error) {
    return true;
  }

  return (data?.length ?? 0) > 0;
}
