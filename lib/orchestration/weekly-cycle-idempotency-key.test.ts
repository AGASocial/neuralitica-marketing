import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

function withServerOnlyStub<T>(run: () => T): T {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  try { return run(); } finally { loader._load = original; }
}

describe("buildWeeklyCycleIdempotencyKey — stable per-attempt key format", () => {
  it("matches the frozen wc:{runId}:{slot|global}:{step}:{attempt} shape for a slot step", () => withServerOnlyStub(() => {
    const { buildWeeklyCycleIdempotencyKey } = require("./weekly-cycle-idempotency-key.ts");
    const key = buildWeeklyCycleIdempotencyKey({ runId: "11111111-1111-4111-8111-111111111111", slotIndex: 0, step: "assembly", attempt: 2 });
    assert.equal(key, "wc:11111111-1111-4111-8111-111111111111:0:assembly:2");
    assert.match(key, /^wc:[0-9a-f-]+:(global|[0-2]):[a-z_]+:[1-3]$/);
  }));

  it("uses the literal 'global' slot segment for null slotIndex (strategy/scripts/captions)", () => withServerOnlyStub(() => {
    const { buildWeeklyCycleIdempotencyKey } = require("./weekly-cycle-idempotency-key.ts");
    const key = buildWeeklyCycleIdempotencyKey({ runId: "11111111-1111-4111-8111-111111111111", slotIndex: null, step: "strategy", attempt: 1 });
    assert.equal(key, "wc:11111111-1111-4111-8111-111111111111:global:strategy:1");
  }));

  it("is deterministic and stable: identical inputs always produce the identical key", () => withServerOnlyStub(() => {
    const { buildWeeklyCycleIdempotencyKey } = require("./weekly-cycle-idempotency-key.ts");
    const params = { runId: "22222222-2222-4222-8222-222222222222", slotIndex: 1, step: "broll" as const, attempt: 3 };
    assert.equal(buildWeeklyCycleIdempotencyKey(params), buildWeeklyCycleIdempotencyKey(params));
  }));

  it("differs across slots, steps, and attempts (no accidental collisions)", () => withServerOnlyStub(() => {
    const { buildWeeklyCycleIdempotencyKey } = require("./weekly-cycle-idempotency-key.ts");
    const base = { runId: "33333333-3333-4333-8333-333333333333", slotIndex: 0, step: "assembly" as const, attempt: 1 };
    const bySlot = buildWeeklyCycleIdempotencyKey({ ...base, slotIndex: 1 });
    const byStep = buildWeeklyCycleIdempotencyKey({ ...base, step: "branding" as const });
    const byAttempt = buildWeeklyCycleIdempotencyKey({ ...base, attempt: 2 });
    const original = buildWeeklyCycleIdempotencyKey(base);
    assert.notEqual(bySlot, original);
    assert.notEqual(byStep, original);
    assert.notEqual(byAttempt, original);
  }));
});
