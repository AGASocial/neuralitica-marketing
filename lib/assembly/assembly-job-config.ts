import "server-only";

import {
  readAssemblyDurationToleranceSec,
  readAssemblyJobPollIntervalMs,
  readAssemblyJobPollMode,
  readAssemblyStaleTimeoutMin,
} from "./assembly-job-config-readers";

export function getAssemblyJobPollMode() {
  return readAssemblyJobPollMode();
}

export function getAssemblyJobPollIntervalMs() {
  return readAssemblyJobPollIntervalMs();
}

export function getAssemblyStaleTimeoutMin() {
  return readAssemblyStaleTimeoutMin();
}

export function getAssemblyDurationToleranceSec() {
  return readAssemblyDurationToleranceSec();
}
