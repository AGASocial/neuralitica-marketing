"use server";

import type {
  PreviewBrollVideoJobsEstimateSuccess,
  VideoJobMutationError,
} from "@/lib/contracts/video-job";
import { previewBrollVideoJobsEstimate as previewBrollVideoJobsEstimateCore } from "@/lib/video-jobs/preview-broll-video-jobs-estimate";

export async function previewBrollVideoJobsEstimate(
  rawInput: unknown,
): Promise<PreviewBrollVideoJobsEstimateSuccess | VideoJobMutationError> {
  return previewBrollVideoJobsEstimateCore(rawInput);
}
