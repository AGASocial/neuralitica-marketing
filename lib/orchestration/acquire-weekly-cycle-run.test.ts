import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

function ledgerClient() {
  const rows = new Map<string, { id: string; status: "dry_run" }>();
  let inserts = 0;
  const createClient = () => ({
    from: () => ({
      upsert: (payload: { client_id: string; week_start: string }) => ({
        select: () => ({ maybeSingle: async () => {
          const key = `${payload.client_id}:${payload.week_start}`;
          if (rows.has(key)) return { data: null, error: null };
          inserts += 1;
          const row = { id: `00000000-0000-4000-8000-${String(inserts).padStart(12, "0")}`, status: "dry_run" as const };
          rows.set(key, row);
          return { data: row, error: null };
        } }),
      }),
      select: () => {
        let clientId = "";
        let weekStart = "";
        const chain = {
          eq: (column: string, value: string) => { if (column === "client_id") clientId = value; else weekStart = value; return chain; },
          single: async () => ({ data: rows.get(`${clientId}:${weekStart}`) ?? null, error: null }),
        };
        return chain;
      },
    }),
  });
  return { createClient: createClient as never, insertCount: () => inserts };
}

describe("acquireWeeklyCycleRun", () => {
  it("creates once, then returns the existing run", async () => withServerOnlyStub(async () => {
    const { acquireWeeklyCycleRun } = await import("./acquire-weekly-cycle-run");
    const ledger = ledgerClient();
    const params = { clientId: "11111111-1111-4111-8111-111111111111", weekStart: "2026-08-31", mode: "cron" as const };
    const first = await acquireWeeklyCycleRun(params, ledger.createClient);
    const second = await acquireWeeklyCycleRun(params, ledger.createClient);
    assert.equal(first.outcome, "CREATED");
    assert.equal(second.outcome, "ALREADY_EXISTS");
    assert.equal(second.runId, first.runId);
    assert.equal(ledger.insertCount(), 1);
  }));

  it("allows only one winner under concurrent acquire", async () => withServerOnlyStub(async () => {
    const { acquireWeeklyCycleRun } = await import("./acquire-weekly-cycle-run");
    const ledger = ledgerClient();
    const params = { clientId: "11111111-1111-4111-8111-111111111111", weekStart: "2026-08-31", mode: "cron" as const };
    const results = await Promise.all(Array.from({ length: 8 }, () => acquireWeeklyCycleRun(params, ledger.createClient)));
    assert.equal(results.filter((item) => item.outcome === "CREATED").length, 1);
    assert.equal(new Set(results.map((item) => item.runId)).size, 1);
    assert.equal(ledger.insertCount(), 1);
  }));
});
