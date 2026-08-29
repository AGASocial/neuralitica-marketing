import "server-only";

/**
 * Server-only media blob storage (US-3.3).
 * LocalDiskStorage now; S3Storage stub for same-region object storage later.
 * Client Components never receive bucket/region/keys/presigns.
 */
export interface MediaStorage {
  put(
    key: string,
    data: Buffer | ReadableStream,
    meta: { contentType: string; sizeBytes: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  readStream(key: string): Promise<ReadableStream>;
  /** Assert key matches frozen regex before any I/O */
  assertSafeKey(key: string): void;
}
