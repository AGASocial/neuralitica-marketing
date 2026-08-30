import { createHash } from "node:crypto";

import { ASSEMBLY_TEMPLATE_REEL_V1_BASIC } from "@/lib/contracts/assembly-job";

export function computeAssemblyInputFingerprint(params: {
  primaryVideoAssetId: string;
  voiceoverAssetId: string | null;
  templateId?: string;
}): string {
  const templateId = params.templateId ?? ASSEMBLY_TEMPLATE_REEL_V1_BASIC;
  const payload = `${params.primaryVideoAssetId}|${params.voiceoverAssetId ?? ""}|${templateId}`;
  return createHash("sha256").update(payload).digest("hex");
}
