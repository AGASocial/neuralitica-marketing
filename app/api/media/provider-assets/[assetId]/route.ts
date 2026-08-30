import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";

const MEDIA_TABLE = "neuramark_media_assets";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getProviderAssetUrlSecret(): string | null {
  return (
    process.env.NEURAMARK_PROVIDER_ASSET_URL_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    null
  );
}

function verifySignature(params: {
  assetId: string;
  clientId: string;
  exp: string;
  sig: string;
}): boolean {
  const secret = getProviderAssetUrlSecret();
  if (!secret) {
    return false;
  }

  const payload = `${params.assetId}:${params.clientId}:${params.exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(params.sig, "hex");
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

function extractDetectedMime(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const detectedMime = (metadata as { detectedMime?: unknown }).detectedMime;
  return typeof detectedMime === "string" ? detectedMime : null;
}

/**
 * HMAC-signed vendor-readable asset route (US-8.2 M1 / US-8.4).
 * Consumer: Replicate createJob input fetch via resolveMediaAssetUrlForProvider.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const { assetId } = await context.params;
  if (!assetId || !UUID_RE.test(assetId)) {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const clientId = url.searchParams.get("client") ?? "";
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  if (!clientId || !UUID_RE.test(clientId) || !exp || !sig) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const expSeconds = Number.parseInt(exp, 10);
  if (!Number.isFinite(expSeconds) || expSeconds < Math.floor(Date.now() / 1000)) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!verifySignature({ assetId, clientId, exp, sig })) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isSupabaseConfigured()) {
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(MEDIA_TABLE)
    .select("id, storage_key, metadata")
    .eq("id", assetId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    !data ||
    typeof (data as { storage_key?: unknown }).storage_key !== "string"
  ) {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const storageKey = (data as { storage_key: string }).storage_key;
  const contentType =
    extractDetectedMime((data as { metadata: unknown }).metadata) ??
    "application/octet-stream";

  try {
    const storage = getMediaStorage();
    const stream = await storage.readStream(storageKey);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
