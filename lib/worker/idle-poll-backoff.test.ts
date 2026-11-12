import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORKER_IDLE_BACKOFF_MULTIPLIER_DEFAULT,
  WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT,
  WORKER_STALE_SWEEP_INTERVAL_MS_DEFAULT,
  createIdlePollBackoff,
  createStaleSweepGate,
  readWorkerIdleBackoffMultiplier,
  readWorkerIdleMaxIntervalMs,
  readWorkerStaleSweepIntervalMs,
} from "./idle-poll-backoff";

describe("createIdlePollBackoff", () => {
  it("returns base after first empty, then doubles until max", () => {
    const backoff = createIdlePollBackoff({
      baseIntervalMs: 3_000,
      maxIntervalMs: 600_000,
      multiplier: 2,
    });

    assert.equal(backoff.afterPoll(false), 3_000);
    assert.equal(backoff.consecutiveEmpty, 1);
    assert.equal(backoff.afterPoll(false), 6_000);
    assert.equal(backoff.afterPoll(false), 12_000);
    assert.equal(backoff.afterPoll(false), 24_000);
    assert.equal(backoff.afterPoll(false), 48_000);
    assert.equal(backoff.afterPoll(false), 96_000);
    assert.equal(backoff.afterPoll(false), 192_000);
    assert.equal(backoff.afterPoll(false), 384_000);
    assert.equal(backoff.afterPoll(false), 600_000);
    assert.equal(backoff.afterPoll(false), 600_000);
  });

  it("resets to base immediately when work is found", () => {
    const backoff = createIdlePollBackoff({
      baseIntervalMs: 5_000,
      maxIntervalMs: 600_000,
      multiplier: 2,
    });

    backoff.afterPoll(false);
    backoff.afterPoll(false);
    backoff.afterPoll(false);
    assert.equal(backoff.consecutiveEmpty, 3);
    assert.equal(backoff.afterPoll(true), 5_000);
    assert.equal(backoff.consecutiveEmpty, 0);
    assert.equal(backoff.peekIntervalMs(), 5_000);
  });

  it("documents max idle detection latency as maxIntervalMs", () => {
    const maxIntervalMs = WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT;
    const backoff = createIdlePollBackoff({
      baseIntervalMs: 5_000,
      maxIntervalMs,
      multiplier: 2,
    });
    for (let i = 0; i < 20; i += 1) {
      backoff.afterPoll(false);
    }
    assert.equal(backoff.peekIntervalMs(), maxIntervalMs);
  });
});

describe("createStaleSweepGate", () => {
  it("sweeps on first tick then respects interval", () => {
    const gate = createStaleSweepGate(300_000);
    assert.equal(gate.shouldSweep(1_000), true);
    gate.markSwept(1_000);
    assert.equal(gate.shouldSweep(100_000), false);
    assert.equal(gate.shouldSweep(301_000), true);
    gate.markSwept(301_000);
    assert.equal(gate.shouldSweep(500_000), false);
  });
});

describe("idle poll env readers", () => {
  it("uses shared defaults", () => {
    assert.equal(
      readWorkerIdleMaxIntervalMs({ NODE_ENV: "test" }),
      WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT,
    );
    assert.equal(
      readWorkerIdleBackoffMultiplier({ NODE_ENV: "test" }),
      WORKER_IDLE_BACKOFF_MULTIPLIER_DEFAULT,
    );
    assert.equal(
      readWorkerStaleSweepIntervalMs({ NODE_ENV: "test" }),
      WORKER_STALE_SWEEP_INTERVAL_MS_DEFAULT,
    );
  });

  it("prefers domain override over shared key", () => {
    const env = {
      NODE_ENV: "test",
      WORKER_IDLE_MAX_INTERVAL_MS: "90000",
      VIDEO_JOB_IDLE_MAX_INTERVAL_MS: "45000",
      WORKER_STALE_SWEEP_INTERVAL_MS: "600000",
      ASSEMBLY_JOB_STALE_SWEEP_INTERVAL_MS: "120000",
    } as NodeJS.ProcessEnv;
    assert.equal(
      readWorkerIdleMaxIntervalMs(env, "VIDEO_JOB_IDLE_MAX_INTERVAL_MS"),
      45_000,
    );
    assert.equal(
      readWorkerStaleSweepIntervalMs(env, "ASSEMBLY_JOB_STALE_SWEEP_INTERVAL_MS"),
      120_000,
    );
    assert.equal(readWorkerIdleMaxIntervalMs(env), 90_000);
  });

  it("falls back to shared when domain key absent", () => {
    const env = {
      NODE_ENV: "test",
      WORKER_IDLE_MAX_INTERVAL_MS: "55000",
    } as NodeJS.ProcessEnv;
    assert.equal(
      readWorkerIdleMaxIntervalMs(env, "BRANDING_JOB_IDLE_MAX_INTERVAL_MS"),
      55_000,
    );
  });
});
