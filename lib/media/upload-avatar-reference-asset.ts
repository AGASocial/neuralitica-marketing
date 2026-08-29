"use server";

import { revalidatePath } from "next/cache";

import type { UploadAvatarReferenceAssetResult } from "@/lib/contracts/media-assets";
import { MEDIA_ASSET_TYPE_AVATAR_REFERENCE } from "@/lib/contracts/media-assets";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  mediaUploadAssetLimitReachedError,
  mediaUploadFileTooLargeError,
  mediaUploadForbiddenError,
  mediaUploadForbiddenFieldsError,
  mediaUploadInternalError,
  mediaUploadInvalidFileTypeError,
  mediaUploadMissingFileError,
  mediaUploadOwnAvatarConsentRequiredError,
  mediaUploadUnauthenticatedError,
  mediaUploadValidationError,
  mediaUploadVideoTooLongError,
} from "@/lib/media/media-errors";
import {
  findForbiddenUploadFormKeys,
  mapMediaAssetRowToItem,
  type MediaAssetSelectRow,
} from "@/lib/media/media-helpers";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import { validateAndPrepareMediaUpload } from "@/lib/media/upload-validation";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UploadAvatarReferenceAssetResult {
  if (error.status === 401) {
    return mediaUploadUnauthenticatedError();
  }
  return mediaUploadForbiddenError();
}

function mapValidatorCode(
  code: string,
): UploadAvatarReferenceAssetResult {
  switch (code) {
    case "OWN_AVATAR_CONSENT_REQUIRED":
      return mediaUploadOwnAvatarConsentRequiredError();
    case "ASSET_LIMIT_REACHED":
      return mediaUploadAssetLimitReachedError();
    case "FILE_TOO_LARGE":
      return mediaUploadFileTooLargeError();
    case "INVALID_FILE_TYPE":
      return mediaUploadInvalidFileTypeError();
    case "VIDEO_TOO_LONG":
      return mediaUploadVideoTooLongError();
    case "VALIDATION_ERROR":
      return mediaUploadValidationError({ file: ["invalid"] });
    default:
      return mediaUploadInternalError();
  }
}

async function uploadAvatarReferenceAssetInner(
  formData: FormData,
): Promise<UploadAvatarReferenceAssetResult> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenUploadFormKeys(formData).length > 0) {
    return mediaUploadForbiddenFieldsError();
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return mediaUploadMissingFileError();
  }

  // File from FormData — duck-type for Node test environments without File
  const file = fileEntry as File;
  if (typeof file.arrayBuffer !== "function") {
    return mediaUploadMissingFileError();
  }

  if (!isSupabaseConfigured()) {
    console.error("[media] upload unavailable: Supabase not configured");
    return mediaUploadInternalError();
  }

  const supabase = createServerSupabaseClient();
  const { count, error: countError } = await supabase
    .from(MEDIA_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("client_id", user.id)
    .eq("asset_type", MEDIA_ASSET_TYPE_AVATAR_REFERENCE);

  if (countError) {
    console.error("[media] upload count failed", { code: countError.code });
    return mediaUploadInternalError();
  }

  const existingAssetCount = count ?? 0;
  const originalFilename =
    typeof file.name === "string" && file.name.length > 0
      ? file.name
      : "upload";

  const validated = await validateAndPrepareMediaUpload({
    userId: user.id,
    assetType: "avatar_reference",
    file,
    originalFilename,
    existingAssetCount,
  });

  if (!validated.ok) {
    return mapValidatorCode(validated.error.code);
  }

  const { prepared } = validated;
  const storage = getMediaStorage();

  try {
    await storage.put(prepared.storageKey, prepared.buffer, {
      contentType: prepared.detectedMime,
      sizeBytes: prepared.sizeBytes,
    });
  } catch (error) {
    console.error("[media] storage put failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return mediaUploadInternalError();
  }

  const { data, error: insertError } = await supabase
    .from(MEDIA_TABLE)
    .insert({
      client_id: user.id,
      asset_type: MEDIA_ASSET_TYPE_AVATAR_REFERENCE,
      storage_key: prepared.storageKey,
      metadata: prepared.metadata,
    })
    .select("id, asset_type, storage_key, metadata, created_at")
    .single();

  if (insertError || !data) {
    console.error("[media] insert failed", { code: insertError?.code });
    try {
      await storage.delete(prepared.storageKey);
    } catch {
      console.error("[media] compensating storage delete failed");
    }
    return mediaUploadInternalError();
  }

  const row = data as MediaAssetSelectRow;
  const item = mapMediaAssetRowToItem(row);
  if (!item) {
    console.error("[media] insert row mapping failed");
    try {
      await storage.delete(prepared.storageKey);
      await supabase
        .from(MEDIA_TABLE)
        .delete()
        .eq("id", row.id)
        .eq("client_id", user.id);
    } catch {
      console.error("[media] compensating cleanup failed");
    }
    return mediaUploadInternalError();
  }

  // Ensure DTO never leaks storage_key (mapper already omits it)
  revalidatePath("/settings/preferences");

  return { ok: true, asset: item };
}

/**
 * Upload one avatar reference file (photo or short clip).
 * FormData field name: "file" (single part).
 * No tenant id arguments — identity only via requireActive("handler").
 * Frontend consumer: Preferencias referencias Client section.
 * Never enqueues jobs / providers / Preferencias writes.
 */
export async function uploadAvatarReferenceAsset(
  formData: FormData,
): Promise<UploadAvatarReferenceAssetResult> {
  try {
    return await uploadAvatarReferenceAssetInner(formData);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[media] upload unexpected error");
    return mediaUploadInternalError();
  }
}
