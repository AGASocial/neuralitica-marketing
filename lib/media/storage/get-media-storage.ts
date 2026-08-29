import "server-only";

import { resolveMediaRoot } from "@/lib/media/media-config";
import { LocalDiskStorage } from "@/lib/media/storage/local-disk-storage";
import type { MediaStorage } from "@/lib/media/storage/media-storage";

let cached: MediaStorage | null = null;

/** V1 factory — LocalDiskStorage. Swap to S3Storage when infra lands. */
export function getMediaStorage(): MediaStorage {
  if (cached) {
    return cached;
  }
  cached = new LocalDiskStorage(resolveMediaRoot());
  return cached;
}

/** Test helper — clear singleton between cases. */
export function resetMediaStorageCacheForTests(): void {
  cached = null;
}
