import "server-only";

import {
  readAssemblyDurationToleranceSec,
  readAssemblyJobIdleBackoffMultiplier,
  readAssemblyJobIdleMaxIntervalMs,
  readAssemblyJobPollIntervalMs,
  readAssemblyJobPollMode,
  readAssemblyJobStaleSweepIntervalMs,
  readAssemblyStaleTimeoutMin,
} from "./assembly-job-config-readers";

export function getAssemblyJobPollMode() {
  return readAssemblyJobPollMode();
}

export function getAssemblyJobPollIntervalMs() {
  return readAssemblyJobPollIntervalMs();
}

export function getAssemblyJobIdleMaxIntervalMs() {
  return readAssemblyJobIdleMaxIntervalMs();
}

export function getAssemblyJobIdleBackoffMultiplier() {
  return readAssemblyJobIdleBackoffMultiplier();
}

export function getAssemblyJobStaleSweepIntervalMs() {
  return readAssemblyJobStaleSweepIntervalMs();
}

export function getAssemblyStaleTimeoutMin() {
  return readAssemblyStaleTimeoutMin();
}

export function getAssemblyDurationToleranceSec() {
  return readAssemblyDurationToleranceSec();
}
