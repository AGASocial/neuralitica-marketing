import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type Row = Record<string, unknown> & { id: string; status: string };

type Condition =
  | { type: "eq"; col: string; val: unknown }
  | { type: "in"; col: string; vals: unknown[] }
  | { type: "not_in"; col: string; vals: string[] };

/**
 * In-memory fake for `neuramark_weekly_cycle_step_runs` supporting exactly
 * the query shapes `markStepRunTerminal` / `markStepRunPending` /
 * `scheduleStepRunRetry` issue: a guarded `.update(...).eq(...)[.in()|.not()].select("id").maybeSingle()`.
 * This is what actually exercises the real CAS guard (QA M1) — every
 * consumer test elsewhere in this story replaces these functions with a
 * hand-written mock, so none of them can catch a broken guard.
 */
function makeStepRunClient(initialRows: Row[]) {
  const rows = initialRows.map((r) => ({ ...r }));
  const from = (table: string) => {
    if (table !== "neuramark_weekly_cycle_step_runs") throw new Error(`unexpected table ${table}`);
    return {
      update: (patch: Record<string, unknown>) => {
        const conditions: Condition[] = [];
        const builder = {
          eq: (col: string, val: unknown) => {
            conditions.push({ type: "eq", col, val });
            return builder;
          },
          in: (col: string, vals: unknown[]) => {
            conditions.push({ type: "in", col, vals });
            return builder;
          },
          not: (col: string, _op: string, val: string) => {
            const vals = val.replace(/[()]/g, "").split(",");
            conditions.push({ type: "not_in", col, vals });
            return builder;
          },
          select: () => ({
            maybeSingle: async () => {
              const target = rows.find((r) =>
                conditions.every((c) => {
                  if (c.type === "eq") return r[c.col] === c.val;
                  if (c.type === "in") return c.vals.includes(r[c.col]);
                  return !c.vals.includes(r[c.col] as string);
                }),
              );
              if (!target) return { data: null, error: null };
              Object.assign(target, patch);
              return { data: { id: target.id }, error: null };
            },
          }),
        };
        return builder;
      },
      select: () => ({
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => {
            const target = rows.find((r) => r[col] === val);
            return { data: target ? { ...target } : null, error: null };
          },
        }),
      }),
    };
  };
  return { from, getRow: (id: string) => rows.find((r) => r.id === id) };
}

function installMocks(client: { from: (table: string) => unknown }) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "@/lib/supabase/server" || String(request).includes("lib/supabase/server")) {
      return { createServerSupabaseClient: () => client };
    }
    return originalLoad(request, parent, isMain);
  };
  return () => {
    nodeModule._load = originalLoad;
  };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/weekly-cycle-step-runs")) {
      delete require.cache[key];
    }
  }
}

const stepRunId = "33333333-3333-4333-8333-333333333333";

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: stepRunId,
    run_id: "run-1",
    client_id: "client-1",
    slot_index: 0,
    step: "primary_video",
    status: "pending_provider",
    attempt: 1,
    idempotency_key: "wc:run-1:0:primary_video:1",
    job_kind: "video",
    job_id: "job-1",
    error_code: null,
    available_at: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("weekly-cycle-step-runs — CAS guards actually verify the row was matched (QA M1)", () => {
  it("markStepRunTerminal succeeds on a non-terminal row and persists the terminal status", async () => {
    const client = makeStepRunClient([row({ status: "pending_provider" })]);
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { markStepRunTerminal } = require("./weekly-cycle-step-runs.ts");
      const result = await markStepRunTerminal({ stepRunId, status: "completed" });
      assert.equal(result, true);
      assert.equal(client.getRow(stepRunId)?.status, "completed");
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("markStepRunTerminal returns false — not true — when the row is already terminal (idempotent duplicate callback), and does not overwrite it", async () => {
    const client = makeStepRunClient([row({ status: "completed", error_code: null })]);
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { markStepRunTerminal } = require("./weekly-cycle-step-runs.ts");
      const result = await markStepRunTerminal({ stepRunId, status: "failed", errorCode: "PROVIDER_TRANSIENT" });
      assert.equal(result, false, "the guard must report that it did NOT match/transition an already-terminal row");
      assert.equal(client.getRow(stepRunId)?.status, "completed", "the original completed status must be preserved, never clobbered");
      assert.equal(client.getRow(stepRunId)?.error_code, null);
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("markStepRunPending succeeds from ready/dispatch_pending", async () => {
    const client = makeStepRunClient([row({ status: "dispatch_pending" })]);
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { markStepRunPending } = require("./weekly-cycle-step-runs.ts");
      const result = await markStepRunPending({ stepRunId, status: "pending_provider", jobKind: "video", jobId: "job-2" });
      assert.equal(result, true);
      assert.equal(client.getRow(stepRunId)?.status, "pending_provider");
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("markStepRunPending returns false when the row is no longer ready/dispatch_pending (already advanced by a concurrent callback)", async () => {
    const client = makeStepRunClient([row({ status: "pending_provider" })]);
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { markStepRunPending } = require("./weekly-cycle-step-runs.ts");
      const result = await markStepRunPending({ stepRunId, status: "pending_worker", jobKind: "assembly", jobId: "job-3" });
      assert.equal(result, false);
      assert.equal(client.getRow(stepRunId)?.status, "pending_provider", "must not silently overwrite an in-flight row's linkage");
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("scheduleStepRunRetry succeeds on a non-terminal row", async () => {
    const client = makeStepRunClient([row({ status: "dispatch_pending" })]);
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { scheduleStepRunRetry } = require("./weekly-cycle-step-runs.ts");
      const result = await scheduleStepRunRetry({ stepRunId, availableAt: "2026-09-01T00:00:00.000Z" });
      assert.equal(result, true);
      assert.equal(client.getRow(stepRunId)?.status, "ready");
      assert.equal(client.getRow(stepRunId)?.available_at, "2026-09-01T00:00:00.000Z");
    } finally {
      restore();
      clearModuleCache();
    }
  });

  it("scheduleStepRunRetry returns false — not true — on an already-terminal row and does not resurrect it to `ready`", async () => {
    const client = makeStepRunClient([row({ status: "failed", available_at: "2026-08-31T00:00:00.000Z" })]);
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { scheduleStepRunRetry } = require("./weekly-cycle-step-runs.ts");
      const result = await scheduleStepRunRetry({ stepRunId, availableAt: "2026-09-01T00:00:00.000Z" });
      assert.equal(result, false);
      assert.equal(client.getRow(stepRunId)?.status, "failed", "a terminal-failed row must never be silently resurrected to ready");
    } finally {
      restore();
      clearModuleCache();
    }
  });
});
