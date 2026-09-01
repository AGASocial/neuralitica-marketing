import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

function makeRunRowClient(initialRow: Record<string, unknown>) {
  let row: Record<string, unknown> = { ...initialRow };
  const updates: Record<string, unknown>[] = [];
  const from = (table: string) => {
    if (table !== "neuramark_weekly_cycle_runs") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
      update: (patch: Record<string, unknown>) => {
        const conditions: Record<string, unknown> = {};
        const builder = {
          eq: (col: string, val: unknown) => { conditions[col] = val; return builder; },
        };
        // The source calls .eq("id", runId).eq("status", currentStatus) then
        // awaits the builder itself (no terminal .select()/.maybeSingle()).
        const thenable = Object.assign(Promise.resolve().then(() => {
          const matches = Object.entries(conditions).every(([k, v]) => row[k] === v);
          if (matches) {
            updates.push(patch);
            row = { ...row, ...patch };
            return { error: null };
          }
          return { error: null }; // Real PostgREST silently affects 0 rows; no error either.
        }), builder);
        return thenable;
      },
    };
  };
  return { from, getRow: () => row, updates };
}

function installMocks(options: {
  runRowClient: { from: (table: string) => unknown };
  stepRuns: unknown[];
}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "@/lib/supabase/server" || String(request).includes("lib/supabase/server")) {
      return { createServerSupabaseClient: () => options.runRowClient };
    }
    if (request === "@/lib/orchestration/weekly-cycle-step-runs" || String(request).includes("weekly-cycle-step-runs")) {
      return { listStepRunsForRun: async () => options.stepRuns };
    }
    return originalLoad(request, parent, isMain);
  };
  return () => { nodeModule._load = originalLoad; };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (normalized.includes("/lib/orchestration/reconcile-weekly-cycle-run")) {
      delete require.cache[key];
    }
  }
}

const runId = "11111111-1111-4111-8111-111111111111";
const now = "2026-08-31T12:00:00.000Z";

function approvalRow(slotIndex: number, status: "completed" | "ready" | "failed" = "completed") {
  return { id: `approval-${slotIndex}`, runId, clientId: "c", slotIndex, step: "approval", status, attempt: 1, idempotencyKey: `k${slotIndex}`, jobKind: null, jobId: null, errorCode: null, availableAt: now };
}

describe("reconcileWeeklyCycleRun — aggregate transitions from running", () => {
  it("resolves running -> completed once all 3 slots have a completed approval step", async () => {
    const client = makeRunRowClient({ id: runId, status: "running" });
    const restore = installMocks({ runRowClient: client, stepRuns: [approvalRow(0), approvalRow(1), approvalRow(2)] });
    try {
      clearModuleCache();
      const { reconcileWeeklyCycleRun } = require("./reconcile-weekly-cycle-run.ts");
      const result = await reconcileWeeklyCycleRun(runId);
      assert.deepEqual(result, { status: "completed", changed: true });
      assert.equal(client.getRow().status, "completed");
      assert.ok(client.getRow().finished_at);
    } finally { restore(); clearModuleCache(); }
  });

  it("resolves running -> partial_failed when 1-2 slots approved and nothing else is pending/runnable", async () => {
    const client = makeRunRowClient({ id: runId, status: "running" });
    const stepRuns = [
      approvalRow(0),
      { id: "s1", runId, clientId: "c", slotIndex: 1, step: "assembly", status: "failed", attempt: 3, idempotencyKey: "k1", jobKind: null, jobId: null, errorCode: "PROVIDER_UNAVAILABLE", availableAt: now },
      { id: "s2", runId, clientId: "c", slotIndex: 2, step: "qa", status: "failed", attempt: 1, idempotencyKey: "k2", jobKind: null, jobId: null, errorCode: "QA_FAILED", availableAt: now },
    ];
    const restore = installMocks({ runRowClient: client, stepRuns });
    try {
      clearModuleCache();
      const { reconcileWeeklyCycleRun } = require("./reconcile-weekly-cycle-run.ts");
      const result = await reconcileWeeklyCycleRun(runId);
      assert.deepEqual(result, { status: "partial_failed", changed: true });
    } finally { restore(); clearModuleCache(); }
  });

  it("resolves running -> failed when zero slots approved and nothing pending/runnable remains", async () => {
    const client = makeRunRowClient({ id: runId, status: "running" });
    const stepRuns = [
      { id: "s0", runId, clientId: "c", slotIndex: 0, step: "primary_video", status: "failed", attempt: 3, idempotencyKey: "k0", jobKind: null, jobId: null, errorCode: "PROVIDER_UNAVAILABLE", availableAt: now },
    ];
    const restore = installMocks({ runRowClient: client, stepRuns });
    try {
      clearModuleCache();
      const { reconcileWeeklyCycleRun } = require("./reconcile-weekly-cycle-run.ts");
      const result = await reconcileWeeklyCycleRun(runId);
      assert.deepEqual(result, { status: "failed", changed: true });
    } finally { restore(); clearModuleCache(); }
  });

  it("stays running while any step is still pending/runnable, even with a completed slot", async () => {
    const client = makeRunRowClient({ id: runId, status: "running" });
    const stepRuns = [
      approvalRow(0),
      { id: "s1", runId, clientId: "c", slotIndex: 1, step: "assembly", status: "pending_worker", attempt: 1, idempotencyKey: "k1", jobKind: "assembly", jobId: "j1", errorCode: null, availableAt: now },
    ];
    const restore = installMocks({ runRowClient: client, stepRuns });
    try {
      clearModuleCache();
      const { reconcileWeeklyCycleRun } = require("./reconcile-weekly-cycle-run.ts");
      const result = await reconcileWeeklyCycleRun(runId);
      assert.deepEqual(result, { status: "running", changed: false });
    } finally { restore(); clearModuleCache(); }
  });

  for (const status of ["completed", "failed", "dry_run"] as const) {
    it(`never rewrites an already-terminal/${status} row`, async () => {
      const client = makeRunRowClient({ id: runId, status });
      const restore = installMocks({ runRowClient: client, stepRuns: [approvalRow(0), approvalRow(1), approvalRow(2)] });
      try {
        clearModuleCache();
        const { reconcileWeeklyCycleRun } = require("./reconcile-weekly-cycle-run.ts");
        const result = await reconcileWeeklyCycleRun(runId);
        assert.deepEqual(result, { status, changed: false });
        assert.equal(client.updates.length, 0);
      } finally { restore(); clearModuleCache(); }
    });
  }

  it("never auto-advances paused or partial_failed rows — only an explicit resume action may", async () => {
    for (const status of ["paused", "partial_failed"] as const) {
      const client = makeRunRowClient({ id: runId, status });
      const restore = installMocks({ runRowClient: client, stepRuns: [approvalRow(0), approvalRow(1), approvalRow(2)] });
      try {
        clearModuleCache();
        const { reconcileWeeklyCycleRun } = require("./reconcile-weekly-cycle-run.ts");
        const result = await reconcileWeeklyCycleRun(runId);
        // step_log is still refreshed (projection), but aggregate status must
        // remain untouched by reconcile for these two states.
        assert.equal(result?.status, status);
        assert.equal(client.getRow().status, status);
      } finally { restore(); clearModuleCache(); }
    }
  });
});
