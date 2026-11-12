import "server-only";

import {
  readBrandingJobIdleBackoffMultiplier,
  readBrandingJobIdleMaxIntervalMs,
  readBrandingJobPollIntervalMs,
  readBrandingJobPollMode,
  readBrandingJobStaleSweepIntervalMs,
  readBrandingStaleTimeoutMin,
} from "./branding-job-config-readers";

export function getBrandingJobPollMode() {
  return readBrandingJobPollMode();
}

export function getBrandingJobPollIntervalMs() {
  return readBrandingJobPollIntervalMs();
}

export function getBrandingJobIdleMaxIntervalMs() {
  return readBrandingJobIdleMaxIntervalMs();
}

export function getBrandingJobIdleBackoffMultiplier() {
  return readBrandingJobIdleBackoffMultiplier();
}

export function getBrandingJobStaleSweepIntervalMs() {
  return readBrandingJobStaleSweepIntervalMs();
}

export function getBrandingStaleTimeoutMin() {
  return readBrandingStaleTimeoutMin();
}
