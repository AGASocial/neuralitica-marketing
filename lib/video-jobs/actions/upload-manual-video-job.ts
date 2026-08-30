"use server";

import { revalidatePath } from "next/cache";

import {
  uploadManualVideoJobRequestSchema,
  type UploadManualVideoJobResult,
} from "@/lib/contracts/manual-video-upload";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";

import { findForbiddenManualUploadFormKeys } from "../find-forbidden-manual-upload-keys";
import { manualUploadError } from "../manual-upload-errors";
import { uploadManualVideoJob as uploadManualVideoJobOrchestrator } from "../upload-manual-video-job";

/**
 * Operator manual video upload (US-8.3).
 * FE consumer: `ManualVideoUploadDialog` on `/operator/scripts`.
 */
export async function uploadManualVideoJob(
  formData: FormData,
): Promise<UploadManualVideoJobResult> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return manualUploadError(
          error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        );
      }
      throw error;
    }

    if (findForbiddenManualUploadFormKeys(formData).length > 0) {
      return manualUploadError("FORBIDDEN_FIELDS");
    }

    const fields: Record<string, string> = {};
    for (const key of ["reelScriptId", "clientId", "parentJobId"] as const) {
      const value = formData.get(key);
      if (typeof value === "string" && value.length > 0) {
        fields[key] = value;
      }
    }

    const parsed = uploadManualVideoJobRequestSchema.safeParse(fields);
    if (!parsed.success) {
      return manualUploadError("VALIDATION_ERROR");
    }

    const fileEntry = formData.get("file");
    if (!fileEntry || typeof fileEntry === "string") {
      return manualUploadError("MISSING_FILE");
    }

    const file = fileEntry as File;
    if (typeof file.arrayBuffer !== "function") {
      return manualUploadError("MISSING_FILE");
    }

    const originalFilename =
      typeof file.name === "string" && file.name.length > 0
        ? file.name
        : "upload.mp4";

    const result = await uploadManualVideoJobOrchestrator({
      reelScriptId: parsed.data.reelScriptId,
      clientId: parsed.data.clientId,
      operatorClientId: operator.id,
      file,
      originalFilename,
      parentJobId: parsed.data.parentJobId,
    });

    if (result.ok) {
      revalidatePath("/operator/scripts");
    }

    return result;
  } catch (error) {
    if (isAuthGuardError(error)) {
      return manualUploadError(
        error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      );
    }
    console.error("[video-jobs] manual upload action unexpected error", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return manualUploadError("INTERNAL_ERROR");
  }
}
