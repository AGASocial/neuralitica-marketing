import "server-only";

import {
  ELEVENLABS_ENV_KEY_NAME,
  ELEVENLABS_TTS_PROVIDER_KEY,
} from "@/lib/contracts/elevenlabs-tts";
import type { ProviderTier } from "@/lib/contracts/providers";
import { DEFAULT_LOW_TIER_PROVIDER_KEYS } from "@/lib/contracts/providers";
import { SILICONFLOW_COSYVOICE2_PROVIDER_KEY } from "@/lib/contracts/tts-voiceover";
import type { ProviderRegistry } from "@/lib/providers/provider-adapters";

export const ALLOWED_TTS_PROVIDER_KEYS = [
  SILICONFLOW_COSYVOICE2_PROVIDER_KEY,
  ELEVENLABS_TTS_PROVIDER_KEY,
] as const;

export type AllowedTtsProviderKey = (typeof ALLOWED_TTS_PROVIDER_KEYS)[number];

export function isAllowedTtsProviderKey(
  providerKey: string,
): providerKey is AllowedTtsProviderKey {
  return (ALLOWED_TTS_PROVIDER_KEYS as readonly string[]).includes(providerKey);
}

/**
 * Prefer ElevenLabs when `ELEVENLABS_API_KEY` is set and the adapter is registered.
 * Falls back to the policy-resolved low-tier CosyVoice/Fish Speech path otherwise.
 */
export function resolveTtsProviderForSynthesis(params: {
  resolvedProviderKey: string;
  resolvedProviderTier: ProviderTier;
  registry: ProviderRegistry;
}): { providerKey: AllowedTtsProviderKey; providerTier: ProviderTier } | null {
  const apiKey = process.env[ELEVENLABS_ENV_KEY_NAME]?.trim();
  if (apiKey) {
    try {
      const adapter = params.registry.getTtsAdapter(ELEVENLABS_TTS_PROVIDER_KEY);
      if (adapter.providerKey === ELEVENLABS_TTS_PROVIDER_KEY) {
        return {
          providerKey: ELEVENLABS_TTS_PROVIDER_KEY,
          providerTier: "high",
        };
      }
    } catch {
      // Adapter not registered — fall through to policy key.
    }
  }

  if (!isAllowedTtsProviderKey(params.resolvedProviderKey)) {
    return null;
  }

  return {
    providerKey: params.resolvedProviderKey,
    providerTier: params.resolvedProviderTier,
  };
}

/** @deprecated Prefer resolveTtsProviderForSynthesis */
export function isLegacyLowTierTtsKey(providerKey: string): boolean {
  return providerKey === DEFAULT_LOW_TIER_PROVIDER_KEYS.tts;
}
