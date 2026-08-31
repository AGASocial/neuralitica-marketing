/**
 * US-11.2 revision pipeline hooks — media-pipeline-engineer slice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  computeRevisionRoutingPlan,
  UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG,
} from "@/lib/contracts/approval-revision";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

describe("US-11.2 revision routing plan", () => {
  it("script tag expands to full media path with qa_rerun", () => {
    const plan = computeRevisionRoutingPlan(["script", "caption"]);
    assert.equal(plan.pathKind, "media");
    assert.deepEqual(plan.steps, [
      "script_regen",
      "video_job",
      "tts",
      "assembly",
      "branding",
      "qa_rerun",
    ]);
  });

  it("assembly-only expands to assembly → branding → qa_rerun", () => {
    const plan = computeRevisionRoutingPlan(["assembly"]);
    assert.equal(plan.pathKind, "media");
    assert.deepEqual(plan.steps, ["assembly", "branding", "qa_rerun"]);
  });

  it("branding-only expands to branding → qa_rerun", () => {
    const plan = computeRevisionRoutingPlan(["branding"]);
    assert.deepEqual(plan.steps, ["branding", "qa_rerun"]);
  });

  it("caption-only expands to caption_regen without qa_rerun", () => {
    const plan = computeRevisionRoutingPlan(["caption"]);
    assert.equal(plan.pathKind, "caption_only");
    assert.deepEqual(plan.steps, ["caption_regen"]);
  });
});

describe("US-11.2 revision pipeline wiring", () => {
  it("exports router hooks from revision index", () => {
    const indexSrc = readFileSync(
      path.join(repoRoot, "lib/approvals/revision/index.ts"),
      "utf8",
    );
    assert.match(indexSrc, /enqueueRevisionPipelineStep/);
    assert.match(indexSrc, /continueRevisionPipelineAfterStep/);
    assert.match(indexSrc, /tryRequeueAfterRevisionForAssembledReel/);
    assert.match(indexSrc, /onVideoJobCompletedRevision/);
  });

  it("requeueApprovalAfterRevision checks gate before requeue", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/approvals/requeue-approval-after-revision.ts"),
      "utf8",
    );
    assert.match(src, /import "server-only"/);
    assert.match(src, /getQaGateStatusForAssembledReel/);
    assert.match(src, /changes_requested/);
    assert.match(src, /requeueApprovalRow/);
    assert.match(src, /revalidatePath\("\/approvals"\)/);
  });

  it("revision-pipeline-seams wires assembly branding video tts", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/approvals/revision-pipeline-seams.ts"),
      "utf8",
    );
    assert.match(src, /createAssemblyJobForClientTrusted/);
    assert.match(src, /source: "revision"/);
    assert.match(src, /createTalkingHeadVideoJob/);
    assert.match(src, /synthesizeVoiceoverForClientTrusted/);
    assert.match(src, /continueRevisionPipelineAfterStep/);
  });

  it("onBrandingCompleted chains revision QA and requeue hook", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/qa/on-branding-completed.ts"),
      "utf8",
    );
    assert.match(src, /loadActiveRevisionForAssembledReel/);
    assert.match(src, /"revision"/);
    assert.match(src, /tryRequeueAfterRevisionForAssembledReel/);
  });

  it("caption regen calls requeue on revision path", () => {
    const src = readFileSync(
      path.join(
        repoRoot,
        "lib/reel-captions/generate-reel-captions-for-client.ts",
      ),
      "utf8",
    );
    assert.match(src, /invokedBy === "revision"/);
    assert.match(src, /requeueApprovalAfterRevision/);
    assert.match(src, /pathKind: "caption_only"/);
  });

  it("video job completion chains revision pipeline", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/video-jobs/apply-video-job-status-update.ts"),
      "utf8",
    );
    assert.match(src, /onVideoJobCompletedRevision/);
  });

  it("assembly trusted path supports revision invoke", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/assembly/create-assembly-job-for-reel-script.ts"),
      "utf8",
    );
    assert.match(src, /createAssemblyJobForClientTrusted/);
    assert.match(src, /invokedBy: "operator" \| "revision"/);
  });

  it("qaInvokerSchema includes revision", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/contracts/qa-report.ts"),
      "utf8",
    );
    assert.match(src, /qaInvokerSchema = z\.enum\(\["operator", "system", "revision"\]\)/);
  });

  it("router idempotency guard uses routingStartedAt", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/approvals/route-approval-change-request.ts"),
      "utf8",
    );
    assert.match(src, /routingStartedAt/);
    assert.match(src, /markRevisionRoutingStarted/);
  });

  it("UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG is exported for content-agents", () => {
    assert.equal(
      UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG,
      "UNTRUSTED_CLIENT_CHANGE_REQUEST",
    );
  });
});
