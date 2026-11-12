import "server-only";

import type { VideoJobPollMode } from "@/lib/contracts/video-job";

import {
  readVideoJobIdleBackoffMultiplier,
  readVideoJobIdleMaxIntervalMs,
  readVideoJobPollIntervalMs,
  readVideoJobPollMode,
  readVideoJobStaleSweepIntervalMs,
  readVideoJobStaleTimeoutMs,
  readVideoMaxRetriesPerReel,
} from "./video-job-config-readers";

export function getVideoJobPollMode(): VideoJobPollMode {
  return readVideoJobPollMode();
}

export function getVideoJobPollIntervalMs(): number {
  return readVideoJobPollIntervalMs();
}

export function getVideoJobIdleMaxIntervalMs(): number {
  return readVideoJobIdleMaxIntervalMs();
}

export function getVideoJobIdleBackoffMultiplier(): number {
  return readVideoJobIdleBackoffMultiplier();
}

export function getVideoJobStaleSweepIntervalMs(): number {
  return readVideoJobStaleSweepIntervalMs();
}

export function getVideoJobStaleTimeoutMs(): number {
  return readVideoJobStaleTimeoutMs();
}

export function getVideoMaxRetriesPerReel(): number {
  return readVideoMaxRetriesPerReel();
}
