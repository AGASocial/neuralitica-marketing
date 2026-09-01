import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type StepRun = {
  id: string; runId: string; clientId: string; slotIndex: number | null;
  step: string; status: string; attempt: number; idempotencyKey: string;
  jobKind: string | null; jobId: string | null; errorCode: string | null; availableAt: string;
};

type OutboxRow = {
  id: string; runId: string; stepRunId: string; eventKind: string;
  payload: unknown; status: string; dispatchAttempt: number; availableAt: string; claimToken: string | null;
};

type MockOptions = {
  claimableOutbox?: OutboxRow[];
  claimOutboxRow?: (id: string) => Promise<{ row: OutboxRow; claimToken: string } | null>;
  stepRun?: StepRun | null;
  isLiveAllowed?: (clientId: string) => boolean;
  invokeOutcome?: unknown;
  invokeThrows?: boolean;
  readyAsyncRows?: { id: string }[];
};

function installMocks(options: MockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  const calls = {
    scheduleRetry: [] as { stepRunId: string; availableAt: string }[],
    markOutboxRetry: [] as { outboxId: string; dispatchAttempt: number; availableAt: string; errorCode: string }[],
    markOutboxFailed: [] as { outboxId: string; errorCode: string }[],
    markOutboxDispatched: [] as string[],
    markStepRunTerminal: [] as { stepRunId: string; status: string; errorCode?: string }[],
    markStepRunPending: [] as unknown[],
    reconciled: [] as string[],
    invoked: 0,
    claimStepRunAsDispatchPending: [] as string[],
    enqueueOutboxForStepRun: [] as unknown[],
  };
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);
    const isModule = (name: string) => req === `@/lib/orchestration/${name}` || req.endsWith(`/${name}`) || req.endsWith(`/${name}.ts`);
    if (req.includes("lib/supabase/server")) {
      return {
        createServerSupabaseClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                in: () => ({
                  lte: () => ({
                    limit: async () => ({ data: options.readyAsyncRows ?? [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (isModule("weekly-cycle-step-runs")) {
      return {
        claimStepRunAsDispatchPending: async (id: string) => { calls.claimStepRunAsDispatchPending.push(id); return { id, runId: "run-1", clientId: "client-1", slotIndex: 0, step: "assembly", status: "dispatch_pending", attempt: 1, idempotencyKey: "wc:run-1:0:assembly:1" }; },
        loadStepRunById: async (id: string) => options.stepRun === undefined
          ? ({ id, runId: "run-1", clientId: "client-1", slotIndex: 0, step: "assembly", status: "dispatch_pending", attempt: 1, idempotencyKey: "k", jobKind: null, jobId: "reel-script-1", errorCode: null, availableAt: "2026-08-31T00:00:00.000Z" } satisfies StepRun)
          : options.stepRun,
        markStepRunPending: async (p: unknown) => { calls.markStepRunPending.push(p); return true; },
        markStepRunTerminal: async (p: { stepRunId: string; status: string; errorCode?: string }) => { calls.markStepRunTerminal.push(p); return true; },
        scheduleStepRunRetry: async (p: { stepRunId: string; availableAt: string }) => { calls.scheduleRetry.push(p); return true; },
      };
    }
    if (isModule("weekly-cycle-outbox")) {
      return {
        enqueueOutboxForStepRun: async (p: unknown) => { calls.enqueueOutboxForStepRun.push(p); return { id: "outbox-new" }; },
        listClaimableOutboxRows: async () => options.claimableOutbox ?? [],
        claimOutboxRow: options.claimOutboxRow ?? (async (id: string) => {
          const row = (options.claimableOutbox ?? []).find((r) => r.id === id);
          return row ? { row, claimToken: "token-1" } : null;
        }),
        markOutboxDispatched: async (id: string) => { calls.markOutboxDispatched.push(id); return true; },
        markOutboxFailed: async (p: { outboxId: string; errorCode: string }) => { calls.markOutboxFailed.push(p); return true; },
        markOutboxRetry: async (p: { outboxId: string; dispatchAttempt: number; availableAt: string; errorCode: string }) => { calls.markOutboxRetry.push(p); return true; },
      };
    }
    if (isModule("weekly-cycle-live-env")) {
      return { isWeeklyCycleLiveAllowedForClient: options.isLiveAllowed ?? (() => true) };
    }
    if (isModule("reconcile-weekly-cycle-run")) {
      return { reconcileWeeklyCycleRun: async (runId: string) => { calls.reconciled.push(runId); return { status: "running", changed: false }; } };
    }
    if (isModule("weekly-cycle-trusted-steps")) {
      return {
        dispatchWeeklyCyclePrimaryVideoStep: async () => { calls.invoked += 1; if (options.invokeThrows) throw new Error("boom"); return options.invokeOutcome ?? { ok: true, terminal: "pending", jobKind: "video", jobId: "job-1" }; },
        dispatchWeeklyCycleBrollStep: async () => { calls.invoked += 1; return options.invokeOutcome ?? { ok: true, terminal: "completed" }; },
        dispatchWeeklyCycleAssemblyStep: async () => { calls.invoked += 1; if (options.invokeThrows) throw new Error("boom"); return options.invokeOutcome ?? { ok: true, terminal: "pending", jobKind: "assembly", jobId: "job-1" }; },
        dispatchWeeklyCycleBrandingStep: async () => { calls.invoked += 1; return options.invokeOutcome ?? { ok: true, terminal: "pending", jobKind: "branding", jobId: "job-1" }; },
      };
    }
    return originalLoad(request, parent, isMain);
  };
  return { restore: () => { nodeModule._load = originalLoad; }, calls };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/dispatch-weekly-cycle-outbox")) {
      delete require.cache[key];
    }
  }
}

function outboxRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: "outbox-1", runId: "run-1", stepRunId: "step-1", eventKind: "dispatch_worker",
    payload: { stepRunId: "step-1", idempotencyKey: "wc:run-1:0:assembly:1" },
    status: "pending", dispatchAttempt: 0, availableAt: "2026-08-31T00:00:00.000Z", claimToken: null,
    ...overrides,
  };
}

describe("dispatchWeeklyCycleOutbox — retry/backoff and kill-switch mid-flight", () => {
  it("promotes ready async step runs into dispatch_pending + a new outbox row", async () => {
    const { restore, calls } = installMocks({ readyAsyncRows: [{ id: "step-a" }, { id: "step-b" }], claimableOutbox: [] });
    try {
      clearModuleCache();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.promoted, 2);
      assert.deepEqual(calls.claimStepRunAsDispatchPending, ["step-a", "step-b"]);
      assert.equal(calls.enqueueOutboxForStepRun.length, 2);
    } finally { restore(); clearModuleCache(); }
  });

  it("successful dispatch marks the step pending and the outbox row dispatched, then reconciles the run", async () => {
    const row = outboxRow();
    const { restore, calls } = installMocks({ claimableOutbox: [row], invokeOutcome: { ok: true, terminal: "pending", jobKind: "assembly", jobId: "job-99" } });
    try {
      clearModuleCache();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.dispatched, 1);
      assert.equal(summary.retried, 0);
      assert.equal(summary.failed, 0);
      assert.equal(calls.markOutboxDispatched.length, 1);
      assert.equal(calls.markStepRunPending.length, 1);
      assert.deepEqual(calls.reconciled, ["run-1"]);
    } finally { restore(); clearModuleCache(); }
  });

  it("a retryable failure at dispatch_attempt 0 schedules retry #1 with the frozen 30s backoff", async () => {
    const row = outboxRow({ dispatchAttempt: 0 });
    const { restore, calls } = installMocks({ claimableOutbox: [row], invokeOutcome: { ok: false, errorCode: "PROVIDER_TRANSIENT", retryable: true } });
    try {
      clearModuleCache();
      const before = Date.now();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.retried, 1);
      assert.equal(summary.failed, 0);
      assert.equal(calls.markOutboxRetry.length, 1);
      assert.equal(calls.markOutboxRetry[0]!.dispatchAttempt, 1);
      const availableAtMs = new Date(calls.markOutboxRetry[0]!.availableAt).getTime();
      const deltaSec = (availableAtMs - before) / 1000;
      assert.ok(deltaSec >= 29 && deltaSec <= 31, `expected ~30s backoff, got ${deltaSec}s`);
      assert.equal(calls.scheduleRetry.length, 1);
    } finally { restore(); clearModuleCache(); }
  });

  it("a retryable failure at dispatch_attempt 1 schedules retry #2 with the frozen 120s backoff", async () => {
    const row = outboxRow({ dispatchAttempt: 1 });
    const { restore, calls } = installMocks({ claimableOutbox: [row], invokeOutcome: { ok: false, errorCode: "WORKER_TRANSIENT", retryable: true } });
    try {
      clearModuleCache();
      const before = Date.now();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      await dispatchWeeklyCycleOutbox(10);
      assert.equal(calls.markOutboxRetry[0]!.dispatchAttempt, 2);
      const deltaSec = (new Date(calls.markOutboxRetry[0]!.availableAt).getTime() - before) / 1000;
      assert.ok(deltaSec >= 119 && deltaSec <= 121, `expected ~120s backoff, got ${deltaSec}s`);
    } finally { restore(); clearModuleCache(); }
  });

  it("exhausts the retry ceiling: a retryable failure at dispatch_attempt 2 (would be attempt 3) still marks terminal failed, never a 4th attempt", async () => {
    const row = outboxRow({ dispatchAttempt: 2 });
    const { restore, calls } = installMocks({ claimableOutbox: [row], invokeOutcome: { ok: false, errorCode: "DISPATCH_TRANSIENT", retryable: true } });
    try {
      clearModuleCache();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.retried, 0);
      assert.equal(summary.failed, 1);
      assert.equal(calls.markOutboxRetry.length, 0);
      assert.equal(calls.markStepRunTerminal.length, 1);
      assert.equal(calls.markStepRunTerminal[0]!.status, "failed");
      assert.equal(calls.markStepRunTerminal[0]!.errorCode, "DISPATCH_TRANSIENT");
    } finally { restore(); clearModuleCache(); }
  });

  it("a non-retryable failure marks terminal failed immediately, even on the very first attempt", async () => {
    const row = outboxRow({ dispatchAttempt: 0 });
    const { restore, calls } = installMocks({ claimableOutbox: [row], invokeOutcome: { ok: false, errorCode: "BUDGET_EXCEEDED", retryable: false } });
    try {
      clearModuleCache();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.failed, 1);
      assert.equal(summary.retried, 0);
      assert.equal(calls.markStepRunTerminal[0]!.errorCode, "BUDGET_EXCEEDED");
    } finally { restore(); clearModuleCache(); }
  });

  it("kill switch disabled mid-flight fails the claim as LIVE_DISABLED without ever invoking the trusted creator (no new spend)", async () => {
    const row = outboxRow();
    const { restore, calls } = installMocks({ claimableOutbox: [row], isLiveAllowed: () => false });
    try {
      clearModuleCache();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.failed, 1);
      assert.equal(calls.invoked, 0, "must never call the provider/worker creator once the kill switch is off");
      assert.deepEqual(calls.markOutboxFailed[0], { outboxId: row.id, errorCode: "LIVE_DISABLED" });
      assert.equal(calls.markStepRunTerminal[0]!.errorCode, "LIVE_DISABLED");
      assert.deepEqual(calls.reconciled, ["run-1"]);
    } finally { restore(); clearModuleCache(); }
  });

  it("an unexpected throw from the trusted creator is treated as a retryable INTERNAL_ERROR, not a crash", async () => {
    const row = outboxRow({ dispatchAttempt: 0 });
    const { restore, calls } = installMocks({ claimableOutbox: [row], invokeThrows: true });
    try {
      clearModuleCache();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.retried, 1);
      assert.equal(calls.markOutboxRetry[0]!.errorCode, "INTERNAL_ERROR");
    } finally { restore(); clearModuleCache(); }
  });

  it("a claim that returns null (already reclaimed by another worker) is silently skipped, not double-processed", async () => {
    const row = outboxRow();
    const { restore, calls } = installMocks({ claimableOutbox: [row], claimOutboxRow: async () => null });
    try {
      clearModuleCache();
      const { dispatchWeeklyCycleOutbox } = require("./dispatch-weekly-cycle-outbox.ts");
      const summary = await dispatchWeeklyCycleOutbox(10);
      assert.equal(summary.dispatched, 0);
      assert.equal(summary.retried, 0);
      assert.equal(summary.failed, 0);
      assert.equal(calls.invoked, 0);
    } finally { restore(); clearModuleCache(); }
  });
});
