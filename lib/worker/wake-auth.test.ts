import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyWorkerWakeAuthorization } from "./wake-auth";

describe("verifyWorkerWakeAuthorization", () => {
  it("rejects when secret is unset in non-production", () => {
    const result = verifyWorkerWakeAuthorization("Bearer anything", {
      NODE_ENV: "test",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.error, "UNAUTHORIZED");
    }
  });

  it("rejects with 503 when secret unset in production-like env", () => {
    const result = verifyWorkerWakeAuthorization("Bearer anything", {
      NODE_ENV: "production",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.equal(result.error, "SERVICE_UNAVAILABLE");
    }
  });

  it("rejects with 503 when secret unset on Fly", () => {
    const result = verifyWorkerWakeAuthorization("Bearer anything", {
      NODE_ENV: "test",
      FLY_APP_NAME: "neuralitica-marketing-worker",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
    }
  });

  it("rejects missing or wrong bearer", () => {
    const env = {
      NODE_ENV: "test",
      WORKER_WAKE_SECRET: "correct-secret",
    } as NodeJS.ProcessEnv;
    assert.equal(verifyWorkerWakeAuthorization(undefined, env).ok, false);
    assert.equal(verifyWorkerWakeAuthorization("Token x", env).ok, false);
    assert.equal(
      verifyWorkerWakeAuthorization("Bearer wrong-secret", env).ok,
      false,
    );
  });

  it("accepts matching bearer secret", () => {
    const env = {
      NODE_ENV: "test",
      WORKER_WAKE_SECRET: "correct-secret",
    } as NodeJS.ProcessEnv;
    const result = verifyWorkerWakeAuthorization(
      "Bearer correct-secret",
      env,
    );
    assert.equal(result.ok, true);
  });
});
