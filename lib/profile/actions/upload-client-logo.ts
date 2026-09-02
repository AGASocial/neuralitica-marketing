"use server";

import { revalidatePath } from "next/cache";

import type { UploadClientLogoResult } from "@/lib/contracts/branding-job";
import { MEDIA_ASSET_TYPE_CLIENT_LOGO } from "@/lib/contracts/media-assets";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  mediaUploadFileTooLargeError,
  mediaUploadForbiddenError,
  mediaUploadForbiddenFieldsError,
  mediaUploadInternalError,
  mediaUploadInvalidFileTypeError,
  mediaUploadMissingFileError,
  mediaUploadUnauthenticatedError,
  mediaUploadValidationError,
} from "@/lib/media/media-errors";
import { findForbiddenUploadFormKeys } from "@/lib/media/media-helpers";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import { validateAndPrepareMediaUpload } from "@/lib/media/upload-validation";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MEDIA_TABLE = "neuramark_media_assets";
const PROFILE_TABLE = "neuramark_business_profiles";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UploadClientLogoResult {
  if (error.status === 401) {
    return mediaUploadUnauthenticatedError();
  }
  return mediaUploadForbiddenError();
}

async function deletePriorLogo(params: {
  clientId: string;
  logoAssetId: string;
}): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from(MEDIA_TABLE)
    .select("storage_key")
    .eq("id", params.logoAssetId)
    .eq("client_id", params.clientId)
    .eq("asset_type", MEDIA_ASSET_TYPE_CLIENT_LOGO)
    .maybeSingle();

  if (data && typeof (data as { storage_key?: unknown }).storage_key === "string") {
    const storageKey = (data as { storage_key: string }).storage_key;
    try {
      await getMediaStorage().delete(storageKey);
    } catch {
      console.error("[profile] prior logo storage delete failed");
    }
  }

  await supabase
    .from(MEDIA_TABLE)
    .delete()
    .eq("id", params.logoAssetId)
    .eq("client_id", params.clientId);
}

/**
 * Upload client logo for Ficha viva Brand section (US-9.2).
 */
export async function uploadClientLogo(
  formData: FormData,
): Promise<UploadClientLogoResult> {
  try {
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

    const file = fileEntry as File;
    if (typeof file.arrayBuffer !== "function") {
      return mediaUploadMissingFileError();
    }

    if (!isSupabaseConfigured()) {
      return mediaUploadInternalError();
    }

    const supabase = createServerSupabaseClient();
    const { data: profile } = await supabase
      .from(PROFILE_TABLE)
      .select("logo_asset_id")
      .eq("client_id", user.id)
      .maybeSingle();

    const priorLogoId =
      profile &&
      typeof (profile as { logo_asset_id?: unknown }).logo_asset_id ===
        "string"
        ? (profile as { logo_asset_id: string }).logo_asset_id
        : null;

    const validated = await validateAndPrepareMediaUpload({
      userId: user.id,
      assetType: "client_logo",
      file,
      originalFilename:
        typeof file.name === "string" && file.name.length > 0
          ? file.name
          : "logo",
      existingAssetCount: 0,
    });

    if (!validated.ok) {
      switch (validated.error.code) {
        case "FILE_TOO_LARGE":
          return mediaUploadFileTooLargeError();
        case "INVALID_FILE_TYPE":
          return mediaUploadInvalidFileTypeError();
        case "VALIDATION_ERROR":
          return mediaUploadValidationError({
            file: ["invalid"],
          });
        default:
          return mediaUploadInternalError();
      }
    }

    const { prepared } = validated;
    const storage = getMediaStorage();

    try {
      await storage.put(prepared.storageKey, prepared.buffer, {
        contentType: prepared.detectedMime,
        sizeBytes: prepared.sizeBytes,
      });
    } catch (error) {
      console.error("[profile] logo storage put failed", {
        name: error instanceof Error ? error.name : undefined,
      });
      return mediaUploadInternalError();
    }

    if (priorLogoId) {
      await deletePriorLogo({ clientId: user.id, logoAssetId: priorLogoId });
    }

    const { data: inserted, error: insertError } = await supabase
      .from(MEDIA_TABLE)
      .insert({
        client_id: user.id,
        asset_type: MEDIA_ASSET_TYPE_CLIENT_LOGO,
        storage_key: prepared.storageKey,
        metadata: prepared.metadata,
      })
      .select("id")
      .single();

    if (insertError || !inserted || typeof (inserted as { id?: unknown }).id !== "string") {
      console.error("[profile] logo asset insert failed", {
        ...(insertError?.code ? { code: insertError.code } : {}),
      });
      try {
        await storage.delete(prepared.storageKey);
      } catch {
        console.error("[profile] compensating logo delete failed");
      }
      return mediaUploadInternalError();
    }

    const logoAssetId = (inserted as { id: string }).id;
    const { error: updateError } = await supabase
      .from(PROFILE_TABLE)
      .update({ logo_asset_id: logoAssetId })
      .eq("client_id", user.id);

    if (updateError) {
      await supabase.from(MEDIA_TABLE).delete().eq("id", logoAssetId);
      await storage.delete(prepared.storageKey);
      return mediaUploadInternalError();
    }

    revalidatePath("/profile");

    return {
      ok: true,
      logoAssetId,
      logoPreviewUrl: `/api/media/assets/${logoAssetId}`,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[profile] upload logo unexpected error");
    return mediaUploadInternalError();
  }
}
