import { FORBIDDEN_BUDGET_SPEND_KEYS } from "@/lib/contracts/cost-policy";
import { FORBIDDEN_MANUAL_UPLOAD_AUTHORITY_KEYS } from "@/lib/contracts/manual-video-upload";
import { FORBIDDEN_PROVIDER_AUTHORITY_KEYS } from "@/lib/contracts/provider-decisions";
import { FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS } from "@/lib/contracts/video-job";

const FORBIDDEN_MANUAL_UPLOAD_KEYS = new Set<string>([
  ...FORBIDDEN_MANUAL_UPLOAD_AUTHORITY_KEYS,
  ...FORBIDDEN_PROVIDER_AUTHORITY_KEYS,
  ...FORBIDDEN_BUDGET_SPEND_KEYS,
  ...FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS,
]);

export function findForbiddenManualUploadFormKeys(formData: FormData): string[] {
  const found: string[] = [];
  for (const key of formData.keys()) {
    if (FORBIDDEN_MANUAL_UPLOAD_KEYS.has(key)) {
      found.push(key);
    }
  }
  return found;
}
