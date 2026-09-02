import "server-only";

import { resolveMediaRoot } from "@/lib/media/media-config";
import { LocalDiskStorage } from "@/lib/media/storage/local-disk-storage";
import type { MediaStorage } from "@/lib/media/storage/media-storage";
import { SupabaseObjectStorage } from "@/lib/media/storage/supabase-object-storage";
import { isSupabaseConfigured } from "@/lib/supabase/server";

let cached: MediaStorage | null = null;

function shouldUseSupabaseObjectStorage(): boolean {
  const backend = process.env.NEURAMARK_MEDIA_BACKEND?.trim();
  if (backend === "local") {
    return false;
  }
  if (backend === "supabase") {
    return true;
  }
  return process.env.VERCEL === "1" && isSupabaseConfigured();
}

/**
 * Local disk in development. On Vercel, private Supabase Storage —
 * the serverless filesystem is not writable and not shared across requests.
 */
export function getMediaStorage(): MediaStorage {
  if (cached) {
    return cached;
  }
  cached =
    shouldUseSupabaseObjectStorage()
      ? new SupabaseObjectStorage()
      : new LocalDiskStorage(resolveMediaRoot());
  return cached;
}

/** Test helper — clear singleton between cases. */
export function resetMediaStorageCacheForTests(): void {
  cached = null;
}
