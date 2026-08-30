/**
 * Pure env readers for assembly job configuration — safe to import in node:test.
 */
import {
  ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT,
  NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT,
  NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN_DEFAULT,
} from "@/lib/contracts/assembly-job";
import type { AssemblyJobPollMode } from "@/lib/contracts/assembly-job";

export function readAssemblyJobPollMode(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string | undefined = env.NODE_ENV,
): AssemblyJobPollMode {
  const raw = env.ASSEMBLY_JOB_POLL_MODE?.trim().toLowerCase();
  if (raw === "in_process" || raw === "fly") {
    return raw;
  }
  return nodeEnv === "production" ? "fly" : "in_process";
}

export function readAssemblyJobPollIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.ASSEMBLY_JOB_POLL_INTERVAL_MS;
  if (!raw) {
    return ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT;
}

export function readAssemblyStaleTimeoutMin(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN;
  if (!raw) {
    return NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN_DEFAULT;
}

export function readAssemblyDurationToleranceSec(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC;
  if (!raw) {
    return NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT;
}
