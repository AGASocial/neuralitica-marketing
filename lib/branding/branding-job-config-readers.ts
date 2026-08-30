/**
 * Pure env readers for branding job configuration — safe to import in node:test.
 */
import type { AssemblyJobPollMode } from "@/lib/contracts/assembly-job";
import { readAssemblyJobPollMode } from "@/lib/assembly/assembly-job-config-readers";

import {
  BRANDING_JOB_POLL_INTERVAL_MS_DEFAULT,
  NEURAMARK_BRANDING_STALE_TIMEOUT_MIN_DEFAULT,
} from "./constants";

export type BrandingJobPollMode = AssemblyJobPollMode;

export function readBrandingJobPollMode(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string | undefined = env.NODE_ENV,
): BrandingJobPollMode {
  const raw = env.BRANDING_JOB_POLL_MODE?.trim().toLowerCase();
  if (raw === "in_process" || raw === "fly") {
    return raw;
  }
  return readAssemblyJobPollMode(env, nodeEnv);
}

export function readBrandingJobPollIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.BRANDING_JOB_POLL_INTERVAL_MS;
  if (!raw) {
    return BRANDING_JOB_POLL_INTERVAL_MS_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : BRANDING_JOB_POLL_INTERVAL_MS_DEFAULT;
}

export function readBrandingStaleTimeoutMin(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.NEURAMARK_BRANDING_STALE_TIMEOUT_MIN;
  if (!raw) {
    return NEURAMARK_BRANDING_STALE_TIMEOUT_MIN_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : NEURAMARK_BRANDING_STALE_TIMEOUT_MIN_DEFAULT;
}
