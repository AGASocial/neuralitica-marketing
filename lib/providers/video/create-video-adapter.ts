import "server-only";

import {
  AI_GATEWAY_ENV_KEY_NAME,
  AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
  AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND,
  AI_GATEWAY_HEYGEN_VIDEO_MODEL,
  AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS,
  AI_GATEWAY_SEEDANCE_BROLL_MODEL,
  AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY,
  AI_GATEWAY_SEEDANCE_UNIT_COST_CENTS_PER_CLIP,
  isAiGatewayVideoKey,
} from "@/lib/contracts/ai-gateway-video";
import type { ProviderCatalogRow } from "@/lib/contracts/providers";
import type { VideoProviderAdapter } from "@/lib/providers/provider-adapters";
import { createAiGatewayHeygenAvatarAdapter } from "@/lib/providers/video/ai-gateway-heygen-avatar-adapter";
import { createAiGatewaySeedanceBrollAdapter } from "@/lib/providers/video/ai-gateway-seedance-broll-adapter";

/**
 * Single entry for AI Gateway video adapters from a catalog row.
 * `ai_gateway_heygen_avatar` / `ai_gateway_seedance_broll` → Gateway SDK adapters.
 * Other keys are wired explicitly in create-provider-registry.
 */
export function createAiGatewayVideoAdapter(
  row: Pick<ProviderCatalogRow, "key" | "envKeyName" | "costModel">,
): VideoProviderAdapter | null {
  if (!isAiGatewayVideoKey(row.key)) {
    return null;
  }

  const envKeyName = row.envKeyName || AI_GATEWAY_ENV_KEY_NAME;
  const gatewayModel =
    typeof row.costModel.metadata?.gatewayModel === "string"
      ? row.costModel.metadata.gatewayModel
      : undefined;

  if (row.key === AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY) {
    const approxDurationSec =
      typeof row.costModel.metadata?.approxDurationSec === "number"
        ? row.costModel.metadata.approxDurationSec
        : 30;
    return createAiGatewayHeygenAvatarAdapter({
      defaultEstimateCents: row.costModel.unitCostCents * approxDurationSec,
      unitCostCentsPerSecond: row.costModel.unitCostCents,
      envKeyName,
      gatewayModel: gatewayModel ?? AI_GATEWAY_HEYGEN_VIDEO_MODEL,
    });
  }

  if (row.key === AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY) {
    const fallbacks = row.costModel.metadata?.gatewayFallbackModels;
    return createAiGatewaySeedanceBrollAdapter({
      defaultEstimateCents: row.costModel.unitCostCents,
      unitCostCentsPerClip: row.costModel.unitCostCents,
      envKeyName,
      gatewayModel: gatewayModel ?? AI_GATEWAY_SEEDANCE_BROLL_MODEL,
      fallbackModels: Array.isArray(fallbacks)
        ? fallbacks.filter((entry): entry is string => typeof entry === "string")
        : AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS,
    });
  }

  return null;
}

export {
  AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
  AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY,
  AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND,
  AI_GATEWAY_SEEDANCE_UNIT_COST_CENTS_PER_CLIP,
};
