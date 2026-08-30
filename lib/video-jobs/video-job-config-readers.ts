/**
 * Pure env readers for video job configuration — safe to import in node:test.
 */
import {
  VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT,
  VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT,
  VIDEO_MAX_RETRIES_PER_REEL_DEFAULT,
} from "@/lib/contracts/video-job";
import type { VideoJobPollMode } from "@/lib/contracts/video-job";

export function readVideoJobPollMode(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string | undefined = env.NODE_ENV,
): VideoJobPollMode {
  const raw = env.VIDEO_JOB_POLL_MODE?.trim().toLowerCase();
  if (raw === "in_process" || raw === "fly") {
    return raw;
  }
  return nodeEnv === "production" ? "fly" : "in_process";
}

export function readVideoJobPollIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VIDEO_JOB_POLL_INTERVAL_MS;
  if (!raw) {
    return VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : VIDEO_JOB_POLL_INTERVAL_MS_DEFAULT;
}

export function readVideoJobStaleTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VIDEO_JOB_STALE_TIMEOUT_MS;
  if (!raw) {
    return VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT;
}

export function readVideoMaxRetriesPerReel(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.VIDEO_MAX_RETRIES_PER_REEL;
  if (!raw) {
    return VIDEO_MAX_RETRIES_PER_REEL_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1
    ? parsed
    : VIDEO_MAX_RETRIES_PER_REEL_DEFAULT;
}
