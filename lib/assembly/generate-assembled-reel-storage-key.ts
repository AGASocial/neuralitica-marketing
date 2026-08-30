import "server-only";

import { randomUUID } from "node:crypto";

import { ASSEMBLED_REEL_STORAGE_KEY_REGEX } from "@/lib/contracts/media-assets";

export function generateAssembledReelStorageKey(input: {
  clientId: string;
  reelScriptId: string;
}): string {
  const storageKey = `neuramark/${input.clientId}/${input.reelScriptId}/assembled-${randomUUID()}.mp4`;

  if (!ASSEMBLED_REEL_STORAGE_KEY_REGEX.test(storageKey)) {
    throw new Error("Generated assembled reel storage key failed validation");
  }

  return storageKey;
}
