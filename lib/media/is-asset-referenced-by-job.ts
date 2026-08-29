import "server-only";

/**
 * Job-reference stub for delete gate (US-3.3).
 * When neuramark_video_jobs is absent → always false (delete allowed).
 * US-8: real EXISTS check when jobs table references media assets.
 */
export async function isAvatarReferenceAssetReferencedByJob(
  _assetId: string,
): Promise<boolean> {
  // Jobs table not present in US-3.3 — safe no-op (never blocks delete).
  return false;
}
