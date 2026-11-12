import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORKER_WAKE_TIMEOUT_MS_DEFAULT,
  pingWorkerWake,
  scheduleWorkerWakeTask,
} from "./ping-worker-wake";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("pingWorkerWake", () => {
  it("skips when secret or url is unset", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    };

    pingWorkerWake("video", {
      env: { NODE_ENV: "test" },
      fetchFn,
    });
    pingWorkerWake("video", {
      env: {
        NODE_ENV: "test",
        WORKER_WAKE_SECRET: "secret",
      },
      fetchFn,
    });
    pingWorkerWake("assembly", {
      env: {
        NODE_ENV: "test",
        WORKER_WAKE_URL_ASSEMBLY: "https://example.test/wake",
      },
      fetchFn,
    });
    await flushMicrotasks();
    assert.equal(calls, 0);
  });

  it("posts bearer auth via schedule without blocking", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let finishFetch!: (value: Response) => void;
    const fetchFn: typeof fetch = (input, init) => {
      calls.push({
        url: String(input),
        init,
      });
      return new Promise<Response>((resolve) => {
        finishFetch = (value) => resolve(value);
      });
    };

    const scheduled: Array<() => void | Promise<void>> = [];
    const started = Date.now();
    pingWorkerWake("branding", {
      env: {
        NODE_ENV: "test",
        WORKER_WAKE_SECRET: "secret",
        WORKER_WAKE_URL_BRANDING: "https://worker.example/wake",
      },
      fetchFn,
      schedule: (task) => {
        scheduled.push(task);
      },
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 100, `ping should return immediately, elapsed=${elapsed}`);
    assert.equal(scheduled.length, 1);
    assert.equal(calls.length, 0);

    void scheduled[0]?.();
    await flushMicrotasks();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://worker.example/wake");
    assert.equal(calls[0]?.init?.method, "POST");
    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get("authorization"), "Bearer secret");
    assert.ok(calls[0]?.init?.signal instanceof AbortSignal);

    finishFetch(new Response(null, { status: 204 }));
    await flushMicrotasks();
  });


  it("aborts on timeout and does not throw to caller", async () => {
    const fetchFn: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });

    assert.doesNotThrow(() => {
      pingWorkerWake("video", {
        env: {
          NODE_ENV: "test",
          WORKER_WAKE_SECRET: "secret",
          WORKER_WAKE_URL_VIDEO: "https://worker.example/wake",
        },
        fetchFn,
        timeoutMs: 20,
        schedule: (task) => {
          void task();
        },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(WORKER_WAKE_TIMEOUT_MS_DEFAULT, 1_500);
  });

  it("falls back to fire-and-forget when schedule throws", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    };

    assert.doesNotThrow(() => {
      pingWorkerWake("video", {
        env: {
          NODE_ENV: "test",
          WORKER_WAKE_SECRET: "secret",
          WORKER_WAKE_URL_VIDEO: "https://worker.example/wake",
        },
        fetchFn,
        schedule: () => {
          throw new Error("after() outside request scope");
        },
      });
    });

    await flushMicrotasks();
    assert.equal(calls, 1);
  });
});

describe("scheduleWorkerWakeTask", () => {
  it("invokes injected schedule and does not throw when schedule throws", async () => {
    let ran = false;
    scheduleWorkerWakeTask(
      () => {
        ran = true;
      },
      () => {
        throw new Error("no request scope");
      },
    );
    await flushMicrotasks();
    assert.equal(ran, true);
  });
});
