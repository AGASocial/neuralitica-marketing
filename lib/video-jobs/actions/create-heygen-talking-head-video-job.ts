"use server";

import type {
  CreateHeygenTalkingHeadVideoJobResult,
  PreviewHeygenTalkingHeadEstimateSuccess,
  VideoJobMutationError,
} from "@/lib/contracts/video-job";
import {
  createHeygenTalkingHeadVideoJob as createHeygenTalkingHeadVideoJobCore,
  previewHeygenTalkingHeadEstimate as previewHeygenTalkingHeadEstimateCore,
} from "@/lib/video-jobs/create-heygen-talking-head-video-job";

export async function previewHeygenTalkingHeadEstimate(
  rawInput: unknown,
): Promise<
  PreviewHeygenTalkingHeadEstimateSuccess | VideoJobMutationError
> {
  return previewHeygenTalkingHeadEstimateCore(rawInput);
}

export async function createHeygenTalkingHeadVideoJob(
  rawInput: unknown,
): Promise<CreateHeygenTalkingHeadVideoJobResult> {
  return createHeygenTalkingHeadVideoJobCore(rawInput);
}
