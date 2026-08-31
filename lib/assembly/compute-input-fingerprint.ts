import { createHash } from "node:crypto";

import {
  ASSEMBLY_PATH_TAG_PRIMARY,
  ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
  type AssemblyPathTag,
} from "@/lib/contracts/assembly-job";

/**
 * Five-part assembly fingerprint (US-9.1 Phase B):
 * primary|voiceover|template|ordered_broll_ids|path_tag
 */
export function computeAssemblyInputFingerprint(params: {
  primaryVideoAssetId: string | null;
  voiceoverAssetId: string | null;
  templateId?: string;
  orderedBrollAssetIds?: string[];
  pathTag?: AssemblyPathTag;
}): string {
  const templateId = params.templateId ?? ASSEMBLY_TEMPLATE_REEL_V1_BASIC;
  const orderedBroll = params.orderedBrollAssetIds ?? [];
  const pathTag = params.pathTag ?? ASSEMBLY_PATH_TAG_PRIMARY;
  const payload = [
    params.primaryVideoAssetId ?? "",
    params.voiceoverAssetId ?? "",
    templateId,
    orderedBroll.join(","),
    pathTag,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
