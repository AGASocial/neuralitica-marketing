import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type MockOptions = {
  isWeeklyCycleLiveAllowedForClient?: (clientId: string) => boolean;
  clientActive?: boolean;
  acquire?: (params: unknown) => Promise<unknown>;
  startCas?: (params: unknown) => Promise<unknown>;
  createOrGetReadyStepRun?: (params: unknown) => Promise<unknown>;
  markStepRunTerminal?: (params: unknown) => Promise<boolean>;
  reconcile?: (runId: string) => Promise<unknown>;
  advanceWeeklyCycleSlot?: (params: unknown) => Promise<void>;
  runWeeklyCycleStrategyStep?: (params: unknown) => Promise<unknown>;
  runWeeklyCycleScriptsStep?: (params: unknown) => Promise<unknown>;
  runWeeklyCycleCaptionsStep?: (params: unknown) => Promise<unknown>;
  loadWeeklyCycleSlotScripts?: (params: unknown) => Promise<unknown[]>;
};

function installMocks(options: MockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  const calls = { acquire: 0, startCas: 0 };
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);
    if (req.includes("lib/supabase/server")) {
      return {
        createServerSupabaseClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { active: options.clientActive ?? true }, error: null }) }),
            }),
          }),
        }),
      };
    }
    if (req.includes("acquire-weekly-cycle-run")) {
      return {
        acquireWeeklyCycleRun: async (params: unknown) => {
          calls.acquire += 1;
          return options.acquire ? options.acquire(params) : { outcome: "CREATED", runId: "run-1", status: "dry_run", replan: "ALLOWED" };
        },
      };
    }
    if (req.includes("start-weekly-cycle-live-cas")) {
      return {
        startWeeklyCycleLiveCas: async (params: unknown) => {
          calls.startCas += 1;
          return options.startCas ? options.startCas(params) : { outcome: "STARTED", runId: "run-1" };
        },
      };
    }
    if (req.includes("weekly-cycle-live-env")) {
      return { isWeeklyCycleLiveAllowedForClient: options.isWeeklyCycleLiveAllowedForClient ?? (() => true) };
    }
    if (req.includes("weekly-cycle-step-runs")) {
      return {
        createOrGetReadyStepRun: options.createOrGetReadyStepRun ?? (async () => ({ id: "step-1", status: "ready" })),
        markStepRunTerminal: options.markStepRunTerminal ?? (async () => true),
      };
    }
    if (req.includes("reconcile-weekly-cycle-run")) {
      return { reconcileWeeklyCycleRun: options.reconcile ?? (async () => ({ status: "running", changed: false })) };
    }
    if (req.includes("advance-weekly-cycle-slot")) {
      return { advanceWeeklyCycleSlot: options.advanceWeeklyCycleSlot ?? (async () => {}) };
    }
    if (req.includes("weekly-cycle-trusted-steps")) {
      return {
        loadWeeklyCycleSlotScripts: options.loadWeeklyCycleSlotScripts ?? (async () => []),
        runWeeklyCycleStrategyStep: options.runWeeklyCycleStrategyStep ?? (async () => ({ ok: true, strategyId: "strategy-1" })),
        runWeeklyCycleScriptsStep: options.runWeeklyCycleScriptsStep ?? (async () => ({ ok: true })),
        runWeeklyCycleCaptionsStep: options.runWeeklyCycleCaptionsStep ?? (async () => ({ ok: true })),
      };
    }
    return originalLoad(request, parent, isMain);
  };
  return { restore: () => { nodeModule._load = originalLoad; }, calls };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/run-weekly-cycle-live")) {
      delete require.cache[key];
    }
  }
}

const params = { clientId: "11111111-1111-4111-8111-111111111111", weekStart: "2026-08-31", invokedBy: "system" as const, mode: "cron" as const };

describe("runWeeklyCycleLive — fresh gates before every acquire/spend", () => {
  it("gate 1 (kill switch + rollout): LIVE_DISABLED short-circuits before acquire is ever called", async () => {
    const { restore, calls } = installMocks({ isWeeklyCycleLiveAllowedForClient: () => false });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.deepEqual(result, { ok: false, error: { code: "LIVE_DISABLED" } });
      assert.equal(calls.acquire, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("gate 3 (active re-check): CLIENT_INACTIVE short-circuits before acquire is ever called", async () => {
    const { restore, calls } = installMocks({ clientActive: false });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.deepEqual(result, { ok: false, error: { code: "CLIENT_INACTIVE" } });
      assert.equal(calls.acquire, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("wraps a thrown acquire in INTERNAL_ERROR rather than propagating", async () => {
    const { restore } = installMocks({ acquire: async () => { throw new Error("db down"); } });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.deepEqual(result, { ok: false, error: { code: "INTERNAL_ERROR" } });
    } finally { restore(); clearModuleCache(); }
  });

  for (const status of ["running", "paused"] as const) {
    it(`acquire BLOCKED/${status} maps to ALREADY_RUNNING without ever starting the CAS`, async () => {
      const { restore, calls } = installMocks({ acquire: async () => ({ outcome: "ALREADY_EXISTS", runId: "run-1", status, replan: "BLOCKED" }) });
      try {
        clearModuleCache();
        const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
        const result = await runWeeklyCycleLive(params);
        assert.deepEqual(result, { ok: true, runId: "run-1", outcome: "ALREADY_RUNNING", dispatchedStepCount: 0 });
        assert.equal(calls.startCas, 0);
      } finally { restore(); clearModuleCache(); }
    });
  }

  it("acquire BLOCKED/completed maps to ALREADY_COMPLETED", async () => {
    const { restore } = installMocks({ acquire: async () => ({ outcome: "ALREADY_EXISTS", runId: "run-1", status: "completed", replan: "BLOCKED" }) });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.deepEqual(result, { ok: true, runId: "run-1", outcome: "ALREADY_COMPLETED", dispatchedStepCount: 0 });
    } finally { restore(); clearModuleCache(); }
  });

  for (const status of ["partial_failed", "failed"] as const) {
    it(`acquire BLOCKED/${status} maps to RUN_NOT_RESUMABLE — only the dedicated resume action may proceed`, async () => {
      const { restore } = installMocks({ acquire: async () => ({ outcome: "ALREADY_EXISTS", runId: "run-1", status, replan: "BLOCKED" }) });
      try {
        clearModuleCache();
        const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
        const result = await runWeeklyCycleLive(params);
        assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_RESUMABLE" } });
      } finally { restore(); clearModuleCache(); }
    });
  }

  it("start CAS ALREADY_STARTED maps to ALREADY_RUNNING (never re-dispatches steps)", async () => {
    const { restore } = installMocks({ startCas: async () => ({ outcome: "ALREADY_STARTED", runId: "run-1" }) });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.deepEqual(result, { ok: true, runId: "run-1", outcome: "ALREADY_RUNNING", dispatchedStepCount: 0 });
    } finally { restore(); clearModuleCache(); }
  });

  it("start CAS NOT_DRY_RUN maps to RUN_NOT_REPLANNABLE", async () => {
    const { restore } = installMocks({ startCas: async () => ({ outcome: "NOT_DRY_RUN", runId: "run-1" }) });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_REPLANNABLE" } });
    } finally { restore(); clearModuleCache(); }
  });

  it("dispatches the full global chain then advances every seeded slot, in order", async () => {
    const advanced: number[] = [];
    const { restore } = installMocks({
      loadWeeklyCycleSlotScripts: async () => [
        { reelScriptId: "s0", slotIndex: 0, modalidad: "own_avatar", needsBroll: false },
        { reelScriptId: "s1", slotIndex: 1, modalidad: "faceless", needsBroll: true },
        { reelScriptId: "s2", slotIndex: 2, modalidad: "generic_avatar", needsBroll: false },
      ],
      advanceWeeklyCycleSlot: async (p) => { advanced.push((p as { slotIndex: number }).slotIndex); },
    });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.equal(result.ok, true);
      assert.equal(result.ok && result.outcome, "STARTED");
      // strategy + scripts + captions + 3 slot seeds = 6.
      assert.equal(result.ok && result.dispatchedStepCount, 6);
      assert.deepEqual(advanced, [0, 1, 2]);
    } finally { restore(); clearModuleCache(); }
  });

  it("a failed strategy step stops the chain before scripts/captions/slots ever run", async () => {
    let scriptsCalled = false;
    let slotsLoaded = false;
    const { restore } = installMocks({
      runWeeklyCycleStrategyStep: async () => ({ ok: false, errorCode: "BUDGET_EXCEEDED", retryable: false }),
      runWeeklyCycleScriptsStep: async () => { scriptsCalled = true; return { ok: true }; },
      loadWeeklyCycleSlotScripts: async () => { slotsLoaded = true; return []; },
    });
    try {
      clearModuleCache();
      const { runWeeklyCycleLive } = require("./run-weekly-cycle-live.ts");
      const result = await runWeeklyCycleLive(params);
      assert.equal(result.ok, true);
      assert.equal(result.ok && result.dispatchedStepCount, 1);
      assert.equal(scriptsCalled, false);
      assert.equal(slotsLoaded, false);
    } finally { restore(); clearModuleCache(); }
  });
});
