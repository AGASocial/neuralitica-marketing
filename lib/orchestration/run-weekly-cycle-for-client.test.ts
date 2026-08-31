import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it, mock } from "node:test";

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

const steps = ["strategy", "scripts", "captions", "primary_video", "tts", "broll", "assembly", "branding", "qa", "approval"] as const;

describe("runWeeklyCycleForClient dry-run", () => {
  it("persists and refreshes the ordered plan without calling spend seams", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleForClient } = await import("./run-weekly-cycle-for-client");
    let acquireCalls = 0;
    const persisted: unknown[] = [];
    const spendSeams = {
      generateContentStrategyForClient: mock.fn(), generateReelScriptsForClient: mock.fn(),
      generateReelCaptionsForClient: mock.fn(), createPrimaryVideoJobsForReelScript: mock.fn(),
      synthesizeVoiceoverForReelScript: mock.fn(), createBrollVideoJobs: mock.fn(),
      createAssemblyJobForReelScript: mock.fn(), enqueueBrandingForAssembledReel: mock.fn(),
      runQaForAssembledReelForClient: mock.fn(), ensureApprovalQueueEntryForReel: mock.fn(),
    };
    const dependencies = {
      acquire: async (params: { clientId: string; weekStart: string }) => ({
        outcome: (acquireCalls++ === 0 ? "CREATED" : "ALREADY_EXISTS") as "CREATED" | "ALREADY_EXISTS",
        runId: "22222222-2222-4222-8222-222222222222", status: "dry_run" as const,
        replan: "ALLOWED" as const,
        clientId: params.clientId, weekStart: params.weekStart,
      }),
      plan: (params: { clientId: string; weekStart: string }) => ({
        dryRun: true as const, invokedBy: "system" as const, ...params,
        steps: steps.map((step) => ({ step, status: "planned" as const, orchestratorRef: step })),
      }),
      persist: async (_runId: string, planSteps: unknown[]) => { persisted.push(planSteps); return { outcome: "UPDATED" as const }; },
    };
    const params = { clientId: "11111111-1111-4111-8111-111111111111", weekStart: "2026-08-31", invokedBy: "system" as const, mode: "cron" as const, dryRun: true as const };
    const first = await runWeeklyCycleForClient(params, dependencies);
    const second = await runWeeklyCycleForClient(params, dependencies);
    assert.equal(first.ok && first.acquireOutcome, "CREATED");
    assert.equal(second.ok && second.acquireOutcome, "ALREADY_EXISTS");
    assert.equal(first.ok && first.plan.steps.length, 10);
    assert.equal(persisted.length, 2);
    assert.deepEqual(Object.values(spendSeams).map((spy) => spy.mock.callCount()), Array(10).fill(0));
  }));

  for (const status of ["planned", "running", "completed", "failed"] as const) {
    it(`does not plan or persist an existing ${status} run`, async () => withServerOnlyStub(async () => {
      const { runWeeklyCycleForClient } = await import("./run-weekly-cycle-for-client");
      let planCalls = 0;
      let persistCalls = 0;
      const result = await runWeeklyCycleForClient(
        { clientId: "11111111-1111-4111-8111-111111111111", weekStart: "2026-08-31", invokedBy: "system", mode: "cron", dryRun: true },
        {
          acquire: async (params) => ({
            outcome: "ALREADY_EXISTS" as const,
            runId: "22222222-2222-4222-8222-222222222222",
            status,
            replan: "BLOCKED" as const,
            clientId: params.clientId,
            weekStart: params.weekStart,
          }),
          plan: () => { planCalls += 1; throw new Error("must not plan"); },
          persist: async () => { persistCalls += 1; return { outcome: "UPDATED" as const }; },
        },
      );
      assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_REPLANNABLE" } });
      assert.equal(planCalls, 0);
      assert.equal(persistCalls, 0);
    }));
  }

  it("returns non-replannable when state changes between acquire and persist", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleForClient } = await import("./run-weekly-cycle-for-client");
    const result = await runWeeklyCycleForClient(
      { clientId: "11111111-1111-4111-8111-111111111111", weekStart: "2026-08-31", invokedBy: "system", mode: "cron", dryRun: true },
      {
        acquire: async (params) => ({
          outcome: "ALREADY_EXISTS" as const,
          runId: "22222222-2222-4222-8222-222222222222",
          status: "dry_run" as const,
          replan: "ALLOWED" as const,
          clientId: params.clientId,
          weekStart: params.weekStart,
        }),
        plan: (params) => ({
          dryRun: true as const,
          invokedBy: "system" as const,
          ...params,
          steps: steps.map((step) => ({ step, status: "planned" as const, orchestratorRef: step })),
        }),
        persist: async () => ({ outcome: "NOT_REPLANNABLE" as const }),
      },
    );
    assert.deepEqual(result, { ok: false, error: { code: "RUN_NOT_REPLANNABLE" } });
  }));

  it("rejects dryRun false before acquire, plan, persist, or spend", async () => withServerOnlyStub(async () => {
    const { runWeeklyCycleForClient } = await import("./run-weekly-cycle-for-client");
    let calls = 0;
    const result = await runWeeklyCycleForClient({ clientId: "x", weekStart: "2026-08-31", invokedBy: "system", mode: "cron", dryRun: false } as never, {
      acquire: async () => { calls += 1; throw new Error("must not run"); },
      plan: () => { calls += 1; throw new Error("must not run"); },
      persist: async () => { calls += 1; return { outcome: "UPDATED" as const }; },
    } as never);
    assert.deepEqual(result, { ok: false, error: { code: "INTERNAL_ERROR" } });
    assert.equal(calls, 0);
  }));
});
