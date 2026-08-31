import assert from "node:assert/strict";
import Module from "node:module";
import { afterEach, describe, it } from "node:test";

const originalSecret = process.env.CRON_SECRET;
const originalVercelEnv = process.env.VERCEL_ENV;

function loadWithServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = originalVercelEnv;
});

describe("verifyCronSecret", () => {
  it("accepts the valid bearer and rejects missing/wrong bearer", async () => loadWithServerOnlyStub(async () => {
    process.env.CRON_SECRET = "correct-secret";
    const { verifyCronSecret } = await import("./verify-cron-secret");
    assert.deepEqual(verifyCronSecret(new Request("http://local", { headers: { authorization: "Bearer correct-secret" } })), { ok: true });
    assert.deepEqual(verifyCronSecret(new Request("http://local")), { ok: false, status: 401, error: "UNAUTHORIZED" });
    assert.deepEqual(verifyCronSecret(new Request("http://local", { headers: { authorization: "Bearer wrong" } })), { ok: false, status: 401, error: "UNAUTHORIZED" });
  }));

  it("fails closed when production has no configured secret", async () => loadWithServerOnlyStub(async () => {
    delete process.env.CRON_SECRET;
    process.env.VERCEL_ENV = "production";
    const { verifyCronSecret } = await import("./verify-cron-secret");
    assert.deepEqual(verifyCronSecret(new Request("http://local", { headers: { authorization: "Bearer anything" } })), { ok: false, status: 503, error: "SERVICE_UNAVAILABLE" });
  }));
});
