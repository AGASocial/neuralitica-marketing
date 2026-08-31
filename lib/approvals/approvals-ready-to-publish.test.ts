/**
 * US-11.3 Ready-to-publish — list, caption export, media attachment tests.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCaptionExportFilename,
  captionExportUrl,
  listApprovedApprovalsInputSchema,
  mediaAttachmentDownloadUrl,
} from "@/lib/contracts/approval";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const APPROVAL_ID = "11111111-2222-4333-8444-555555555555";
const ASSEMBLED_REEL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "99999999-9999-4999-8999-999999999999";
const OUTPUT_ASSET_ID = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

const CLIENT = {
  id: CLIENT_ID,
  email: "gaveho@gmail.com",
  displayName: "Gabriel Vega",
  preferredLocale: "en" as const,
  role: "client" as const,
  active: true,
};

const approvedApproval = {
  id: APPROVAL_ID,
  clientId: CLIENT_ID,
  assembledReelId: ASSEMBLED_REEL_ID,
  status: "approved" as const,
  clientFeedback: null,
  decidedAt: "2026-08-30T19:05:00.000Z",
  decidedBy: CLIENT_ID,
  revisionCount: 0,
  changeRequests: [],
  extraRevisionGranted: false,
  createdAt: "2026-08-30T19:00:00.000Z",
  updatedAt: "2026-08-30T19:05:00.000Z",
};

const pendingApproval = {
  ...approvedApproval,
  status: "pending_client" as const,
  decidedAt: null,
  decidedBy: null,
};

const rejectedApproval = {
  ...approvedApproval,
  status: "rejected" as const,
};

const changesRequestedApproval = {
  ...approvedApproval,
  status: "changes_requested" as const,
};

const readyAssembly = {
  id: ASSEMBLED_REEL_ID,
  clientId: CLIENT_ID,
  reelScriptId: "cccccccc-dddd-4eee-8fff-000000000001",
  status: "completed" as const,
  brandingStatus: "completed" as const,
  outputMediaAssetId: OUTPUT_ASSET_ID,
  coverMediaAssetId: null,
  templateId: "reel_v1_basic",
  primaryVideoAssetId: OUTPUT_ASSET_ID,
  voiceoverAssetId: null,
  scriptUpdatedAt: "2026-08-30T17:00:00.000Z",
  inputFingerprint: "fp",
  targetDurationSec: 30,
  actualDurationSec: 30,
  failureReason: null,
  brandingConfig: null,
  brandingFingerprint: null,
  preBrandingOutputMediaAssetId: null,
  createdAt: "2026-08-30T17:00:00.000Z",
  updatedAt: "2026-08-30T18:00:00.000Z",
};

const readyCaption = {
  id: "cap-1",
  reelScriptId: readyAssembly.reelScriptId,
  clientId: CLIENT_ID,
  record: {
    caption: "This week we open early for locals who need a quick win.",
    hashtags: ["#localbiz", "#consult"],
    keywords: ["local"],
    ctaVariants: ["Book your free consult today."],
  },
  selectedCtaIndex: 0,
  updatedAt: "2026-08-30T18:00:00.000Z",
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

function clearCaches() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/approvals/") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/media/") ||
      normalized.includes("/app/api/")
    ) {
      delete require.cache[key];
    }
  }
}

function mp4MagicBuffer(size = 512): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf.write("ftypisom", 4, "ascii");
  return buf;
}

describe("US-11.3 contract helpers", () => {
  it("buildCaptionExportFilename uses first 8 hex of assembledReelId", () => {
    assert.equal(
      buildCaptionExportFilename(ASSEMBLED_REEL_ID),
      "reel-aaaaaaaa-caption.txt",
    );
  });

  it("download URL helpers match frozen shapes", () => {
    assert.equal(
      mediaAttachmentDownloadUrl(OUTPUT_ASSET_ID),
      `/api/media/assets/${OUTPUT_ASSET_ID}?disposition=attachment`,
    );
    assert.equal(
      captionExportUrl(APPROVAL_ID),
      `/api/approvals/${APPROVAL_ID}/caption.txt`,
    );
  });

  it("listApprovedApprovalsInputSchema is empty strict object", () => {
    assert.equal(listApprovedApprovalsInputSchema.safeParse({}).success, true);
    assert.equal(
      listApprovedApprovalsInputSchema.safeParse({ status: "approved" }).success,
      false,
    );
  });
});

describe("listApprovedApprovals action", () => {
  it("returns approved-only items with decidedAt", async () => {
    await withServerOnlyStub(async () => {
      clearCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("persist-approval")) {
          return {
            listApprovedApprovalsForClient: async () => [approvedApproval],
          };
        }
        if (req.includes("load-assembly-job")) {
          return { loadAssemblyJobScoped: async () => readyAssembly };
        }
        if (req.includes("persist-reel-caption")) {
          return {
            getReelCaptionByScriptId: async () => readyCaption,
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: true,
              status: "passed",
              qaReportId: null,
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("load-reel-script-for-qa")) {
          return {
            loadReelScriptForQa: async () => ({
              id: readyAssembly.reelScriptId,
              mustDiscloseNotOwner: false,
            }),
          };
        }
        if (req.includes("persist-qa-override")) {
          return { loadQaOverridesForReport: async () => [] };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearCaches();
        const { listApprovedApprovals } = require("./actions/list-approved-approvals.ts");
        const result = await listApprovedApprovals();
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.items.length, 1);
          assert.equal(result.items[0]?.status, "approved");
          assert.equal(result.items[0]?.decidedAt, approvedApproval.decidedAt);
          assert.equal(result.items[0]?.videoAssetId, OUTPUT_ASSET_ID);
        }
      } finally {
        nodeModule._load = originalLoad;
        clearCaches();
      }
    });
  });

  it("requireActive failure → UNAUTHENTICATED", async () => {
    await withServerOnlyStub(async () => {
      clearCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => {
              const err = new Error("unauth") as Error & { status: number };
              err.status = 401;
              throw err;
            },
            isAuthGuardError: (error: unknown) =>
              Boolean(
                error &&
                  typeof error === "object" &&
                  "status" in error &&
                  (error as { status: number }).status === 401,
              ),
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearCaches();
        const { listApprovedApprovals } = require("./actions/list-approved-approvals.ts");
        const result = await listApprovedApprovals();
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "UNAUTHENTICATED");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearCaches();
      }
    });
  });
});

describe("GET caption export route", () => {
  it("returns effectiveCaption for approved approval", async () => {
    await withServerOnlyStub(async () => {
      clearCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
            authGuardResponse: () => new Response(null, { status: 401 }),
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => approvedApproval,
          };
        }
        if (req.includes("load-assembly-job")) {
          return { loadAssemblyJobScoped: async () => readyAssembly };
        }
        if (req.includes("persist-reel-caption")) {
          return { getReelCaptionByScriptId: async () => readyCaption };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: true,
              status: "passed",
              qaReportId: null,
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("load-reel-script-for-qa")) {
          return {
            loadReelScriptForQa: async () => ({
              id: readyAssembly.reelScriptId,
              mustDiscloseNotOwner: false,
            }),
          };
        }
        if (req.includes("persist-qa-override")) {
          return { loadQaOverridesForReport: async () => [] };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearCaches();
        const { GET } = require("../../app/api/approvals/[approvalId]/caption.txt/route.ts");
        const res = await GET(new Request("http://localhost/caption"), {
          params: Promise.resolve({ approvalId: APPROVAL_ID }),
        });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("Content-Type"), "text/plain; charset=utf-8");
        assert.match(
          res.headers.get("Content-Disposition") ?? "",
          /attachment; filename="reel-aaaaaaaa-caption.txt"/,
        );
        const body = await res.text();
        assert.match(body, /Book your free consult today/);
        assert.match(body, /#localbiz/);
      } finally {
        nodeModule._load = originalLoad;
        clearCaches();
      }
    });
  });

  it("non-approved approval → 404", async () => {
    await withServerOnlyStub(async () => {
      clearCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
            authGuardResponse: () => new Response(null, { status: 401 }),
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => pendingApproval,
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearCaches();
        const { GET } = require("../../app/api/approvals/[approvalId]/caption.txt/route.ts");
        const res = await GET(new Request("http://localhost/caption"), {
          params: Promise.resolve({ approvalId: APPROVAL_ID }),
        });
        assert.equal(res.status, 404);
        const json = await res.json();
        assert.equal(json.error, "NOT_FOUND");
      } finally {
        nodeModule._load = originalLoad;
        clearCaches();
      }
    });
  });

  it("foreign approval → 404", async () => {
    await withServerOnlyStub(async () => {
      clearCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
            authGuardResponse: () => new Response(null, { status: 401 }),
          };
        }
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
        clearCaches();
        const { GET } = require("../../app/api/approvals/[approvalId]/caption.txt/route.ts");
        const res = await GET(new Request("http://localhost/caption"), {
          params: Promise.resolve({ approvalId: FOREIGN_ID }),
        });
        assert.equal(res.status, 404);
      } finally {
        nodeModule._load = originalLoad;
        clearCaches();
      }
    });
  });

  it("rate limited → 429", async () => {
    await withServerOnlyStub(async () => {
      clearCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
            authGuardResponse: () => new Response(null, { status: 401 }),
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({
              ok: false,
              code: "RATE_LIMITED",
            }),
            recordApprovalAttempt: async () => {},
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearCaches();
        const { GET } = require("../../app/api/approvals/[approvalId]/caption.txt/route.ts");
        const res = await GET(new Request("http://localhost/caption"), {
          params: Promise.resolve({ approvalId: APPROVAL_ID }),
        });
        assert.equal(res.status, 429);
        const json = await res.json();
        assert.equal(json.error, "RATE_LIMITED");
      } finally {
        nodeModule._load = originalLoad;
        clearCaches();
      }
    });
  });
});

describe("media attachment disposition (US-11.3)", () => {
  function installMediaMocks(options: {
    mediaRoot: string;
    hasApprovedLink?: boolean;
    assetClientId?: string;
  }) {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(Module);
    process.env.NEURAMARK_MEDIA_ROOT = options.mediaRoot;

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      const req = String(request);
      if (req.includes("require-user")) {
        return {
          requireActive: async () => CLIENT,
          isAuthGuardError: (error: unknown) =>
            Boolean(
              error &&
                typeof error === "object" &&
                "status" in error &&
                ((error as { status: number }).status === 401 ||
                  (error as { status: number }).status === 403),
            ),
          requireOperator: async () => {
            const err = new Error("forbidden") as Error & { status: number };
            err.status = 403;
            throw err;
          },
          authGuardResponse: () => new Response(null, { status: 403 }),
        };
      }
      if (req.includes("persist-approval")) {
        return {
          hasApprovedApprovalForOutputAsset: async () =>
            options.hasApprovedLink ?? false,
        };
      }
      if (req.includes("lib/supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from: () => ({
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: OUTPUT_ASSET_ID,
                      client_id: options.assetClientId ?? CLIENT_ID,
                      asset_type: "assembled_reel",
                      storage_key: "f6a7b8c9-d0e1-4234-9567-89abcdef0123.mp4",
                      metadata: { detectedMime: "video/mp4", sizeBytes: 80 },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    return () => {
      nodeModule._load = originalLoad;
      delete process.env.NEURAMARK_MEDIA_ROOT;
      clearCaches();
    };
  }

  it("inline default without param on pending-owned asset", async () => {
    await withServerOnlyStub(async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-rtp-inline-"));
      const key = "f6a7b8c9-d0e1-4234-9567-89abcdef0123.mp4";
      const { LocalDiskStorage } = require("../media/storage/local-disk-storage.ts");
      await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
        contentType: "video/mp4",
        sizeBytes: 80,
      });

      const restore = installMediaMocks({ mediaRoot: tmp, hasApprovedLink: false });
      try {
        clearCaches();
        const { resetMediaStorageCacheForTests } = require("../media/storage/get-media-storage.ts");
        resetMediaStorageCacheForTests();
        const { GET } = require("../../app/api/media/assets/[assetId]/route.ts");
        const res = await GET(
          new Request(`http://localhost/api/media/assets/${OUTPUT_ASSET_ID}`),
          { params: Promise.resolve({ assetId: OUTPUT_ASSET_ID }) },
        );
        assert.equal(res.status, 200);
        assert.match(res.headers.get("Content-Disposition") ?? "", /^inline;/);
      } finally {
        restore();
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  it("attachment without approved linkage → 404", async () => {
    await withServerOnlyStub(async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-rtp-att-404-"));
      const key = "f6a7b8c9-d0e1-4234-9567-89abcdef0123.mp4";
      const { LocalDiskStorage } = require("../media/storage/local-disk-storage.ts");
      await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
        contentType: "video/mp4",
        sizeBytes: 80,
      });

      const restore = installMediaMocks({ mediaRoot: tmp, hasApprovedLink: false });
      try {
        clearCaches();
        const { resetMediaStorageCacheForTests } = require("../media/storage/get-media-storage.ts");
        resetMediaStorageCacheForTests();
        const { GET } = require("../../app/api/media/assets/[assetId]/route.ts");
        const res = await GET(
          new Request(
            `http://localhost/api/media/assets/${OUTPUT_ASSET_ID}?disposition=attachment`,
          ),
          { params: Promise.resolve({ assetId: OUTPUT_ASSET_ID }) },
        );
        assert.equal(res.status, 404);
      } finally {
        restore();
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  it("attachment with approved linkage → 200 attachment", async () => {
    await withServerOnlyStub(async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-rtp-att-200-"));
      const key = "f6a7b8c9-d0e1-4234-9567-89abcdef0123.mp4";
      const { LocalDiskStorage } = require("../media/storage/local-disk-storage.ts");
      await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
        contentType: "video/mp4",
        sizeBytes: 80,
      });

      const restore = installMediaMocks({ mediaRoot: tmp, hasApprovedLink: true });
      try {
        clearCaches();
        const { resetMediaStorageCacheForTests } = require("../media/storage/get-media-storage.ts");
        resetMediaStorageCacheForTests();
        const { GET } = require("../../app/api/media/assets/[assetId]/route.ts");
        const res = await GET(
          new Request(
            `http://localhost/api/media/assets/${OUTPUT_ASSET_ID}?disposition=attachment`,
          ),
          { params: Promise.resolve({ assetId: OUTPUT_ASSET_ID }) },
        );
        assert.equal(res.status, 200);
        assert.match(
          res.headers.get("Content-Disposition") ?? "",
          /^attachment; filename="assembled-reel\.mp4"/,
        );
      } finally {
        restore();
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  it("malicious disposition values stay inline", async () => {
    await withServerOnlyStub(async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-rtp-malicious-"));
      const key = "f6a7b8c9-d0e1-4234-9567-89abcdef0123.mp4";
      const { LocalDiskStorage } = require("../media/storage/local-disk-storage.ts");
      await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
        contentType: "video/mp4",
        sizeBytes: 80,
      });

      const restore = installMediaMocks({ mediaRoot: tmp, hasApprovedLink: false });
      try {
        clearCaches();
        const { resetMediaStorageCacheForTests } = require("../media/storage/get-media-storage.ts");
        resetMediaStorageCacheForTests();
        const { GET } = require("../../app/api/media/assets/[assetId]/route.ts");
        const res = await GET(
          new Request(
            `http://localhost/api/media/assets/${OUTPUT_ASSET_ID}?disposition=attachment%3B%20filename%3Devil.exe&filename=../../etc/passwd`,
          ),
          { params: Promise.resolve({ assetId: OUTPUT_ASSET_ID }) },
        );
        assert.equal(res.status, 200);
        const cd = res.headers.get("Content-Disposition") ?? "";
        assert.match(cd, /^inline;/);
        assert.doesNotMatch(cd, /evil/);
      } finally {
        restore();
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  it("foreign asset attachment → 404", async () => {
    await withServerOnlyStub(async () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-rtp-foreign-"));
      const key = "f6a7b8c9-d0e1-4234-9567-89abcdef0123.mp4";
      const { LocalDiskStorage } = require("../media/storage/local-disk-storage.ts");
      await new LocalDiskStorage(tmp).put(key, mp4MagicBuffer(80), {
        contentType: "video/mp4",
        sizeBytes: 80,
      });

      const restore = installMediaMocks({
        mediaRoot: tmp,
        hasApprovedLink: true,
        assetClientId: FOREIGN_ID,
      });
      try {
        clearCaches();
        const { resetMediaStorageCacheForTests } = require("../media/storage/get-media-storage.ts");
        resetMediaStorageCacheForTests();
        const { GET } = require("../../app/api/media/assets/[assetId]/route.ts");
        const res = await GET(
          new Request(
            `http://localhost/api/media/assets/${OUTPUT_ASSET_ID}?disposition=attachment`,
          ),
          { params: Promise.resolve({ assetId: OUTPUT_ASSET_ID }) },
        );
        assert.equal(res.status, 404);
      } finally {
        restore();
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});

describe("closed write surface + log hook (source)", () => {
  it("decide-approval logs approval_ready_to_publish on approve", () => {
    const src = readFileSync(
      path.join(__dirname, "decide-approval.ts"),
      "utf8",
    );
    assert.match(src, /approval_ready_to_publish/);
    assert.match(src, /decision === "approved"/);
  });

  it("caption route is SELECT-only", () => {
    const captionRoute = readFileSync(
      path.join(repoRoot, "app/api/approvals/[approvalId]/caption.txt/route.ts"),
      "utf8",
    );
    assert.doesNotMatch(captionRoute, /\.update\(|\.insert\(/);
    assert.doesNotMatch(captionRoute, /public\/assembled|getPublicUrl/);
  });

  it("listApprovedApprovals calls requireActive first", () => {
    const src = readFileSync(
      path.join(__dirname, "actions/list-approved-approvals.ts"),
      "utf8",
    );
    const fnStart = src.indexOf("export async function listApprovedApprovals");
    const body = src.slice(fnStart);
    const requireIdx = body.indexOf('await requireActive("handler")');
    assert.ok(requireIdx > 0);
    assert.doesNotMatch(body.slice(0, requireIdx), /\bawait\b/);
  });

  it("caption route calls requireActive first", () => {
    const src = readFileSync(
      path.join(repoRoot, "app/api/approvals/[approvalId]/caption.txt/route.ts"),
      "utf8",
    );
    const fnStart = src.indexOf("export async function GET");
    const body = src.slice(fnStart);
    const requireIdx = body.indexOf('await requireActive("handler")');
    assert.ok(requireIdx > 0);
    assert.doesNotMatch(body.slice(0, requireIdx), /\bawait\b/);
  });
});

describe("persist listApprovedApprovalsForClient filters", () => {
  it("returns only approved rows from DB filter", async () => {
    const allStatuses = [
      approvedApproval,
      pendingApproval,
      rejectedApproval,
      changesRequestedApproval,
    ];
    await withServerOnlyStub(async () => {
      clearCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("lib/supabase/server")) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from: (table: string) => {
                if (table !== "neuramark_approvals") {
                  throw new Error(table);
                }
                return {
                  select: () => ({
                    eq: (col: string, val: string) => {
                      if (col === "client_id") {
                        return {
                          eq: (statusCol: string, statusVal: string) => {
                            assert.equal(statusCol, "status");
                            assert.equal(statusVal, "approved");
                            return {
                              order: async () => ({
                                data: allStatuses
                                  .filter((r) => r.status === "approved")
                                  .map((r) => ({
                                    id: r.id,
                                    client_id: r.clientId,
                                    assembled_reel_id: r.assembledReelId,
                                    status: r.status,
                                    client_feedback: r.clientFeedback,
                                    decided_at: r.decidedAt,
                                    decided_by: r.decidedBy,
                                    revision_count: r.revisionCount,
                                    change_requests: r.changeRequests,
                                    extra_revision_granted: r.extraRevisionGranted,
                                    created_at: r.createdAt,
                                    updated_at: r.updatedAt,
                                  })),
                                error: null,
                              }),
                            };
                          },
                        };
                      }
                      throw new Error(`unexpected eq col ${col}=${val}`);
                    },
                  }),
                };
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearCaches();
        const { listApprovedApprovalsForClient } = require("./persist-approval.ts");
        const rows = await listApprovedApprovalsForClient({ clientId: CLIENT_ID });
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.status, "approved");
      } finally {
        nodeModule._load = originalLoad;
        clearCaches();
      }
    });
  });
});
