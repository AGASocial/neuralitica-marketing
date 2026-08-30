import "server-only";

import type { VideoJobPollMode } from "@/lib/contracts/video-job";

import {
  readVideoJobPollIntervalMs,
  readVideoJobPollMode,
  readVideoJobStaleTimeoutMs,
  readVideoMaxRetriesPerReel,
} from "./video-job-config-readers";

export function getVideoJobPollMode(): VideoJobPollMode {
  return readVideoJobPollMode();
}

export function getVideoJobPollIntervalMs(): number {
  return readVideoJobPollIntervalMs();
}

export function getVideoJobStaleTimeoutMs(): number {
  return readVideoJobStaleTimeoutMs();
}

export function getVideoMaxRetriesPerReel(): number {
  return readVideoMaxRetriesPerReel();
}
