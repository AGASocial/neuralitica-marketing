import "server-only";

import {
  authGuardResponse,
  isAuthGuardError,
  requireActive,
} from "@/lib/auth/require-user";
import { MEDIA_ASSET_TYPE_AVATAR_REFERENCE } from "@/lib/contracts/media-assets";
import { avatarReferenceAssetMetadataSchema } from "@/lib/contracts/media-assets";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeFilenameForHeader(name: string): string {
  return name.replace(/["\\;\r\n]/g, "_").slice(0, 180);
}

/**
 * Authenticated ownership-checked media serve (US-3.3).
 * Frontend consumer: Preferencias referencias `<img>` / `<video>` src.
 * Cache-Control: private, no-store. Foreign/missing → 404.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardResponse(error);
    }
    throw error;
  }

  const { assetId } = await context.params;
  if (!assetId || !UUID_RE.test(assetId)) {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (!isSupabaseConfigured()) {
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(MEDIA_TABLE)
    .select("id, storage_key, metadata")
    .eq("id", assetId)
    .eq("client_id", user.id)
    .eq("asset_type", MEDIA_ASSET_TYPE_AVATAR_REFERENCE)
    .maybeSingle();

  if (error) {
    console.error("[media] serve find failed", { code: error.code });
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (
    !data ||
    typeof (data as { storage_key?: unknown }).storage_key !== "string"
  ) {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const storageKey = (data as { storage_key: string }).storage_key;
  const metaParsed = avatarReferenceAssetMetadataSchema.safeParse(
    (data as { metadata: unknown }).metadata ?? {},
  );
  const contentType = metaParsed.success
    ? metaParsed.data.detectedMime
    : "application/octet-stream";
  const originalFilename = metaParsed.success
    ? metaParsed.data.originalFilename
    : undefined;

  try {
    const storage = getMediaStorage();
    const stream = await storage.readStream(storageKey);
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": originalFilename
        ? `inline; filename="${sanitizeFilenameForHeader(originalFilename)}"`
        : "inline",
    };
    return new Response(stream, { status: 200, headers });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store",
        },
      });
    }
    console.error("[media] serve stream failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }
}
