import "server-only";

import { createHmac } from "node:crypto";

import { getAllowlistedSiteOrigin } from "@/lib/auth/site-origin";
import { SADTALKER_INPUT_URL_TTL_SEC } from "@/lib/contracts/sadtalker-low";
import { getProviderAssetUrlSecret } from "@/lib/media/provider-asset-url-secret";
import { ProviderAdapterError } from "@/lib/providers/normalize-provider-response";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";

export const PROVIDER_ASSET_NOT_FOUND = "PROVIDER_ASSET_NOT_FOUND" as const;
export const PROVIDER_ASSET_MIME_REJECTED =
  "PROVIDER_ASSET_MIME_REJECTED" as const;

function requireProviderAssetUrlSecret(): string {
  const secret = getProviderAssetUrlSecret();
  if (!secret) {
    throw new ProviderAdapterError(
      "PROVIDER_CONFIG_MISSING",
      "Provider asset URL signing is not configured",
    );
  }

  return secret;
}

function extractDetectedMime(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const detectedMime = (metadata as { detectedMime?: unknown }).detectedMime;
  return typeof detectedMime === "string" ? detectedMime : null;
}

function buildSignedProviderAssetReadUrl(params: {
  assetId: string;
  clientId: string;
  ttlSec: number;
}): string {
  const origin = getAllowlistedSiteOrigin();
  if (!origin) {
    throw new ProviderAdapterError(
      "PROVIDER_CONFIG_MISSING",
      "Site origin is not configured for provider asset URLs",
    );
  }

  const exp = Math.floor(Date.now() / 1000) + params.ttlSec;
  const payload = `${params.assetId}:${params.clientId}:${exp}`;
  const sig = createHmac("sha256", requireProviderAssetUrlSecret())
    .update(payload)
    .digest("hex");

  const url = new URL(`/api/media/provider-assets/${params.assetId}`, origin);
  url.searchParams.set("client", params.clientId);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.href;
}

/**
 * Resolve a tenant-owned media asset to a short-lived HTTPS URL readable by video vendors.
 * Never accepts client-supplied URLs — only DB-backed asset IDs (US-8.2 CONTRACT).
 */
export async function resolveMediaAssetUrlForProvider(params: {
  assetId: string;
  clientId: string;
  allowedMimeTypes: readonly string[];
  ttlSec?: number;
}): Promise<string> {
  const { assetId, clientId, allowedMimeTypes } = params;
  const ttlSec = params.ttlSec ?? SADTALKER_INPUT_URL_TTL_SEC;

  if (!isSupabaseConfigured()) {
    throw new ProviderAdapterError(
      "PROVIDER_CONFIG_MISSING",
      "Media storage is not configured",
    );
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(MEDIA_TABLE)
    .select("id, client_id, storage_key, metadata")
    .eq("id", assetId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw new ProviderAdapterError(
      "PROVIDER_ASSET_LOOKUP_FAILED",
      "Failed to resolve media asset for provider",
    );
  }

  if (
    !data ||
    typeof (data as { storage_key?: unknown }).storage_key !== "string"
  ) {
    throw new ProviderAdapterError(
      PROVIDER_ASSET_NOT_FOUND,
      "Media asset not found for client",
    );
  }

  const detectedMime = extractDetectedMime(
    (data as { metadata: unknown }).metadata,
  );
  if (
    !detectedMime ||
    !allowedMimeTypes.includes(
      detectedMime as (typeof allowedMimeTypes)[number],
    )
  ) {
    throw new ProviderAdapterError(
      PROVIDER_ASSET_MIME_REJECTED,
      "Media asset MIME type is not allowed for provider input",
    );
  }

  return buildSignedProviderAssetReadUrl({ assetId, clientId, ttlSec });
}
