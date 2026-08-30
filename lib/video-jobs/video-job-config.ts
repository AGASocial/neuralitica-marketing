import "server-only";

import {
  VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT,
  VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT,
  VIDEO_MAX_RETRIES_PER_REEL_DEFAULT,
} from "@/lib/contracts/video-job";
import type { VideoJobPollMode } from "@/lib/contracts/video-job";

export function getVideoJobPollMode(): VideoJobPollMode {
  const raw = process.env.VIDEO_JOB_POLL_MODE?.trim().toLowerCase();
  if (raw === "in_process" || raw === "fly") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "fly" : "in_process";
}

export function getVideoJobPollIntervalMs(): number {
  const raw = process.env.VIDEO_JOB_POLL_INTERVAL_MS;
  if (!raw) {
    return VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT;
}

export function getVideoJobStaleTimeoutMs(): number {
  const raw = process.env.VIDEO_JOB_STALE_TIMEOUT_MS;
  if (!raw) {
    return VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT;
}

export function getVideoMaxRetriesPerReel(): number {
  const raw = process.env.VIDEO_MAX_RETRIES_PER_REEL;
  if (!raw) {
    return VIDEO_MAX_RETRIES_PER_REEL_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1
    ? parsed
    : VIDEO_MAX_RETRIES_PER_REEL_DEFAULT;
}
