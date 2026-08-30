"use server";

import type { UploadManualVideoJobResult } from "@/lib/contracts/manual-video-upload";
import { MANUAL_UPLOAD_ERROR_MESSAGE_KEYS } from "@/lib/contracts/manual-video-upload";

/**
 * Operator manual video upload (US-8.3).
 * FE consumer: `ManualVideoUploadDialog` on `/operator/scripts`.
 * BUILD: replace stub with full gate order + orchestrator (CONTRACT § Server Action).
 */
export async function uploadManualVideoJob(
  _formData: FormData,
): Promise<UploadManualVideoJobResult> {
  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      messageKey: MANUAL_UPLOAD_ERROR_MESSAGE_KEYS.INTERNAL_ERROR,
    },
  };
}
