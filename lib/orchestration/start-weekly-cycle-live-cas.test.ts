import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

/** In-memory single-row `neuramark_weekly_cycle_runs` fake with WHERE-clause CAS semantics. */
function makeRunRowClient(initialRow: Record<string, unknown>) {
  let row: Record<string, unknown> = { ...initialRow };
  const from = (table: string) => {
    if (table !== "neuramark_weekly_cycle_runs") throw new Error(`unexpected table ${table}`);
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
      return { createServerSupabaseClient: () => client };
    }
    return originalLoad(request, parent, isMain);
  };
  return () => { nodeModule._load = originalLoad; };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/start-weekly-cycle-live-cas")) {
      delete require.cache[key];
    }
  }
}

const params = {
  runId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  weekStart: "2026-08-31",
};

describe("startWeeklyCycleLiveCas — one-way dry_run -> running aggregate transition", () => {
  it("starts a dry_run row exactly once", async () => {
    const client = makeRunRowClient({ id: params.runId, client_id: params.clientId, week_start: params.weekStart, status: "dry_run" });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { startWeeklyCycleLiveCas } = require("./start-weekly-cycle-live-cas.ts");
      const result = await startWeeklyCycleLiveCas(params);
      assert.deepEqual(result, { outcome: "STARTED", runId: params.runId });
      assert.equal(client.getRow().status, "running");
      assert.ok(client.getRow().live_started_at);
    } finally { restore(); clearModuleCache(); }
  });

  it("never transitions back: a second call after STARTED reports ALREADY_STARTED, not a fresh start", async () => {
    const client = makeRunRowClient({ id: params.runId, client_id: params.clientId, week_start: params.weekStart, status: "dry_run" });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { startWeeklyCycleLiveCas } = require("./start-weekly-cycle-live-cas.ts");
      const first = await startWeeklyCycleLiveCas(params);
      const second = await startWeeklyCycleLiveCas(params);
      assert.equal(first.outcome, "STARTED");
      assert.equal(second.outcome, "ALREADY_STARTED");
    } finally { restore(); clearModuleCache(); }
  });

  it("reports ALREADY_STARTED for a paused row (never re-runs live_started_at)", async () => {
    const client = makeRunRowClient({ id: params.runId, client_id: params.clientId, week_start: params.weekStart, status: "paused" });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { startWeeklyCycleLiveCas } = require("./start-weekly-cycle-live-cas.ts");
      const result = await startWeeklyCycleLiveCas(params);
      assert.equal(result.outcome, "ALREADY_STARTED");
      assert.equal(client.getRow().status, "paused");
    } finally { restore(); clearModuleCache(); }
  });

  for (const status of ["completed", "failed", "partial_failed"] as const) {
    it(`reports NOT_DRY_RUN for a terminal/${status} row, never CAS-transitioning it`, async () => {
      const client = makeRunRowClient({ id: params.runId, client_id: params.clientId, week_start: params.weekStart, status });
      const restore = installSupabaseMock(client);
      try {
        clearModuleCache();
        const { startWeeklyCycleLiveCas } = require("./start-weekly-cycle-live-cas.ts");
        const result = await startWeeklyCycleLiveCas(params);
        assert.equal(result.outcome, "NOT_DRY_RUN");
        assert.equal(client.getRow().status, status);
      } finally { restore(); clearModuleCache(); }
    });
  }

  it("scopes the CAS to the exact client_id/week_start — a mismatched scope never starts the row", async () => {
    const client = makeRunRowClient({ id: params.runId, client_id: "other-client", week_start: params.weekStart, status: "dry_run" });
    const restore = installSupabaseMock(client);
    try {
      clearModuleCache();
      const { startWeeklyCycleLiveCas } = require("./start-weekly-cycle-live-cas.ts");
      const result = await startWeeklyCycleLiveCas(params);
      // Update fails scope match; fallback load also filters only by id in
      // the real query — here the row is still returned with its true status.
      assert.equal(result.outcome, "NOT_DRY_RUN");
      assert.equal(client.getRow().status, "dry_run");
    } finally { restore(); clearModuleCache(); }
  });
});
