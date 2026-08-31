import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

const steps = [{ step: "strategy", status: "planned", orchestratorRef: "generateContentStrategyForClient" }] as const;

describe("persistWeeklyCycleRunPlan", () => {
  it("updates only a row that is still dry_run", async () => withServerOnlyStub(async () => {
    const { persistWeeklyCycleRunPlan } = await import("./persist-weekly-cycle-run-plan");
    const filters: Array<[string, string]> = [];
    let updatePayload: unknown;
    const createClient = () => ({
      from: () => ({
        update: (payload: unknown) => {
          updatePayload = payload;
          const chain = {
            eq: (column: string, value: string) => { filters.push([column, value]); return chain; },
            select: () => ({ maybeSingle: async () => ({ data: { id: "run-id" }, error: null }) }),
          };
          return chain;
        },
      }),
    });
    const result = await persistWeeklyCycleRunPlan("run-id", [...steps], createClient as never);
    assert.deepEqual(result, { outcome: "UPDATED" });
    assert.deepEqual(filters, [["id", "run-id"], ["status", "dry_run"]]);
    assert.deepEqual(Object.keys(updatePayload as object).sort(), ["finished_at", "step_log"]);
  }));

  it("reports interleaving without mutating a row that left dry_run", async () => withServerOnlyStub(async () => {
    const { persistWeeklyCycleRunPlan } = await import("./persist-weekly-cycle-run-plan");
    let status = "dry_run";
    const history = [{ step: "live", status: "running" }];
    const mode = "operator";
    const createClient = () => ({
      from: () => ({
        update: (payload: { step_log: unknown; finished_at: string }) => {
          status = "running"; // Simulates another worker winning after acquire.
          const chain = {
            eq: (column: string, value: string) => {
              if (column === "status" && status === value) {
                history.splice(0, history.length, ...(payload.step_log as typeof history));
              }
              return chain;
            },
            select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          };
          return chain;
        },
      }),
    });
    const result = await persistWeeklyCycleRunPlan("run-id", [...steps], createClient as never);
    assert.deepEqual(result, { outcome: "NOT_REPLANNABLE" });
    assert.equal(status, "running");
    assert.equal(mode, "operator");
    assert.deepEqual(history, [{ step: "live", status: "running" }]);
  }));
});
