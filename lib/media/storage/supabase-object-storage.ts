import "server-only";

import { isAllowedMediaStorageKey } from "@/lib/media/storage/allowed-storage-key";
import type { MediaStorage } from "@/lib/media/storage/media-storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const NEURAMARK_MEDIA_BUCKET = "neuramark-media";

export class UnsafeStorageKeyError extends Error {
  constructor(key: string) {
    super(`Unsafe storage key rejected: ${key.slice(0, 64)}`);
    this.name = "UnsafeStorageKeyError";
  }
}

/**
 * Durable MediaStorage via private Supabase Storage.
 * Used on Vercel where the function filesystem is not writable / not shared.
 */
export class SupabaseObjectStorage implements MediaStorage {
  assertSafeKey(key: string): void {
    if (!isAllowedMediaStorageKey(key)) {
      throw new UnsafeStorageKeyError(String(key ?? ""));
    }
  }

  async put(
    key: string,
    data: Buffer | ReadableStream,
    meta: { contentType: string; sizeBytes: number },
  ): Promise<void> {
    this.assertSafeKey(key);
    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(await new Response(data).arrayBuffer());
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.storage
      .from(NEURAMARK_MEDIA_BUCKET)
      .upload(key, buffer, {
        contentType: meta.contentType,
        upsert: false,
      });
    if (error) {
      throw new Error(`Supabase media put failed: ${error.message}`);
    }
  }

  async delete(key: string): Promise<void> {
    this.assertSafeKey(key);
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.storage
      .from(NEURAMARK_MEDIA_BUCKET)
      .remove([key]);
    if (error) {
      throw new Error(`Supabase media delete failed: ${error.message}`);
    }
  }

  async readStream(key: string): Promise<ReadableStream> {
    this.assertSafeKey(key);
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.storage
      .from(NEURAMARK_MEDIA_BUCKET)
      .download(key);
    if (error || !data) {
      throw new Error(
        `Supabase media read failed: ${error?.message ?? "missing object"}`,
      );
    }
    return data.stream();
  }
}
