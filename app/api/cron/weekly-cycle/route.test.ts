import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

const summary = { weekStart: "2026-08-31", dryRun: true as const, eligibleCount: 0, skippedCount: 0, processedCount: 0, failedCount: 0, clients: [] };
const requestWithBody = (method: "GET" | "POST", body: unknown) => ({
  method,
  headers: new Headers({ authorization: "Bearer valid" }),
  text: async () => JSON.stringify(body),
}) as Request;
const requestWithRawBody = (method: "GET" | "POST", body: string) => ({
  method,
  headers: new Headers({ authorization: "Bearer valid" }),
  text: async () => body,
}) as Request;

describe("weekly cycle cron route", () => {
  it("runs a valid request and always supplies dryRun true", async () => withServerOnlyStub(async () => {
    const { handleWeeklyCycleCron } = await import("./route");
    let received: unknown;
    const response = await handleWeeklyCycleCron(requestWithBody("GET", {}), {
      verify: () => ({ ok: true }), resolveWeekStart: () => "2026-08-31",
      runBatch: async (params) => { received = params; return summary; },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(received, { weekStart: "2026-08-31", mode: "cron", dryRun: true });
  }));

  it("rejects authenticated malformed non-empty JSON for GET and POST", async () => withServerOnlyStub(async () => {
    const { handleWeeklyCycleCron } = await import("./route");
    for (const method of ["GET", "POST"] as const) {
      let calls = 0;
      const response = await handleWeeklyCycleCron(requestWithRawBody(method, "{\"clientId\":"), {
        verify: () => ({ ok: true }),
        resolveWeekStart: () => { throw new Error("must not resolve week"); },
        runBatch: async () => { calls += 1; return summary; },
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "INVALID_JSON" });
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(calls, 0);
    }
  }));

  it("does not call batch after missing or wrong authentication", async () => withServerOnlyStub(async () => {
    const { handleWeeklyCycleCron } = await import("./route");
    for (const auth of [
      { ok: false as const, status: 401 as const, error: "UNAUTHORIZED" as const },
      { ok: false as const, status: 503 as const, error: "SERVICE_UNAVAILABLE" as const },
    ]) {
      let calls = 0;
      const response = await handleWeeklyCycleCron(requestWithBody("POST", { clientId: "blocked" }), {
        verify: () => auth, resolveWeekStart: () => "2026-08-31",
        runBatch: async () => { calls += 1; return summary; },
      });
      assert.equal(response.status, auth.status);
      assert.equal(calls, 0);
    }
  }));

  it("rejects forbidden GET and POST body authority before batch", async () => withServerOnlyStub(async () => {
    const { handleWeeklyCycleCron } = await import("./route");
    for (const method of ["GET", "POST"] as const) {
      let calls = 0;
      const response = await handleWeeklyCycleCron(requestWithBody(method, { clientId: "untrusted", dryRun: false }), {
        verify: () => ({ ok: true }), resolveWeekStart: () => "2026-08-31",
        runBatch: async () => { calls += 1; return summary; },
      });
      assert.equal(response.status, 400);
      assert.equal(calls, 0);
    }
  }));
});
