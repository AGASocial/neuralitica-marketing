import "server-only";

import { randomUUID } from "node:crypto";

import { VOICEOVER_STORAGE_KEY_REGEX } from "@/lib/contracts/media-assets";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";

export type UploadVoiceoverBufferArgs = {
  clientId: string;
  reelScriptId: string;
  buffer: Buffer;
  mimeType: string;
};

export type UploadVoiceoverBufferResult = {
  storageKey: string;
  sizeBytes: number;
};

function extensionForMime(mimeType: string): "mp3" | "wav" | "m4a" {
  switch (mimeType) {
    case "audio/wav":
      return "wav";
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
    default:
      return "mp3";
  }
}

/**
 * Persist TTS voiceover bytes under neuramark/{clientId}/{reelScriptId}/{uuid}.ext (US-9.3).
 */
export async function uploadVoiceoverBuffer(
  args: UploadVoiceoverBufferArgs,
): Promise<UploadVoiceoverBufferResult> {
  const ext = extensionForMime(args.mimeType);
  const storageKey = `neuramark/${args.clientId}/${args.reelScriptId}/${randomUUID()}.${ext}`;

  if (!VOICEOVER_STORAGE_KEY_REGEX.test(storageKey)) {
    throw new Error("Generated voiceover storage key failed validation");
  }

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
