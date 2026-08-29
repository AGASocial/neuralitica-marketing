import "server-only";

import type { MediaStorage } from "@/lib/media/storage/media-storage";
import { STORAGE_KEY_REGEX } from "@/lib/contracts/media-assets";

/**
 * S3 / same-region object storage stub (US-3.3).
 * Production adapter swap later — same interface; serve Route Handler unchanged.
 * Methods throw until configured; no client credentials.
 */
export class S3Storage implements MediaStorage {
  assertSafeKey(key: string): void {
    if (typeof key !== "string" || !STORAGE_KEY_REGEX.test(key)) {
      throw new Error(`Unsafe storage key rejected: ${String(key ?? "").slice(0, 64)}`);
    }
  }

  async put(
    _key: string,
    _data: Buffer | ReadableStream,
    _meta: { contentType: string; sizeBytes: number },
  ): Promise<void> {
    throw new Error("S3Storage not configured");
  }

  async delete(_key: string): Promise<void> {
    throw new Error("S3Storage not configured");
  }

  async readStream(_key: string): Promise<ReadableStream> {
    throw new Error("S3Storage not configured");
  }
}
