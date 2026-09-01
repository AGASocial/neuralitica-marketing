import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type MockOptions = {
  runRow?: Record<string, unknown> | null;
  clientActive?: boolean;
  isLiveAllowed?: (clientId: string) => boolean;
  casSucceeds?: boolean;
  strategyRow?: Record<string, unknown> | null;
  stepRuns?: unknown[];
  loadWeeklyCycleSlotScripts?: (params: unknown) => Promise<unknown[]>;
};

function installMocks(options: MockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  const calls = {
    casAttempted: 0,
    advanceCalls: [] as unknown[],
    dispatchOutboxCalls: 0,
    reconciled: [] as string[],
    createRetryRow: [] as unknown[],
  };
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);
    const isModule = (name: string) => req === `@/lib/orchestration/${name}` || req.endsWith(`/${name}`) || req.endsWith(`/${name}.ts`);
    if (req.includes("lib/supabase/server")) {
      return {
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table === "neuramark_weekly_cycle_runs") {
              return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.runRow ?? null, error: null }) }) }),
                update: (patch: Record<string, unknown>) => ({
                  eq: () => ({
                    in: () => ({
                      select: () => ({
                        maybeSingle: async () => {
                          calls.casAttempted += 1;
                          if (options.casSucceeds === false) return { data: null, error: null };
                          Object.assign(options.runRow ?? {}, patch);
                          return { data: { id: "run-1" }, error: null };
                        },
                      }),
                    }),
                  }),
                }),
              };
            }
            if (table === "neuramark_clients") {
              return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { active: options.clientActive ?? true }, error: null }) }) }) };
            }
            if (table === "neuramark_content_strategies") {
              return {
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: options.strategyRow ?? null, error: null }) }) }),
                      }),
                    }),
                  }),
                }),
              };
            }
            throw new Error(`unexpected table ${table}`);
          },
        }),
      };
    }
    if (isModule("weekly-cycle-live-env")) {
      return { isWeeklyCycleLiveAllowedForClient: options.isLiveAllowed ?? (() => true) };
    }
    if (isModule("weekly-cycle-step-runs")) {
      return {
        createOrGetReadyStepRun: async (p: unknown) => { calls.createRetryRow.push(p); return { id: "retry-1", status: "ready", jobId: "linkage-1" }; },
        listStepRunsForRun: async () => options.stepRuns ?? [],
        markStepRunTerminal: async () => true,
      };
    }
    if (isModule("dispatch-weekly-cycle-outbox")) {
      return { dispatchWeeklyCycleOutbox: async () => { calls.dispatchOutboxCalls += 1; return { promoted: 0, dispatched: 0, retried: 0, failed: 0, reconciledRunIds: [] }; } };
    }
    if (isModule("advance-weekly-cycle-slot")) {
      return { advanceWeeklyCycleSlot: async (p: unknown) => { calls.advanceCalls.push(p); } };
    }
    if (isModule("weekly-cycle-trusted-steps")) {
      return {
        loadWeeklyCycleSlotScripts: options.loadWeeklyCycleSlotScripts ?? (async () => []),
        runWeeklyCycleTtsStep: async () => ({ ok: true, terminal: "completed" }),
        runWeeklyCycleQaStep: async () => ({ ok: true, terminal: "completed" }),
        runWeeklyCycleApprovalStep: async () => ({ ok: true, terminal: "completed" }),
      };
    }
    if (isModule("reconcile-weekly-cycle-run")) {
      return { reconcileWeeklyCycleRun: async (runId: string) => { calls.reconciled.push(runId); return { status: "running", changed: false }; } };
    }
    return originalLoad(request, parent, isMain);
  };
  return { restore: () => { nodeModule._load = originalLoad; }, calls };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/resume-weekly-cycle-run")) {
      delete require.cache[key];
    }
  }
}

const runId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";

describe("resumeWeeklyCycleRun — aggregate resume transitions", () => {
  it("returns NOT_FOUND for an unknown run id", async () => {
    const { restore } = installMocks({ runRow: null });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: false, error: { code: "NOT_FOUND" } });
    } finally { restore(); clearModuleCache(); }
  });

  for (const status of ["dry_run", "running", "completed"] as const) {
    it(`rejects a ${status} run as RUN_NOT_RESUMABLE — only paused/partial_failed may resume`, async () => {
      const { restore } = installMocks({ runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status } });
      try {
        clearModuleCache();
        const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
        const result = await resumeWeeklyCycleRun({ runId });
        assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_RESUMABLE" } });
      } finally { restore(); clearModuleCache(); }
    });
  }

  it("rejects partial_failed with zero retryable failed steps as RUN_NOT_RESUMABLE (successful slots are never rerun)", async () => {
    const stepRuns = [
      { id: "s0", runId, clientId, slotIndex: 0, step: "approval", status: "completed", attempt: 1 },
      { id: "s1", runId, clientId, slotIndex: 1, step: "assembly", status: "failed", attempt: 3 }, // exhausted, not retryable
    ];
    const { restore, calls } = installMocks({ runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "partial_failed" }, stepRuns });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_RESUMABLE" } });
      assert.equal(calls.casAttempted, 0, "must not attempt the CAS transition when there is nothing retryable");
    } finally { restore(); clearModuleCache(); }
  });

  it("gates on the live kill switch/allowlist BEFORE the CAS transition", async () => {
    const stepRuns = [{ id: "s1", runId, clientId, slotIndex: 1, step: "assembly", status: "failed", attempt: 1, errorCode: "PROVIDER_TRANSIENT" }];
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "partial_failed" },
      stepRuns, isLiveAllowed: () => false,
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: false, error: { code: "LIVE_DISABLED" } });
      assert.equal(calls.casAttempted, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("gates on client active BEFORE the CAS transition", async () => {
    const stepRuns = [{ id: "s1", runId, clientId, slotIndex: 1, step: "assembly", status: "failed", attempt: 1, errorCode: "PROVIDER_TRANSIENT" }];
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "partial_failed" },
      stepRuns, clientActive: false,
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: false, error: { code: "CLIENT_INACTIVE" } });
      assert.equal(calls.casAttempted, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("a CAS race (another resume already won) reports RUN_NOT_RESUMABLE without retrying steps", async () => {
    const stepRuns = [{ id: "s1", runId, clientId, slotIndex: 1, step: "assembly", status: "failed", attempt: 1, errorCode: "PROVIDER_TRANSIENT" }];
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "partial_failed" },
      stepRuns, casSucceeds: false,
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_RESUMABLE" } });
      assert.equal(calls.createRetryRow.length, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("resumes a paused run, transitioning it to running via the CAS even with zero failed steps", async () => {
    const { restore, calls } = installMocks({ runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "paused" }, stepRuns: [] });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: true, runId, outcome: "RESUMED" });
      assert.equal(calls.casAttempted, 1);
      assert.deepEqual(calls.reconciled, [runId]);
    } finally { restore(); clearModuleCache(); }
  });

  it("creates the next attempt only for retryable failed slots and never rebuilds a completed slot", async () => {
    const stepRuns = [
      { id: "s0", runId, clientId, slotIndex: 0, step: "approval", status: "completed", attempt: 1, jobId: null },
      { id: "s1", runId, clientId, slotIndex: 1, step: "assembly", status: "failed", attempt: 1, jobId: "assembly-job-1", errorCode: "PROVIDER_TRANSIENT" },
    ];
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "partial_failed" },
      stepRuns,
      strategyRow: { id: "strategy-1" },
      loadWeeklyCycleSlotScripts: async () => [{ reelScriptId: "r1", slotIndex: 1, modalidad: "own_avatar", needsBroll: false }],
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: true, runId, outcome: "RESUMED" });
      assert.equal(calls.createRetryRow.length, 1);
      assert.equal((calls.createRetryRow[0] as { attempt: number }).attempt, 2);
      assert.equal((calls.createRetryRow[0] as { slotIndex: number }).slotIndex, 1);
    } finally { restore(); clearModuleCache(); }
  });

  it("QA H1/H2: a paused run with an already-completed step resumes without re-dispatching or rebuilding that step (no double-spend), AND actually advances the slot's chain to its next step (no stall)", async () => {
    const stepRuns = [
      { id: "s0", runId, clientId, slotIndex: 0, step: "primary_video", status: "completed", attempt: 1, jobId: "video-job-1" },
    ];
    const script = { reelScriptId: "r0", slotIndex: 0, modalidad: "own_avatar", needsBroll: false };
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "paused" },
      stepRuns,
      strategyRow: { id: "strategy-1" },
      loadWeeklyCycleSlotScripts: async () => [script],
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: true, runId, outcome: "RESUMED" });
      assert.equal(calls.casAttempted, 1);
      // The completed step is `status === "completed"`, never "failed", so
      // it is excluded from the retry filter entirely and is never rebuilt
      // or re-dispatched.
      assert.equal(calls.createRetryRow.length, 0);
      assert.equal(calls.dispatchOutboxCalls, 0);
      // QA H2: but the slot's chain must still continue past its paused
      // step — resume must call advanceWeeklyCycleSlot for it, exactly
      // once, with fromStep set to the step that was left completed.
      assert.equal(calls.advanceCalls.length, 1);
      assert.deepEqual(calls.advanceCalls[0], {
        runId,
        clientId,
        slotIndex: 0,
        script,
        fromStep: "primary_video",
      });
      assert.deepEqual(calls.reconciled, [runId]);
    } finally { restore(); clearModuleCache(); }
  });

  it("QA H2: does not re-advance a slot already resolved at approval (terminal), and does not advance a slot that is already correctly in-flight (pending_provider)", async () => {
    const stepRuns = [
      // Slot 0: already terminal for this slot — must not be touched.
      { id: "s0", runId, clientId, slotIndex: 0, step: "approval", status: "completed", attempt: 1, jobId: "approval-0" },
      // Slot 1: genuinely still in flight (its next step was already
      // dispatched and is awaiting the provider) — must not be re-advanced.
      { id: "s1", runId, clientId, slotIndex: 1, step: "tts", status: "completed", attempt: 1, jobId: "tts-1" },
      { id: "s1b", runId, clientId, slotIndex: 1, step: "broll", status: "pending_provider", attempt: 1, jobId: "video-job-1b" },
    ];
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "paused" },
      stepRuns,
      strategyRow: { id: "strategy-1" },
      loadWeeklyCycleSlotScripts: async () => [
        { reelScriptId: "r0", slotIndex: 0, modalidad: "own_avatar", needsBroll: false },
        { reelScriptId: "r1", slotIndex: 1, modalidad: "own_avatar", needsBroll: true },
      ],
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: true, runId, outcome: "RESUMED" });
      assert.equal(calls.advanceCalls.length, 0, "neither an already-terminal slot nor an already-in-flight slot should be advanced");
      assert.equal(calls.createRetryRow.length, 0);
      assert.equal(calls.dispatchOutboxCalls, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("QA H2: mixed run — advances only the slot genuinely stalled mid-chain, leaving a terminal slot and an in-flight slot untouched", async () => {
    const stepRuns = [
      // Slot 0: stalled mid-chain — must be advanced.
      { id: "s0", runId, clientId, slotIndex: 0, step: "primary_video", status: "completed", attempt: 1, jobId: "video-job-0" },
      // Slot 1: already terminal — must not be touched.
      { id: "s1", runId, clientId, slotIndex: 1, step: "approval", status: "completed", attempt: 1, jobId: "approval-1" },
      // Slot 2: genuinely in flight — must not be touched.
      { id: "s2", runId, clientId, slotIndex: 2, step: "assembly", status: "dispatch_pending", attempt: 1, jobId: "assembly-2" },
    ];
    const slot0Script = { reelScriptId: "r0", slotIndex: 0, modalidad: "own_avatar", needsBroll: false };
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "paused" },
      stepRuns,
      strategyRow: { id: "strategy-1" },
      loadWeeklyCycleSlotScripts: async () => [
        slot0Script,
        { reelScriptId: "r1", slotIndex: 1, modalidad: "own_avatar", needsBroll: false },
        { reelScriptId: "r2", slotIndex: 2, modalidad: "own_avatar", needsBroll: false },
      ],
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: true, runId, outcome: "RESUMED" });
      assert.equal(calls.advanceCalls.length, 1);
      assert.deepEqual(calls.advanceCalls[0], {
        runId,
        clientId,
        slotIndex: 0,
        script: slot0Script,
        fromStep: "primary_video",
      });
    } finally { restore(); clearModuleCache(); }
  });

  it("QA H1/M-hardening: excludes a failed step whose error code is not in RETRYABLE_WEEKLY_CYCLE_ERROR_CODES, even though attempt < MAX (defense-in-depth against blind re-dispatch)", async () => {
    const stepRuns = [
      { id: "s1", runId, clientId, slotIndex: 1, step: "primary_video", status: "failed", attempt: 1, errorCode: "LIVE_DISABLED" },
    ];
    const { restore, calls } = installMocks({
      runRow: { id: runId, client_id: clientId, week_start: "2026-08-31", status: "partial_failed" },
      stepRuns,
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleRun } = require("./resume-weekly-cycle-run.ts");
      const result = await resumeWeeklyCycleRun({ runId });
      assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_RESUMABLE" } });
      assert.equal(calls.casAttempted, 0);
      assert.equal(calls.createRetryRow.length, 0);
    } finally { restore(); clearModuleCache(); }
  });
});
