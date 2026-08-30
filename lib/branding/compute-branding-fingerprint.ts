import { createHash } from "node:crypto";

import type { BrandingConfigSnapshot } from "@/lib/contracts/branding-job";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function computeBrandingFingerprint(params: {
  preBrandingOutputMediaAssetId: string;
  brandingConfig: BrandingConfigSnapshot;
  subtitleSourceHash: string;
}): string {
  const payload = `${params.preBrandingOutputMediaAssetId}|${stableStringify(params.brandingConfig)}|${params.subtitleSourceHash}`;
  return createHash("sha256").update(payload).digest("hex");
}
