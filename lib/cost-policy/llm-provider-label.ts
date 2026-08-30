import type { ProviderTier } from "@/lib/contracts/providers";

const LLM_PROVIDER_LABELS: Record<string, string> = {
  siliconflow_deepseek_flash: "DeepSeek Flash",
  siliconflow_qwen: "Qwen 2.5",
};

export function resolveLlmProviderLabel(providerKey: string): string {
  const mapped = LLM_PROVIDER_LABELS[providerKey];
  if (mapped) {
    return mapped;
  }
  return providerKey
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hasActiveHighTierLlmProvider(
  providers: ReadonlyArray<{ assetRole: string; tier: ProviderTier; active: boolean }>,
): boolean {
  return providers.some(
    (row) => row.assetRole === "llm" && row.tier === "high" && row.active,
  );
}
