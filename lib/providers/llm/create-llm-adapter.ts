import "server-only";

import type { ProviderCatalogRow } from "@/lib/contracts/providers";
import type { LlmProviderAdapter } from "@/lib/providers/provider-adapters";
import {
  createAiGatewayLlmAdapter,
  isAiGatewayLlmKey,
} from "@/lib/providers/llm/ai-gateway-llm-adapter";
import { createSiliconFlowLlmAdapter } from "@/lib/providers/siliconflow-llm-adapter";

/**
 * Single entry point for LLM adapters from a catalog row.
 * `ai_gateway_*` keys → Vercel AI Gateway; `siliconflow_*` keys → SiliconFlow adapter.
 */
export function createLlmAdapter(
  row: Pick<ProviderCatalogRow, "key" | "envKeyName" | "costModel">,
): LlmProviderAdapter | null {
  if (isAiGatewayLlmKey(row.key)) {
    return createAiGatewayLlmAdapter(row);
  }
  return createSiliconFlowLlmAdapter(row.key, row.envKeyName);
}
