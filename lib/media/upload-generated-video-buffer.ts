import "server-only";

import { randomUUID } from "node:crypto";

import { getMediaStorage } from "@/lib/media/storage/get-media-storage";

export type UploadGeneratedVideoArgs = {
  clientId: string;
  reelScriptId: string;
  buffer: Buffer;
  mimeType: string;
};

export type UploadGeneratedVideoResult = {
  storageKey: string;
  sizeBytes: number;
};

/**
 * Persist generated video bytes under a flat `{uuid}.mp4` storage key (US-8.2 CONTRACT).
 * `clientId` / `reelScriptId` are logical lineage for orchestrator use — not encoded in the key.
 */
export async function uploadGeneratedVideoBuffer(
  args: UploadGeneratedVideoArgs,
): Promise<UploadGeneratedVideoResult> {
  const storageKey = `${randomUUID()}.mp4`;
  const storage = getMediaStorage();
  await storage.put(storageKey, args.buffer, {
    contentType: args.mimeType,
    sizeBytes: args.buffer.length,
  });
  return {
    storageKey,
    sizeBytes: args.buffer.length,
  };
}
