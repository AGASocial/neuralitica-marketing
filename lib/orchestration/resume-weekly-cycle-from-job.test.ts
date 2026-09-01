import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type StepRun = {
  id: string; runId: string; clientId: string; slotIndex: number | null;
  step: string; status: string; attempt: number; idempotencyKey?: string;
  jobKind: string | null; jobId: string | null; errorCode: string | null; availableAt?: string;
};

type MockOptions = {
  linkedStepRun?: StepRun | null;
  videoJobRow?: { status: string; client_id: string } | null;
  assemblyJob?: { status: string; brandingStatus: string; reelScriptId?: string } | null;
  isLiveAllowed?: (clientId: string) => boolean;
  markTerminalReturns?: boolean;
  scriptStrategyId?: string | null;
  loadWeeklyCycleSlotScripts?: (params: unknown) => Promise<unknown[]>;
};

function installMocks(options: MockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  const calls = {
    markTerminal: [] as unknown[],
    reconciled: [] as string[],
    advanced: [] as unknown[],
  };
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);
    const isModule = (name: string) => req === `@/lib/orchestration/${name}` || req.endsWith(`/${name}`) || req.endsWith(`/${name}.ts`);
    if (req.includes("lib/supabase/server")) {
      return {
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table === "neuramark_weekly_cycle_step_runs") {
              // findStepRunByJobLinkage: eq(job_kind).eq(job_id).in(status).maybeSingle()
              return {
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      in: () => ({
                        maybeSingle: async () => (options.linkedStepRun
                          ? { data: { id: options.linkedStepRun.id }, error: null }
                          : { data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              };
            }
            if (table === "neuramark_video_jobs") {
              return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.videoJobRow ?? null, error: null }) }) }) };
            }
            if (table === "neuramark_reel_scripts") {
              return {
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: options.scriptStrategyId ? { strategy_id: options.scriptStrategyId } : null, error: null }) }) }),
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
    if (isModule("load-assembly-job")) {
      return { loadAssemblyJobScoped: async () => options.assemblyJob ?? null };
    }
    if (isModule("weekly-cycle-step-runs")) {
      return {
        loadStepRunById: async (id: string) => (options.linkedStepRun && options.linkedStepRun.id === id ? options.linkedStepRun : null),
        markStepRunTerminal: async (p: unknown) => { calls.markTerminal.push(p); return options.markTerminalReturns ?? true; },
      };
    }
    if (isModule("reconcile-weekly-cycle-run")) {
      return { reconcileWeeklyCycleRun: async (runId: string) => { calls.reconciled.push(runId); return { status: "running", changed: false }; } };
    }
    if (isModule("advance-weekly-cycle-slot")) {
      return { advanceWeeklyCycleSlot: async (p: unknown) => { calls.advanced.push(p); } };
    }
    if (isModule("weekly-cycle-live-env")) {
      return { isWeeklyCycleLiveAllowedForClient: options.isLiveAllowed ?? (() => true) };
    }
    if (isModule("weekly-cycle-trusted-steps")) {
      return { loadWeeklyCycleSlotScripts: options.loadWeeklyCycleSlotScripts ?? (async () => []) };
    }
    return originalLoad(request, parent, isMain);
  };
  return { restore: () => { nodeModule._load = originalLoad; }, calls };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/resume-weekly-cycle-from-job")) {
      delete require.cache[key];
    }
  }
}

const runId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";

function pendingVideoStepRun(overrides: Partial<StepRun> = {}): StepRun {
  return { id: "step-1", runId, clientId, slotIndex: 0, step: "primary_video", status: "pending_provider", attempt: 1, jobKind: "video", jobId: "job-1", errorCode: null, ...overrides };
}

describe("resumeWeeklyCycleFromJob — authenticated callback trust and direct-successor enforcement", () => {
  it("tts/qa job kinds never link a pending_* step (they are synchronous today) — JOB_LINK_NOT_FOUND", async () => {
    const { restore } = installMocks({});
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "tts", jobId: "any" });
      assert.deepEqual(result, { ok: false, code: "JOB_LINK_NOT_FOUND" });
    } finally { restore(); clearModuleCache(); }
  });

  it("a forged/unlinked jobId (no matching step run) is rejected as JOB_LINK_NOT_FOUND, ignoring caller claims", async () => {
    const { restore } = installMocks({ linkedStepRun: null });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "video", jobId: "forged-job-id" });
      assert.deepEqual(result, { ok: false, code: "JOB_LINK_NOT_FOUND" });
    } finally { restore(); clearModuleCache(); }
  });

  it("a job that does not belong to the step run's own client_id is JOB_SCOPE_MISMATCH — caller-claimed scope is never trusted", async () => {
    const { restore } = installMocks({
      linkedStepRun: pendingVideoStepRun(),
      videoJobRow: { status: "completed", client_id: "some-other-client" }, // owned by a different tenant
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "video", jobId: "job-1" });
      assert.deepEqual(result, { ok: false, code: "JOB_SCOPE_MISMATCH" });
    } finally { restore(); clearModuleCache(); }
  });

  it("an in-progress owned job reports DUPLICATE_CALLBACK without mutating any step", async () => {
    const { restore, calls } = installMocks({
      linkedStepRun: pendingVideoStepRun(),
      videoJobRow: { status: "processing", client_id: clientId },
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "video", jobId: "job-1" });
      assert.deepEqual(result, { ok: true, runId, outcome: "DUPLICATE_CALLBACK" });
      assert.equal(calls.markTerminal.length, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("an already-terminal step (idempotent duplicate callback) is reported without a second advance", async () => {
    const { restore, calls } = installMocks({
      linkedStepRun: pendingVideoStepRun(),
      videoJobRow: { status: "completed", client_id: clientId },
      markTerminalReturns: false, // simulates markStepRunTerminal's WHERE guard finding it already terminal
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "video", jobId: "job-1" });
      assert.deepEqual(result, { ok: true, runId, outcome: "DUPLICATE_CALLBACK" });
      assert.equal(calls.advanced.length, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("kill switch disabled mid-flight pauses the step as LIVE_DISABLED instead of advancing it", async () => {
    const { restore, calls } = installMocks({
      linkedStepRun: pendingVideoStepRun(),
      videoJobRow: { status: "completed", client_id: clientId },
      isLiveAllowed: () => false,
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "video", jobId: "job-1" });
      assert.deepEqual(result, { ok: true, runId, outcome: "PAUSED_LIVE_DISABLED" });
      assert.deepEqual(calls.markTerminal[0], { stepRunId: "step-1", status: "failed", errorCode: "LIVE_DISABLED" });
      assert.equal(calls.advanced.length, 0);
      assert.deepEqual(calls.reconciled, [runId]);
    } finally { restore(); clearModuleCache(); }
  });

  it("only advances the DIRECT successor of a completed slot step, using the reloaded script — never jumps to approval/publish", async () => {
    const { restore, calls } = installMocks({
      linkedStepRun: pendingVideoStepRun({ step: "assembly", jobKind: "assembly", jobId: "assembly-1" }),
      assemblyJob: { status: "completed", brandingStatus: "queued" },
      scriptStrategyId: "strategy-1",
      loadWeeklyCycleSlotScripts: async () => [{ reelScriptId: "r0", slotIndex: 0, modalidad: "own_avatar", needsBroll: false }],
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "assembly", jobId: "assembly-1" });
      assert.deepEqual(result, { ok: true, runId, outcome: "ADVANCED" });
      assert.equal(calls.advanced.length, 1);
      assert.equal((calls.advanced[0] as { fromStep: string }).fromStep, "assembly");
      assert.equal((calls.advanced[0] as { slotIndex: number }).slotIndex, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("a failed owned job marks the step terminal failed with a transient provider code, without advancing the slot", async () => {
    const { restore, calls } = installMocks({
      linkedStepRun: pendingVideoStepRun(),
      videoJobRow: { status: "failed", client_id: clientId },
    });
    try {
      clearModuleCache();
      const { resumeWeeklyCycleFromJob } = require("./resume-weekly-cycle-from-job.ts");
      const result = await resumeWeeklyCycleFromJob({ jobKind: "video", jobId: "job-1" });
      assert.deepEqual(result, { ok: true, runId, outcome: "ADVANCED" });
      assert.deepEqual(calls.markTerminal[0], { stepRunId: "step-1", status: "failed", errorCode: "PROVIDER_TRANSIENT" });
      assert.equal(calls.advanced.length, 0, "a failed step is terminal for the slot chain, never advanced");
    } finally { restore(); clearModuleCache(); }
  });
});
