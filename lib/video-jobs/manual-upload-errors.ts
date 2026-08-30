import type {
  UploadManualVideoJobErrorCode,
  UploadManualVideoJobResult,
} from "@/lib/contracts/manual-video-upload";
import { MANUAL_UPLOAD_ERROR_MESSAGE_KEYS } from "@/lib/contracts/manual-video-upload";

export function manualUploadError(
  code: UploadManualVideoJobErrorCode,
  options?: {
    messageKey?: string;
    fields?: Record<string, string[]>;
  },
): UploadManualVideoJobResult {
  return {
    ok: false,
    error: {
      code,
      messageKey: options?.messageKey ?? MANUAL_UPLOAD_ERROR_MESSAGE_KEYS[code],
      ...(options?.fields ? { fields: options.fields } : {}),
    },
  };
}
