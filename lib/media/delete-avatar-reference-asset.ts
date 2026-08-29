"use server";

import { revalidatePath } from "next/cache";

import type {
  DeleteAvatarReferenceAssetInput,
  DeleteAvatarReferenceAssetResult,
} from "@/lib/contracts/media-assets";
import {
  deleteAvatarReferenceAssetInputSchema,
  MEDIA_ASSET_TYPE_AVATAR_REFERENCE,
} from "@/lib/contracts/media-assets";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  mediaDeleteForbiddenError,
  mediaDeleteForbiddenFieldsError,
  mediaDeleteInternalError,
  mediaDeleteNotFoundError,
  mediaDeleteReferencedByJobError,
  mediaDeleteUnauthenticatedError,
  mediaDeleteValidationError,
} from "@/lib/media/media-errors";
import { findForbiddenDeleteKeys } from "@/lib/media/media-helpers";
import { isAvatarReferenceAssetReferencedByJob } from "@/lib/media/is-asset-referenced-by-job";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): DeleteAvatarReferenceAssetResult {
  if (error.status === 401) {
    return mediaDeleteUnauthenticatedError();
  }
  return mediaDeleteForbiddenError();
}

async function deleteAvatarReferenceAssetInner(
  rawInput: unknown,
): Promise<DeleteAvatarReferenceAssetResult> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenDeleteKeys(rawInput).length > 0) {
    return mediaDeleteForbiddenFieldsError();
  }

  const parsed = deleteAvatarReferenceAssetInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] = fields[key] ?? [];
      fields[key].push(issue.message);
    }
    return mediaDeleteValidationError(fields);
  }

  const { assetId } = parsed.data;

  if (!isSupabaseConfigured()) {
    console.error("[media] delete unavailable: Supabase not configured");
    return mediaDeleteInternalError();
  }

  const supabase = createServerSupabaseClient();
  const { data: row, error: findError } = await supabase
    .from(MEDIA_TABLE)
    .select("id, storage_key")
    .eq("id", assetId)
    .eq("client_id", user.id)
    .eq("asset_type", MEDIA_ASSET_TYPE_AVATAR_REFERENCE)
    .maybeSingle();

  if (findError) {
    console.error("[media] delete find failed", { code: findError.code });
    return mediaDeleteInternalError();
  }

  if (
    !row ||
    typeof (row as { id?: unknown }).id !== "string" ||
    typeof (row as { storage_key?: unknown }).storage_key !== "string"
  ) {
    return mediaDeleteNotFoundError();
  }

  const storageKey = (row as { storage_key: string }).storage_key;

  if (await isAvatarReferenceAssetReferencedByJob(assetId)) {
    return mediaDeleteReferencedByJobError();
  }

  const storage = getMediaStorage();
  try {
    await storage.delete(storageKey);
  } catch (error) {
    console.error("[media] storage delete failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return mediaDeleteInternalError();
  }

  const { error: deleteError } = await supabase
    .from(MEDIA_TABLE)
    .delete()
    .eq("id", assetId)
    .eq("client_id", user.id)
    .eq("asset_type", MEDIA_ASSET_TYPE_AVATAR_REFERENCE);

  if (deleteError) {
    console.error("[media] db delete failed after storage delete", {
      code: deleteError.code,
    });
    // Compensating put is not available (bytes already gone). Fail closed.
    return mediaDeleteInternalError();
  }

  revalidatePath("/settings/preferences");

  return { ok: true, deletedAssetId: assetId };
}

/**
 * Hard-delete one own avatar reference asset (storage + DB row).
 * Consent not required for delete of own retained assets.
 * Frontend consumer: Preferencias referencias list — delete + confirm.
 */
export async function deleteAvatarReferenceAsset(
  input: DeleteAvatarReferenceAssetInput,
): Promise<DeleteAvatarReferenceAssetResult> {
  try {
    return await deleteAvatarReferenceAssetInner(input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[media] delete unexpected error");
    return mediaDeleteInternalError();
  }
}
