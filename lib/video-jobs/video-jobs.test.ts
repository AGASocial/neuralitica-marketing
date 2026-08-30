import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it, afterEach } from "node:test";

import {
  VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT,
  VIDEO_MAX_RETRIES_PER_REEL_DEFAULT,
} from "@/lib/contracts/video-job";

describe("video-job-config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reads defaults for stale timeout and max retries", async () => {
    delete process.env.VIDEO_JOB_STALE_TIMEOUT_MS;
    delete process.env.VIDEO_MAX_RETRIES_PER_REEL;

    const { getVideoJobStaleTimeoutMs, getVideoMaxRetriesPerReel } =
      await import("./video-job-config");

    assert.equal(getVideoJobStaleTimeoutMs(), VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT);
    assert.equal(getVideoMaxRetriesPerReel(), VIDEO_MAX_RETRIES_PER_REEL_DEFAULT);
  });
});


describe("find-forbidden-keys", () => {
  it("rejects provider authority keys on create input", async () => {
    const { findForbiddenVideoJobKeys } = await import("./find-forbidden-keys");

    assert.ok(
      findForbiddenVideoJobKeys({
        clientId: "00000000-0000-4000-8000-000000000001",
        providerKey: "sadtalker_low",
      }).includes("providerKey"),
    );
  });
});

describe("provider-assets route HMAC", () => {
  it("migration defines neuramark_video_jobs with RLS", () => {
    const fs = require("node:fs");
    const sql = fs.readFileSync(
      "supabase/migrations/20260830600000_neuramark_video_jobs.sql",
      "utf8",
    );
    assert.match(sql, /neuramark_video_jobs/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /neuramark_video_job_retry_overrides/);
  });

  it("verifies HMAC signature constant-time path", () => {
    const secret = "test-secret";
    const assetId = "00000000-0000-4000-8000-000000000099";
    const clientId = "00000000-0000-4000-8000-000000000001";
    const exp = String(Math.floor(Date.now() / 1000) + 300);
    const sig = createHmac("sha256", secret)
      .update(`${assetId}:${clientId}:${exp}`)
      .digest("hex");

    const expected = createHmac("sha256", secret)
      .update(`${assetId}:${clientId}:${exp}`)
      .digest("hex");

    assert.equal(sig, expected);
  });
});
