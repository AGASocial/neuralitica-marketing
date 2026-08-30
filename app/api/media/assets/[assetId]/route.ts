import "server-only";

import {
  authGuardResponse,
  isAuthGuardError,
  requireActive,
  requireOperator,
} from "@/lib/auth/require-user";
import {
  MEDIA_ASSET_TYPE_ASSEMBLED_REEL,
  MEDIA_ASSET_TYPE_AVATAR_REFERENCE,
  MEDIA_ASSET_TYPE_GENERATED_VIDEO,
  MEDIA_ASSET_TYPE_VOICEOVER,
} from "@/lib/contracts/media-assets";
import {
  assembledReelAssetMetadataSchema,
  avatarReferenceAssetMetadataSchema,
  generatedVideoAssetMetadataSchema,
  voiceoverAssetMetadataSchema,
} from "@/lib/contracts/media-assets";
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

function notFoundResponse(): Response {
  return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

function internalErrorResponse(): Response {
  return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
    status: 500,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Authenticated ownership-checked media serve (US-3.3 + US-8.3 + US-9.3).
 * avatar_reference: cliente session. generated_video + voiceover: Operator session.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const { assetId } = await context.params;
  if (!assetId || !UUID_RE.test(assetId)) {
    return notFoundResponse();
  }

  if (!isSupabaseConfigured()) {
    return internalErrorResponse();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(MEDIA_TABLE)
    .select("id, client_id, asset_type, storage_key, metadata")
    .eq("id", assetId)
    .maybeSingle();

  if (error) {
    console.error("[media] serve find failed", { code: error.code });
    return internalErrorResponse();
  }

  if (
    !data ||
    typeof (data as { storage_key?: unknown }).storage_key !== "string" ||
    typeof (data as { asset_type?: unknown }).asset_type !== "string" ||
    typeof (data as { client_id?: unknown }).client_id !== "string"
  ) {
    return notFoundResponse();
  }

  const row = data as {
    client_id: string;
    asset_type: string;
    storage_key: string;
    metadata: unknown;
  };

  let contentType = "application/octet-stream";
  let originalFilename: string | undefined;

  if (row.asset_type === MEDIA_ASSET_TYPE_AVATAR_REFERENCE) {
    let user;
    try {
      user = await requireActive("handler");
    } catch (authError) {
      if (isAuthGuardError(authError)) {
        return authGuardResponse(authError);
      }
      throw authError;
    }

    if (row.client_id !== user.id) {
      return notFoundResponse();
    }

    const metaParsed = avatarReferenceAssetMetadataSchema.safeParse(
      row.metadata ?? {},
    );
    if (metaParsed.success) {
      contentType = metaParsed.data.detectedMime;
      originalFilename = metaParsed.data.originalFilename;
    }
  } else if (row.asset_type === MEDIA_ASSET_TYPE_GENERATED_VIDEO) {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (authError) {
      if (isAuthGuardError(authError)) {
        return authGuardResponse(authError);
      }
      throw authError;
    }

    if (row.client_id !== operator.id) {
      return notFoundResponse();
    }

    const metaParsed = generatedVideoAssetMetadataSchema.safeParse(
      row.metadata ?? {},
    );
    if (metaParsed.success) {
      contentType = metaParsed.data.detectedMime;
      originalFilename = metaParsed.data.originalFilename;
    }
  } else if (row.asset_type === MEDIA_ASSET_TYPE_VOICEOVER) {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (authError) {
      if (isAuthGuardError(authError)) {
        return authGuardResponse(authError);
      }
      throw authError;
    }

    if (row.client_id !== operator.id) {
      return notFoundResponse();
    }

    const metaParsed = voiceoverAssetMetadataSchema.safeParse(
      row.metadata ?? {},
    );
    if (metaParsed.success) {
      contentType = metaParsed.data.detectedMime;
      originalFilename = metaParsed.data.originalFilename;
    }
  } else if (row.asset_type === MEDIA_ASSET_TYPE_ASSEMBLED_REEL) {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (authError) {
      if (isAuthGuardError(authError)) {
        return authGuardResponse(authError);
      }
      throw authError;
    }

    if (row.client_id !== operator.id) {
      return notFoundResponse();
    }

    const metaParsed = assembledReelAssetMetadataSchema.safeParse(
      row.metadata ?? {},
    );
    if (metaParsed.success) {
      contentType = metaParsed.data.detectedMime;
      originalFilename = "assembled-reel.mp4";
    } else {
      contentType = "video/mp4";
      originalFilename = "assembled-reel.mp4";
    }
  } else {
    return notFoundResponse();
  }

  const storageKey = row.storage_key;

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
      return notFoundResponse();
    }
    console.error("[media] serve stream failed", {
      name: err instanceof Error ? err.name : "unknown",
    });
    return internalErrorResponse();
  }
}
