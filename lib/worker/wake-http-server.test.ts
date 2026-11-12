import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startWorkerWakeHttpServer } from "./wake-http-server";

async function listenPort(server: ReturnType<typeof startWorkerWakeHttpServer>): Promise<number> {
  const address = server.address();
  if (address && typeof address === "object") {
    return address.port;
  }
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const next = server.address();
  assert.ok(next && typeof next === "object");
  return next.port;
}

describe("startWorkerWakeHttpServer", () => {
  it("serves healthz and authenticates wake", async () => {
    let wakes = 0;
    const server = startWorkerWakeHttpServer({
      onWake: () => {
        wakes += 1;
      },
      env: {
        NODE_ENV: "test",
        WORKER_WAKE_SECRET: "test-secret",
      },
      port: 0,
    });

    try {
      const port = await listenPort(server);
      const base = `http://127.0.0.1:${port}`;

      const health = await fetch(`${base}/healthz`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { ok: true });

      const unauthorized = await fetch(`${base}/wake`, { method: "POST" });
      assert.equal(unauthorized.status, 401);
      assert.equal(wakes, 0);

      const ok = await fetch(`${base}/wake`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      });
      assert.equal(ok.status, 204);
      assert.equal(wakes, 1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
