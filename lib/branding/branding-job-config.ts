import "server-only";

import {
  readBrandingJobPollIntervalMs,
  readBrandingJobPollMode,
  readBrandingStaleTimeoutMin,
} from "./branding-job-config-readers";

export function getBrandingJobPollMode() {
  return readBrandingJobPollMode();
}

export function getBrandingJobPollIntervalMs() {
  return readBrandingJobPollIntervalMs();
}

export function getBrandingStaleTimeoutMin() {
  return readBrandingStaleTimeoutMin();
}
