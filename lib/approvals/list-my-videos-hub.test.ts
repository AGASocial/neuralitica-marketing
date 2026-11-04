import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("listMyVideosHubForClientUser", () => {
  it("loads in-production, pending (with preview URL), and approved", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "list-my-videos-hub.ts"), "utf8");
    const page = readFileSync(
      join(here, "../../app/(app)/ready-to-publish/page.tsx"),
      "utf8",
    );
    const view = readFileSync(
      join(here, "../../components/ready-to-publish/MyVideosHubView.tsx"),
      "utf8",
    );
    assert.match(src, /listPendingApprovalsForClientUser/);
    assert.match(src, /listApprovedApprovalsForClientUser/);
    assert.match(src, /mediaPreviewUrl/);
    assert.match(src, /VIDEO_JOBS_TABLE/);
    assert.match(page, /MyVideosHubView/);
    assert.match(page, /listMyVideosHubForClientUser/);
    assert.match(view, /<video/);
    assert.match(view, /approveCta/);
    assert.match(view, /changeCta/);
    assert.match(view, /sectionInProduction/);
    assert.match(view, /formatLabels/);
    assert.match(view, /assembledAt/);
    assert.match(view, /ClientLocalDateTime/);

    const listGet = readFileSync(
      join(here, "list-get-approvals.ts"),
      "utf8",
    );
    assert.match(listGet, /insertPendingApproval/);
    assert.match(listGet, /loadApprovalByAssembledReelScoped/);
  });
});
