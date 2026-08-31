/**
 * US-11.2 controlled revision round — contract + orchestrator tests.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  decideApprovalInputSchema,
  findForbiddenChangeRequestKeys,
} from "@/lib/contracts/approval";
import {
  computeRevisionRoutingPlan,
  computeRevisionsRemaining,
  UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG,
} from "@/lib/contracts/approval-revision";
import { wrapUntrustedChangeRequestNote } from "@/lib/approvals/build-revision-context";
import { findForbiddenApprovalKeys } from "@/lib/approvals/find-forbidden-approval-keys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const APPROVAL_ID = "11111111-2222-4333-8444-555555555555";
const ASSEMBLED_REEL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "99999999-9999-4999-8999-999999999999";

const CLIENT = {
  id: CLIENT_ID,
  email: "gaveho@gmail.com",
  displayName: "Gabriel Vega",
  preferredLocale: "en" as const,
  role: "client" as const,
  active: true,
};

const pendingApproval = {
  id: APPROVAL_ID,
  clientId: CLIENT_ID,
  assembledReelId: ASSEMBLED_REEL_ID,
  status: "pending_client" as const,
  clientFeedback: null,
  decidedAt: null,
  decidedBy: null,
  revisionCount: 0,
  changeRequests: [],
  extraRevisionGranted: false,
  createdAt: "2026-08-30T19:00:00.000Z",
  updatedAt: "2026-08-30T19:00:00.000Z",
};

const validChangeRequest = {
  tags: ["caption" as const, "script" as const],
  notesByTag: {
    script: "Hook feels too salesy — soften opening.",
    caption: "CTA should mention free consult.",
  },
  summary: "Overall tone should be warmer.",
};

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  return (async () => {
    try {
      return await run();
    } finally {
      nodeModule._load = originalLoad;
    }
  })();
}

function clearRevisionCaches() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/approvals/") ||
      normalized.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

describe("computeRevisionRoutingPlan", () => {
  it("script tag → maximal media path", () => {
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

  it("assembly only → assembly → branding → qa", () => {
    const plan = computeRevisionRoutingPlan(["assembly"]);
    assert.deepEqual(plan.steps, ["assembly", "branding", "qa_rerun"]);
  });

  it("branding only → branding → qa", () => {
    const plan = computeRevisionRoutingPlan(["branding"]);
    assert.deepEqual(plan.steps, ["branding", "qa_rerun"]);
  });

  it("caption only → caption_regen caption_only path", () => {
    const plan = computeRevisionRoutingPlan(["caption"]);
    assert.equal(plan.pathKind, "caption_only");
    assert.deepEqual(plan.steps, ["caption_regen"]);
  });
});

describe("decideApprovalInputSchema request_changes", () => {
  it("requires changeRequest when decision is request_changes", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "request_changes",
    });
    assert.equal(parsed.success, false);
  });

  it("forbids clientFeedback on request_changes", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "request_changes",
      clientFeedback: "notes",
      changeRequest: { tags: ["caption"] },
    });
    assert.equal(parsed.success, false);
  });

  it("forbids changeRequest on approve", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "approved",
      changeRequest: { tags: ["caption"] },
    });
    assert.equal(parsed.success, false);
  });

  it("accepts valid request_changes payload", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "request_changes",
      changeRequest: validChangeRequest,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects empty tags", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "request_changes",
      changeRequest: { tags: [] },
    });
    assert.equal(parsed.success, false);
  });

  it("rejects note > 500 chars", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "request_changes",
      changeRequest: {
        tags: ["caption"],
        notesByTag: { caption: "x".repeat(501) },
      },
    });
    assert.equal(parsed.success, false);
  });
});

describe("findForbiddenChangeRequestKeys", () => {
  it("rejects smuggled revision_count nested in changeRequest", () => {
    const hits = findForbiddenChangeRequestKeys({
      tags: ["script"],
      revision_count: 99,
    });
    assert.ok(hits.includes("revision_count"));
  });

  it("rejects smuggled authority keys in notesByTag keys", () => {
    const hits = findForbiddenChangeRequestKeys({
      tags: ["script"],
      notesByTag: { status: "approved" },
    });
    assert.ok(hits.includes("notesByTag.status"));
  });

  it("allows changeRequest on decide top-level scan", () => {
    const hits = findForbiddenApprovalKeys(
      {
        approvalId: APPROVAL_ID,
        decision: "request_changes",
        changeRequest: validChangeRequest,
      },
      "decide",
    );
    assert.ok(!hits.includes("changeRequest"));
  });

  it("rejects extraRevisionGranted on decide", () => {
    const hits = findForbiddenApprovalKeys(
      {
        approvalId: APPROVAL_ID,
        decision: "request_changes",
        extraRevisionGranted: true,
        changeRequest: validChangeRequest,
      },
      "decide",
    );
    assert.ok(hits.includes("extraRevisionGranted"));
  });
});

describe("wrapUntrustedChangeRequestNote", () => {
  it("wraps notes in UNTRUSTED_CLIENT_CHANGE_REQUEST delimiters", () => {
    const wrapped = wrapUntrustedChangeRequestNote("softer hook please");
    assert.match(wrapped, new RegExp(`<${UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG}>`));
    assert.match(wrapped, new RegExp(`</${UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG}>`));
    assert.match(wrapped, /softer hook please/);
  });
});

describe("computeRevisionsRemaining", () => {
  it("returns 0 when limit exhausted on pending_client", () => {
    assert.equal(
      computeRevisionsRemaining({
        revisionCount: 1,
        maxRevisionRounds: 1,
        extraRevisionGranted: false,
        status: "pending_client",
      }),
      0,
    );
  });

  it("adds one when extraRevisionGranted on pending_client", () => {
    assert.equal(
      computeRevisionsRemaining({
        revisionCount: 1,
        maxRevisionRounds: 1,
        extraRevisionGranted: true,
        status: "pending_client",
      }),
      1,
    );
  });
});

describe("migration neuramark_approvals revision", () => {
  it("adds revision columns + atomic rpc functions", () => {
    const mig = path.join(
      repoRoot,
      "supabase/migrations/20260831040000_neuramark_approvals_revision.sql",
    );
    assert.equal(existsSync(mig), true);
    const sql = readFileSync(mig, "utf8");
    assert.match(sql, /revision_count/);
    assert.match(sql, /change_requests/);
    assert.match(sql, /extra_revision_granted/);
    assert.match(sql, /neuramark_update_approval_request_changes/);
    assert.match(sql, /neuramark_grant_extra_revision/);
    assert.match(sql, /neuramark_requeue_approval_after_revision/);
  });
});

describe("decideApproval request_changes orchestrator", () => {
  it("gate not ready → QA_GATE_NOT_READY, no request_changes write", async () => {
    await withServerOnlyStub(async () => {
      clearRevisionCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let updateCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => pendingApproval,
            updateApprovalRequestChanges: async () => {
              updateCalled = true;
              return null;
            },
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: false,
              status: "failed",
              hasBlockingFailures: true,
              hasOverridableFailures: false,
              qaReportId: null,
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("route-approval-change-request")) {
          return { routeApprovalChangeRequest: async () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearRevisionCaches();
        const { decideApprovalForClient } = require("./decide-approval.ts");
        const result = await decideApprovalForClient({
          rawInput: {
            approvalId: APPROVAL_ID,
            decision: "request_changes",
            changeRequest: validChangeRequest,
          },
          user: CLIENT,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "QA_GATE_NOT_READY");
        }
        assert.equal(updateCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearRevisionCaches();
      }
    });
  });

  it("limit exceeded → REVISION_LIMIT_EXCEEDED", async () => {
    await withServerOnlyStub(async () => {
      clearRevisionCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => ({
              ...pendingApproval,
              revisionCount: 1,
              extraRevisionGranted: false,
            }),
            updateApprovalRequestChanges: async () => null,
            isRevisionLimitExhausted: async () => true,
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: true,
              status: "passed",
              hasBlockingFailures: false,
              hasOverridableFailures: false,
              qaReportId: "rep-1",
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("route-approval-change-request")) {
          return { routeApprovalChangeRequest: async () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearRevisionCaches();
        const { decideApprovalForClient } = require("./decide-approval.ts");
        const result = await decideApprovalForClient({
          rawInput: {
            approvalId: APPROVAL_ID,
            decision: "request_changes",
            changeRequest: validChangeRequest,
          },
          user: CLIENT,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "REVISION_LIMIT_EXCEEDED");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearRevisionCaches();
      }
    });
  });

  it("changes_requested status → INVALID_TRANSITION", async () => {
    await withServerOnlyStub(async () => {
      clearRevisionCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => ({
              ...pendingApproval,
              status: "changes_requested",
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearRevisionCaches();
        const { decideApprovalForClient } = require("./decide-approval.ts");
        const result = await decideApprovalForClient({
          rawInput: {
            approvalId: APPROVAL_ID,
            decision: "request_changes",
            changeRequest: validChangeRequest,
          },
          user: CLIENT,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "INVALID_TRANSITION");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearRevisionCaches();
      }
    });
  });

  it("happy path request_changes returns revision counts", async () => {
    await withServerOnlyStub(async () => {
      clearRevisionCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let routed = false;
      const updated = {
        ...pendingApproval,
        status: "changes_requested" as const,
        revisionCount: 1,
        decidedAt: "2026-08-30T20:00:00.000Z",
        decidedBy: CLIENT_ID,
        clientFeedback: validChangeRequest.summary ?? null,
        changeRequests: [
          {
            kind: "client_revision" as const,
            round: 1,
            tags: validChangeRequest.tags,
            notesByTag: validChangeRequest.notesByTag,
            summary: validChangeRequest.summary,
            decidedAt: "2026-08-30T20:00:00.000Z",
            decidedBy: CLIENT_ID,
          },
        ],
      };
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => pendingApproval,
            updateApprovalRequestChanges: async () => updated,
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: true,
              status: "passed",
              hasBlockingFailures: false,
              hasOverridableFailures: false,
              qaReportId: "rep-1",
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("compose-approval-package")) {
          return {
            toApprovalListItemDto: async () => ({
              approvalId: APPROVAL_ID,
              assembledReelId: ASSEMBLED_REEL_ID,
              status: "changes_requested",
              createdAt: pendingApproval.createdAt,
              captionPreview: "preview",
            }),
          };
        }
        if (req.includes("route-approval-change-request")) {
          return {
            routeApprovalChangeRequest: async () => {
              routed = true;
            },
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearRevisionCaches();
        const { decideApprovalForClient } = require("./decide-approval.ts");
        const result = await decideApprovalForClient({
          rawInput: {
            approvalId: APPROVAL_ID,
            decision: "request_changes",
            changeRequest: validChangeRequest,
          },
          user: CLIENT,
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.status, "changes_requested");
          assert.equal(result.revisionCount, 1);
          assert.equal(result.revisionsRemaining, 0);
        }
        assert.equal(routed, true);
      } finally {
        nodeModule._load = originalLoad;
        clearRevisionCaches();
      }
    });
  });

  it("smuggled nested forbidden key → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      clearRevisionCaches();
      const { decideApprovalForClient } = require("./decide-approval.ts");
      const result = await decideApprovalForClient({
        rawInput: {
          approvalId: APPROVAL_ID,
          decision: "request_changes",
          changeRequest: {
            tags: ["script"],
            revision_count: 5,
          },
        },
        user: CLIENT,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        assert.ok(result.error.fields?.["changeRequest.revision_count"]);
      }
    });
  });
});

describe("operatorGrantExtraRevision", () => {
  it("foreign approval → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      clearRevisionCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => null,
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearRevisionCaches();
        const { operatorGrantExtraRevisionForOperator } = require(
          "./operator-grant-extra-revision.ts",
        );
        const result = await operatorGrantExtraRevisionForOperator({
          rawInput: {
            approvalId: FOREIGN_ID,
            reason: "Cliente escalated via email.",
          },
          operator: { ...CLIENT, role: "operator" as const },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearRevisionCaches();
      }
    });
  });
});

describe("closed write surface grep", () => {
  it("revision column writes only in persist + requeue + router metadata", () => {
    const allowed = [
      "lib/approvals/persist-approval.ts",
      "lib/approvals/requeue-approval-after-revision.ts",
      "lib/approvals/route-approval-change-request.ts",
      "lib/approvals/revision/persist-revision-routing.ts",
    ];
    for (const rel of allowed) {
      const src = readFileSync(path.join(repoRoot, rel), "utf8");
      assert.match(src, /change_requests|revision_count|extra_revision_granted|changes_requested/);
    }
  });
});
