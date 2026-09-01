import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

/** In-memory single-row `neuramark_content_strategies` fake with real WHERE-clause CAS semantics. */
function makeStrategyRowClient(initialRow: Record<string, unknown>) {
  let row: Record<string, unknown> = { ...initialRow };
  const from = (table: string) => {
    if (table !== "neuramark_content_strategies") throw new Error(`unexpected table ${table}`);
    return {
      update: (patch: Record<string, unknown>) => {
        const conditions: Record<string, unknown> = {};
        const builder = {
          eq: (col: string, val: unknown) => { conditions[col] = val; return builder; },
          select: () => ({
            maybeSingle: async () => {
              const matches = Object.entries(conditions).every(([k, v]) => row[k] === v);
              if (!matches) return { data: null, error: null };
              row = { ...row, ...patch };
              return { data: { id: row.id }, error: null };
            },
          }),
        };
        return builder;
      },
      select: () => {
        const conditions: Record<string, unknown> = {};
        const builder = {
          eq: (col: string, val: unknown) => { conditions[col] = val; return builder; },
          maybeSingle: async () => {
            const matches = Object.entries(conditions).every(([k, v]) => row[k] === v);
            return matches ? { data: { ...row }, error: null } : { data: null, error: null };
          },
        };
        return builder;
      },
    };
  };
  return { from, getRow: () => row };
}

function installSupabaseMock(client: { from: (table: string) => unknown }) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "@/lib/supabase/server" || String(request).includes("lib/supabase/server")) {
      return { isSupabaseConfigured: () => true, createServerSupabaseClient: () => client };
    }
    return originalLoad(request, parent, isMain);
  };
  return () => { nodeModule._load = originalLoad; };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/content-strategy/approve-strategy-for-system-cycle-cas")) {
      delete require.cache[key];
    }
  }
}

const baseParams = {
  strategyId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  weekStart: "2026-08-31",
  expectedVersion: 1,
};

describe("approveStrategyForSystemCycleCas — strategy CAS races", () => {
  it("approves exactly once; a same-run retry is idempotent (ALREADY_APPROVED_BY_RUN)", async () => {
    const client = makeStrategyRowClient({
      id: baseParams.strategyId, client_id: baseParams.clientId, week_start: baseParams.weekStart,
      version: 1, status: "draft", approved_by_actor: null, approved_by_run_id: null, approved_at: null,
    });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { approveStrategyForSystemCycleCas } = require("./approve-strategy-for-system-cycle-cas.ts");
      const runId = "33333333-3333-4333-8333-333333333333";

      const first = await approveStrategyForSystemCycleCas({ ...baseParams, runId });
      assert.equal(first.ok, true);
      assert.equal(first.ok && first.outcome, "APPROVED");

      // Idempotent replay by the exact same run (e.g. retried callback).
      const second = await approveStrategyForSystemCycleCas({ ...baseParams, runId });
      assert.equal(second.ok, true);
      assert.equal(second.ok && second.outcome, "ALREADY_APPROVED_BY_RUN");

      const row = client.getRow();
      assert.equal(row.status, "approved");
      assert.equal(row.approved_by_actor, "system");
      assert.equal(row.approved_by_run_id, runId);
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("rejects a second concurrent winner (different run) as STRATEGY_APPROVAL_CONFLICT — only one run ever wins the race", async () => {
    const client = makeStrategyRowClient({
      id: baseParams.strategyId, client_id: baseParams.clientId, week_start: baseParams.weekStart,
      version: 1, status: "draft", approved_by_actor: null, approved_by_run_id: null, approved_at: null,
    });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { approveStrategyForSystemCycleCas } = require("./approve-strategy-for-system-cycle-cas.ts");
      const runA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const runB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

      const winner = await approveStrategyForSystemCycleCas({ ...baseParams, runId: runA });
      const loser = await approveStrategyForSystemCycleCas({ ...baseParams, runId: runB });

      assert.equal(winner.ok, true);
      assert.equal(winner.ok && winner.outcome, "APPROVED");
      assert.equal(loser.ok, false);
      assert.equal(!loser.ok && loser.code, "STRATEGY_APPROVAL_CONFLICT");
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("rejects a stale expectedVersion as STRATEGY_APPROVAL_CONFLICT without mutating the row", async () => {
    const client = makeStrategyRowClient({
      id: baseParams.strategyId, client_id: baseParams.clientId, week_start: baseParams.weekStart,
      version: 2, status: "draft", approved_by_actor: null, approved_by_run_id: null, approved_at: null,
    });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { approveStrategyForSystemCycleCas } = require("./approve-strategy-for-system-cycle-cas.ts");
      const result = await approveStrategyForSystemCycleCas({ ...baseParams, expectedVersion: 1, runId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.code, "STRATEGY_APPROVAL_CONFLICT");
      assert.equal(client.getRow().status, "draft");
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("rejects a row already approved by the Operator path as a conflict, never overwriting it", async () => {
    const client = makeStrategyRowClient({
      id: baseParams.strategyId, client_id: baseParams.clientId, week_start: baseParams.weekStart,
      version: 1, status: "approved", approved_by_actor: "operator", approved_by_run_id: null, approved_at: "2026-08-30T00:00:00.000Z",
    });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { approveStrategyForSystemCycleCas } = require("./approve-strategy-for-system-cycle-cas.ts");
      const result = await approveStrategyForSystemCycleCas({ ...baseParams, runId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.code, "STRATEGY_APPROVAL_CONFLICT");
      assert.equal(client.getRow().approved_by_actor, "operator");
    } finally {
      restore();
      clearModuleCache();
    }
  });
});
