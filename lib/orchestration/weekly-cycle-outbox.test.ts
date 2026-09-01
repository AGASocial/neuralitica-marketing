import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type Row = {
  id: string; run_id: string; step_run_id: string; event_kind: string;
  payload: unknown; status: string; dispatch_attempt: number;
  available_at: string; claim_token: string | null; claimed_at?: string | null;
  dispatched_at?: string | null; last_error_code?: string | null;
};

/** In-memory `neuramark_weekly_cycle_outbox` fake enforcing the real unique(step_run_id) constraint. */
function makeOutboxClient() {
  const rows: Row[] = [];
  let nextId = 1;
  const from = (table: string) => {
    if (table !== "neuramark_weekly_cycle_outbox") throw new Error(`unexpected table ${table}`);
    return {
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            const conflict = rows.find((r) => r.step_run_id === payload.step_run_id);
            if (conflict) {
              return { data: null, error: { code: "23505" } };
            }
            const row: Row = {
              id: `outbox-${nextId++}`,
              run_id: payload.run_id as string,
              step_run_id: payload.step_run_id as string,
              event_kind: payload.event_kind as string,
              payload: payload.payload,
              status: "pending",
              dispatch_attempt: 0,
              available_at: new Date().toISOString(),
              claim_token: null,
            };
            rows.push(row);
            return { data: { ...row }, error: null };
          },
        }),
      }),
      select: () => {
        const inFilters: [string, unknown[]][] = [];
        let lteAvailable: string | null = null;
        let stepRunIdEq: string | null = null;
        const builder = {
          eq: (col: string, val: unknown) => {
            if (col === "step_run_id") stepRunIdEq = val as string;
            return builder;
          },
          in: (col: string, vals: unknown[]) => { inFilters.push([col, vals]); return builder; },
          lte: (_col: string, val: string) => { lteAvailable = val; return builder; },
          order: () => builder,
          maybeSingle: async () => {
            if (stepRunIdEq !== null) {
              const row = rows.find((r) => r.step_run_id === stepRunIdEq);
              return { data: row ? { ...row } : null, error: null };
            }
            return { data: null, error: null };
          },
          // `.limit(n)` in the real client resolves to `{ data, error }` when awaited.
          limit: async (n: number) => {
            let filtered = rows.slice();
            for (const [col, vals] of inFilters) {
              filtered = filtered.filter((r) => vals.includes((r as unknown as Record<string, unknown>)[col]));
            }
            if (lteAvailable) filtered = filtered.filter((r) => r.available_at <= lteAvailable!);
            return { data: filtered.slice(0, n).map((r) => ({ ...r })), error: null };
          },
        };
        return builder;
      },
      update: (patch: Record<string, unknown>) => {
        const conditions: [string, unknown][] = [];
        let lteAvailable: string | null = null;
        let orExpr: string | null = null;
        const builder = {
          eq: (col: string, val: unknown) => { conditions.push([col, val]); return builder; },
          lte: (_col: string, val: string) => { lteAvailable = val; return builder; },
          or: (expr: string) => { orExpr = expr; return builder; },
          select: () => ({
            maybeSingle: async () => {
              const target = rows.find((r) => conditions.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
              if (!target) return { data: null, error: null };
              if (lteAvailable && target.available_at > lteAvailable) return { data: null, error: null };
              if (orExpr) {
                const staleCutoffMatch = orExpr.match(/claimed_at\.lte\.(.+)\)$/);
                const staleCutoff = staleCutoffMatch?.[1] ?? null;
                const isPending = target.status === "pending";
                const isStaleClaimed = target.status === "claimed" && staleCutoff !== null && (target.claimed_at ?? "") <= staleCutoff;
                if (!isPending && !isStaleClaimed) return { data: null, error: null };
              }
              Object.assign(target, patch);
              return { data: { ...target }, error: null };
            },
          }),
        };
        // Non-select updates (markOutboxDispatched/Retry/Failed) await the builder directly.
        (builder as unknown as { then: (resolve: (v: { error: null }) => void) => void }).then = (resolve) => {
          const target = rows.find((r) => conditions.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
          if (target) Object.assign(target, patch);
          resolve({ error: null });
        };
        return builder;
      },
    };
  };
  return {
    from,
    getRows: () => rows.map((r) => ({ ...r })),
    /** Test-only escape hatch to simulate elapsed time on a stored row. */
    mutateRow: (id: string, patch: Partial<Row>) => {
      const target = rows.find((r) => r.id === id);
      if (target) Object.assign(target, patch);
    },
  };
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
  return () => { nodeModule._load = originalLoad; };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/weekly-cycle-outbox")) {
      delete require.cache[key];
    }
  }
}

const runId = "11111111-1111-4111-8111-111111111111";
const stepRunId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "wc:11111111-1111-4111-8111-111111111111:0:assembly:1";

describe("weekly cycle outbox — crash-before/after-dispatch recovery", () => {
  it("enqueue is idempotent on the unique(step_run_id) conflict — a crash-before-dispatch retry reloads the same row instead of duplicating it", async () => {
    const client = makeOutboxClient();
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { enqueueOutboxForStepRun } = require("./weekly-cycle-outbox.ts");
      const first = await enqueueOutboxForStepRun({ runId, stepRunId, eventKind: "dispatch_worker", idempotencyKey });
      // Simulates a crash right after the DB write but before the caller
      // observed success — the retry hits the unique constraint and must
      // reload the exact same row, never a second submission.
      const second = await enqueueOutboxForStepRun({ runId, stepRunId, eventKind: "dispatch_worker", idempotencyKey });
      assert.ok(first);
      assert.ok(second);
      assert.equal(first?.id, second?.id);
      assert.equal(client.getRows().length, 1);
    } finally { restore(); clearModuleCache(); }
  });

  it("a claimed-but-not-yet-dispatched row is NOT claimable again while fresh (crash window still open, not yet stale)", async () => {
    const client = makeOutboxClient();
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { enqueueOutboxForStepRun, claimOutboxRow, listClaimableOutboxRows } = require("./weekly-cycle-outbox.ts");
      const row = await enqueueOutboxForStepRun({ runId, stepRunId, eventKind: "dispatch_worker", idempotencyKey });
      const firstClaim = await claimOutboxRow(row.id);
      assert.ok(firstClaim);
      assert.equal(firstClaim?.row.status, "claimed");

      // A second worker pass, moments later, must not see it as claimable —
      // it is neither pending nor a stale claim yet.
      const claimable = await listClaimableOutboxRows(10);
      assert.deepEqual(claimable.map((r: { id: string }) => r.id), []);
    } finally { restore(); clearModuleCache(); }
  });

  it("a stale claimed row (crash after claim, before dispatch) is reclaimable with a new token", async () => {
    const client = makeOutboxClient();
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { enqueueOutboxForStepRun, claimOutboxRow, listClaimableOutboxRows } = require("./weekly-cycle-outbox.ts");
      const row = await enqueueOutboxForStepRun({ runId, stepRunId, eventKind: "dispatch_worker", idempotencyKey });
      const firstClaim = await claimOutboxRow(row.id);
      assert.ok(firstClaim);

      // Simulate the claim going stale (worker crashed mid-dispatch): backdate
      // claimed_at and available_at past the 5-minute staleness window.
      const staleAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      client.mutateRow(row.id, { claimed_at: staleAt, available_at: staleAt });

      const claimable = await listClaimableOutboxRows(10);
      assert.deepEqual(claimable.map((r: { id: string }) => r.id), [row.id]);

      const reclaim = await claimOutboxRow(row.id);
      assert.ok(reclaim);
      assert.notEqual(reclaim?.claimToken, firstClaim?.claimToken);
    } finally { restore(); clearModuleCache(); }
  });

  it("QA M2: a row that sat pending for a long time (stale available_at) but was JUST claimed (fresh claimed_at) is NOT listed as claimable — staleness must key off claimed_at, not available_at", async () => {
    const client = makeOutboxClient();
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { enqueueOutboxForStepRun, claimOutboxRow, listClaimableOutboxRows } = require("./weekly-cycle-outbox.ts");
      const row = await enqueueOutboxForStepRun({ runId, stepRunId, eventKind: "dispatch_worker", idempotencyKey });

      // Simulate the row having sat `pending` for well over the 5-minute
      // staleness window before a worker finally picked it up — routine
      // under cron cadence / backlog, and unrelated to claim freshness.
      const longAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      client.mutateRow(row.id, { available_at: longAgo });

      const firstClaim = await claimOutboxRow(row.id);
      assert.ok(firstClaim, "the stale available_at must not block the initial legitimate claim");
      assert.equal(firstClaim?.row.status, "claimed");

      // The claim was just taken (claimed_at is fresh, "now") — a second
      // worker pass moments later must NOT see it as a stale/reclaimable
      // candidate, even though available_at is still far in the past.
      const claimable = await listClaimableOutboxRows(10);
      assert.deepEqual(
        claimable.map((r: { id: string }) => r.id),
        [],
        "a freshly-claimed row must not be reclaimable just because its available_at happens to be old",
      );
    } finally { restore(); clearModuleCache(); }
  });

  it("markOutboxDispatched / markOutboxRetry / markOutboxFailed transition status without losing the row", async () => {
    const client = makeOutboxClient();
    const restore = installMocks(client);
    try {
      clearModuleCache();
      const { enqueueOutboxForStepRun, markOutboxDispatched, markOutboxRetry, markOutboxFailed } = require("./weekly-cycle-outbox.ts");
      const row = await enqueueOutboxForStepRun({ runId, stepRunId, eventKind: "dispatch_provider", idempotencyKey });

      const dispatched = await markOutboxDispatched(row.id);
      assert.equal(dispatched, true);
      assert.equal(client.getRows()[0]?.status, "dispatched");

      const retried = await markOutboxRetry({ outboxId: row.id, dispatchAttempt: 1, availableAt: "2026-09-01T00:00:00.000Z", errorCode: "PROVIDER_TRANSIENT" });
      assert.equal(retried, true);
      assert.equal(client.getRows()[0]?.status, "pending");
      assert.equal(client.getRows()[0]?.dispatch_attempt, 1);

      const failed = await markOutboxFailed({ outboxId: row.id, errorCode: "BUDGET_EXCEEDED" });
      assert.equal(failed, true);
      assert.equal(client.getRows()[0]?.status, "failed");
      assert.equal(client.getRows()[0]?.last_error_code, "BUDGET_EXCEEDED");
    } finally { restore(); clearModuleCache(); }
  });
});
