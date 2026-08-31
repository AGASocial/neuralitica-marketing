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
  MEDIA_ASSET_TYPE_CLIENT_LOGO,
  MEDIA_ASSET_TYPE_COVER_FRAME,
  MEDIA_ASSET_TYPE_GENERATED_VIDEO,
  MEDIA_ASSET_TYPE_VOICEOVER,
} from "@/lib/contracts/media-assets";
import { MEDIA_ASSET_DISPOSITION_ATTACHMENT } from "@/lib/contracts/approval";
import {
  assembledReelAssetMetadataSchema,
  avatarReferenceAssetMetadataSchema,
  clientLogoAssetMetadataSchema,
  coverFrameAssetMetadataSchema,
  generatedVideoAssetMetadataSchema,
  voiceoverAssetMetadataSchema,
} from "@/lib/contracts/media-assets";
import { hasApprovedApprovalForOutputAsset } from "@/lib/approvals/persist-approval";
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
 * Authenticated ownership-checked media serve (US-3.3 + US-8.3 + US-9.2 + US-11.1 + US-11.3).
 * avatar_reference / client_logo / cover_frame: Cliente session.
 * generated_video + voiceover: Operator only.
 * assembled_reel: owning Cliente (requireActive) or Operator (requireOperator).
 * US-11.3: Cliente `?disposition=attachment` requires approved approval linkage.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const url = new URL(request.url);
  const dispositionParam = url.searchParams.get("disposition");
  const attachmentMode =
    dispositionParam === MEDIA_ASSET_DISPOSITION_ATTACHMENT;

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
  let accessViaCliente = false;

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
  } else if (row.asset_type === MEDIA_ASSET_TYPE_CLIENT_LOGO) {
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

    const metaParsed = clientLogoAssetMetadataSchema.safeParse(
      row.metadata ?? {},
    );
    if (metaParsed.success) {
      contentType = metaParsed.data.detectedMime;
      originalFilename = metaParsed.data.originalFilename;
    }
  } else if (row.asset_type === MEDIA_ASSET_TYPE_COVER_FRAME) {
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

    const metaParsed = coverFrameAssetMetadataSchema.safeParse(row.metadata ?? {});
    contentType = "image/jpeg";
    originalFilename = "cover.jpg";
    if (metaParsed.success) {
      contentType = metaParsed.data.detectedMime;
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
    // US-11.1: Cliente ownership first, then Operator ownership (do not widen
    // generated_video / voiceover).
    let allowed = false;
    let hadSuccessfulAuth = false;
    let lastAuthError: import("@/lib/auth/require-user").AuthGuardError | null =
      null;

    try {
      const user = await requireActive("handler");
      hadSuccessfulAuth = true;
      if (row.client_id === user.id) {
        allowed = true;
        accessViaCliente = true;
      }
    } catch (authError) {
      if (isAuthGuardError(authError)) {
        lastAuthError = authError;
      } else {
        throw authError;
      }
    }

    if (!allowed) {
      try {
        await requireOperator("handler");
        hadSuccessfulAuth = true;
        // US-12.1: Operator may stream any active client's assembled_reel thumbnail.
        allowed = true;
      } catch (authError) {
        if (isAuthGuardError(authError)) {
          lastAuthError = authError;
        } else {
          throw authError;
        }
      }
    }

    if (!allowed) {
      if (!hadSuccessfulAuth && lastAuthError) {
        return authGuardResponse(lastAuthError);
      }
      return notFoundResponse();
    }

    if (attachmentMode && accessViaCliente) {
      const approvedLink = await hasApprovedApprovalForOutputAsset({
        clientId: row.client_id,
        assetId,
      });
      if (!approvedLink) {
        return notFoundResponse();
      }
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
    const dispositionType =
      attachmentMode && row.asset_type === MEDIA_ASSET_TYPE_ASSEMBLED_REEL
        ? "attachment"
        : "inline";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": originalFilename
        ? `${dispositionType}; filename="${sanitizeFilenameForHeader(originalFilename)}"`
        : dispositionType,
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
