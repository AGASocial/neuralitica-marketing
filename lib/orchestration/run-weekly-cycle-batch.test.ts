import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

const dryRunSummary = {
  weekStart: "2026-08-31", dryRun: true as const, eligibleCount: 2, skippedCount: 0,
  processedCount: 2, failedCount: 0, clients: [] as never[],
};

describe("runWeeklyCycleCronBatch — Blocker 1 cron live wiring", () => {
  it("delegates unchanged to the Phase A dry-run batch when the live switch is disabled", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleCronBatch } = await import("./run-weekly-cycle-batch");
    let dryRunBatchCalls = 0;
    let liveBatchCalls = 0;
    let dryRunForClientCalls = 0;
    let listEligibleCalls = 0;
    const result = await runWeeklyCycleCronBatch(
      { weekStart: "2026-08-31" },
      {
        isLiveEnabled: () => false,
        listEligible: async () => { listEligibleCalls += 1; return { eligible: [], skipped: [] }; },
        selectLiveClientIds: () => { throw new Error("must not select"); },
        runDryRunBatch: async (params) => { dryRunBatchCalls += 1; assert.deepEqual(params, { weekStart: "2026-08-31", mode: "cron", dryRun: true }); return dryRunSummary; },
        runDryRunForClient: async () => { dryRunForClientCalls += 1; throw new Error("must not run per-client"); },
        runLiveBatch: async () => { liveBatchCalls += 1; throw new Error("must not run live batch"); },
      },
    );
    assert.equal(dryRunBatchCalls, 1);
    assert.equal(liveBatchCalls, 0);
    assert.equal(dryRunForClientCalls, 0);
    assert.equal(listEligibleCalls, 0);
    assert.deepEqual(result, dryRunSummary);
  }));

  it("falls back to the Phase A dry-run batch when live is enabled but the allowlist selects no eligible client", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleCronBatch } = await import("./run-weekly-cycle-batch");
    let dryRunBatchCalls = 0;
    let liveBatchCalls = 0;
    const result = await runWeeklyCycleCronBatch(
      { weekStart: "2026-08-31" },
      {
        isLiveEnabled: () => true,
        listEligible: async () => ({ eligible: [{ clientId: "not-allowlisted" }], skipped: [] }),
        selectLiveClientIds: () => [],
        runDryRunBatch: async () => { dryRunBatchCalls += 1; return dryRunSummary; },
        runDryRunForClient: async () => { throw new Error("must not run per-client"); },
        runLiveBatch: async () => { liveBatchCalls += 1; throw new Error("must not run live batch"); },
      },
    );
    assert.equal(dryRunBatchCalls, 1);
    assert.equal(liveBatchCalls, 0);
    assert.deepEqual(result, dryRunSummary);
  }));

  it("fails closed to the dry-run batch when the allowlist has an invalid entry (selector returns empty)", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleCronBatch } = await import("./run-weekly-cycle-batch");
    let dryRunBatchCalls = 0;
    const result = await runWeeklyCycleCronBatch(
      { weekStart: "2026-08-31" },
      {
        isLiveEnabled: () => true,
        listEligible: async () => ({ eligible: [{ clientId: "a" }, { clientId: "b" }], skipped: [] }),
        // Simulates `selectWeeklyCycleLiveClientIds` under an invalid
        // WEEKLY_CYCLE_LIVE_CLIENT_IDS entry: the allowlist parses to an
        // empty set, so nothing is ever selected — CONTRACT's "fail closed".
        selectLiveClientIds: () => [],
        runDryRunBatch: async () => { dryRunBatchCalls += 1; return dryRunSummary; },
        runDryRunForClient: async () => { throw new Error("must not run per-client"); },
        runLiveBatch: async () => { throw new Error("must not run live batch"); },
      },
    );
    assert.equal(dryRunBatchCalls, 1);
    assert.equal(result.dryRun, true);
  }));

  it("routes allowlisted clients to the live batch and leaves the rest on the Phase A dry-run plan, in deterministic order", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleCronBatch } = await import("./run-weekly-cycle-batch");
    const dryRunVisited: string[] = [];
    const liveBatchArgs: { clientIdsInOrder: readonly string[]; weekStart: string }[] = [];
    let dryRunBatchCalls = 0;

    const result = await runWeeklyCycleCronBatch(
      { weekStart: "2026-08-31" },
      {
        isLiveEnabled: () => true,
        listEligible: async () => ({
          eligible: [{ clientId: "client-a" }, { clientId: "client-b" }, { clientId: "client-c" }],
          skipped: [{ clientId: "client-d", skipReason: "INACTIVE" as const }],
        }),
        selectLiveClientIds: (ids) => ids.filter((id) => id === "client-b"),
        runDryRunBatch: async () => { dryRunBatchCalls += 1; return dryRunSummary; },
        runDryRunForClient: async (params) => {
          dryRunVisited.push(params.clientId);
          return {
            ok: true, runId: `run-${params.clientId}`, weekStart: params.weekStart, clientId: params.clientId,
            status: "dry_run" as const, acquireOutcome: "CREATED" as const,
            plan: { dryRun: true as const, invokedBy: "system" as const, clientId: params.clientId, weekStart: params.weekStart, steps: [] },
          };
        },
        runLiveBatch: async (params) => {
          liveBatchArgs.push(params);
          return {
            processedCount: 1, failedCount: 0,
            clients: [{ clientId: "client-b", status: "dispatched" as const, runId: "run-client-b" }],
          };
        },
      },
    );

    // Live path only ever sees the allowlisted client.
    assert.deepEqual(liveBatchArgs, [{ clientIdsInOrder: ["client-b"], weekStart: "2026-08-31" }]);
    // Every other eligible client keeps the Phase A dry-run plan, in the
    // original deterministic eligibility order, and is never routed live.
    assert.deepEqual(dryRunVisited, ["client-a", "client-c"]);
    assert.equal(dryRunBatchCalls, 0);
    // Response is the additive live shape: dryRun:false, eligibleCount over
    // ALL eligible clients, processed/failed/clients scoped to the live batch.
    assert.deepEqual(result, {
      weekStart: "2026-08-31",
      dryRun: false,
      eligibleCount: 3,
      processedCount: 1,
      failedCount: 0,
      clients: [{ clientId: "client-b", status: "dispatched", runId: "run-client-b" }],
    });
  }));

  it("processes both the dry-run and live passes sequentially, never in parallel", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleCronBatch } = await import("./run-weekly-cycle-batch");
    const events: string[] = [];
    await runWeeklyCycleCronBatch(
      { weekStart: "2026-08-31" },
      {
        isLiveEnabled: () => true,
        listEligible: async () => ({ eligible: [{ clientId: "a" }, { clientId: "b" }], skipped: [] }),
        selectLiveClientIds: (ids) => ids.filter((id) => id === "b"),
        runDryRunBatch: async () => { throw new Error("must not run full batch"); },
        runDryRunForClient: async (params) => {
          events.push(`dry-start:${params.clientId}`);
          await new Promise((resolve) => setTimeout(resolve, 0));
          events.push(`dry-end:${params.clientId}`);
          return {
            ok: true, runId: "r", weekStart: params.weekStart, clientId: params.clientId,
            status: "dry_run" as const, acquireOutcome: "CREATED" as const,
            plan: { dryRun: true as const, invokedBy: "system" as const, clientId: params.clientId, weekStart: params.weekStart, steps: [] },
          };
        },
        runLiveBatch: async (params) => {
          events.push(`live-start:${params.clientIdsInOrder.join(",")}`);
          await new Promise((resolve) => setTimeout(resolve, 0));
          events.push("live-end");
          return { processedCount: 1, failedCount: 0, clients: [] };
        },
      },
    );
    // The dry-run pass for "a" fully completes before the live pass begins —
    // no interleaving between the two sequential passes.
    assert.deepEqual(events, ["dry-start:a", "dry-end:a", "live-start:b", "live-end"]);
  }));
});
