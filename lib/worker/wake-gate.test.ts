import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIdlePollBackoff } from "./idle-poll-backoff";
import { createWorkerWakeGate } from "./wake-gate";

describe("createWorkerWakeGate", () => {
  it("interrupts sleep on wake and runs listeners", async () => {
    const gate = createWorkerWakeGate();
    let wakes = 0;
    gate.onWake(() => {
      wakes += 1;
    });

    const started = Date.now();
    const sleeping = gate.sleep(60_000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    gate.wake();
    await sleeping;
    const elapsed = Date.now() - started;

    assert.equal(wakes, 1);
    assert.ok(elapsed < 5_000, `expected early wake, elapsed=${elapsed}`);
  });

  it("coalesces repeated wakes without throwing", async () => {
    const gate = createWorkerWakeGate();
    let wakes = 0;
    gate.onWake(() => {
      wakes += 1;
    });

    gate.wake();
    gate.wake();
    assert.equal(wakes, 2);

    const sleeping = gate.sleep(30_000);
    gate.wake();
    gate.wake();
    await sleeping;
    assert.equal(wakes, 4);
  });

  it("resolves zero-duration sleep immediately", async () => {
    const gate = createWorkerWakeGate();
    await gate.sleep(0);
  });

  it("wake during poll forces next sleep to zero after backoff reset", async () => {
    const gate = createWorkerWakeGate();
    const backoff = createIdlePollBackoff({
      baseIntervalMs: 5_000,
      maxIntervalMs: 600_000,
      multiplier: 2,
    });
    gate.onWake(() => {
      backoff.reset();
    });

    for (let i = 0; i < 8; i += 1) {
      backoff.afterPoll(false);
    }
    assert.ok(backoff.peekIntervalMs() > 5_000);

    // Simulate mid-poll wake (not sleeping).
    gate.wake();
    assert.equal(backoff.consecutiveEmpty, 0);

    const emptyPollDelay = backoff.afterPoll(false);
    assert.equal(emptyPollDelay, 5_000);

    const started = Date.now();
    await gate.sleep(emptyPollDelay);
    const elapsed = Date.now() - started;
    assert.ok(
      elapsed < 200,
      `expected immediate next sleep after mid-poll wake, elapsed=${elapsed}`,
    );
  });
});
