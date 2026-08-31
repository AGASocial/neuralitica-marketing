/**
 * US-12.1 Operator content calendar — contracts, sync, status, action, media.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  calendarMediaPreviewPathSchema,
  calendarSlotDetailDtoSchema,
  findForbiddenCalendarKeys,
  getOperatorCalendarForWeekInputSchema,
  getOperatorCalendarForWeekSuccessSchema,
} from "@/lib/contracts/calendar";
import { reelMetricsDtoSchema } from "@/lib/contracts/reel-metrics";
import { deriveCalendarPipelineStatus } from "@/lib/calendar/derive-calendar-pipeline-status";
import { mapSlotScheduledDate } from "@/lib/calendar/map-slot-scheduled-date";
import { PENDING_REEL_CAPTION_SUMMARY } from "@/lib/contracts/reel-caption";

const WEEK_START = "2026-08-31";
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "33333333-3333-4333-8333-333333333333";
const STRATEGY_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ASSET_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const VALID_BRIEF = {
  pillars: ["Trust"],
  themes: ["Promo"],
  slots: [
    {
      slotIndex: 0,
      dayOfWeek: "monday" as const,
      tema: "Promo del martes",
      goal: "local_sale" as const,
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless" as const,
    },
    {
      slotIndex: 1,
      dayOfWeek: "wednesday" as const,
      tema: "Tips",
      goal: "education" as const,
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless" as const,
    },
    {
      slotIndex: 2,
      tema: "Friday offer",
      goal: "local_sale" as const,
      formatoPlaybookSlug: "tip-rapido",
      modalidad: "faceless" as const,
    },
  ],
};

const operatorUser = {
  id: OPERATOR_ID,
  email: "operator@example.com",
  displayName: "Operator",
  preferredLocale: "en" as const,
  role: "operator" as const,
  active: true,
};

const clientUser = {
  id: CLIENT_A,
  email: "client@example.com",
  displayName: "Cliente",
  preferredLocale: "en" as const,
  role: "client" as const,
  active: true,
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
    return originalLoad.call(this, request, parent, isMain);
  };
  return run().finally(() => {
    nodeModule._load = originalLoad;
  });
}

function readSrc(relativeFromLib: string): string {
  return readFileSync(path.join(__dirname, relativeFromLib), "utf8");
}

describe("mapSlotScheduledDate", () => {
  it("uses dayOfWeek offset from ISO Monday week_start", () => {
    assert.equal(
      mapSlotScheduledDate({
        weekStart: WEEK_START,
        slotIndex: 0,
        dayOfWeek: "wednesday",
      }),
      "2026-09-02",
    );
  });

  it("defaults Mon/Wed/Fri/Sun pattern when dayOfWeek absent", () => {
    assert.equal(
      mapSlotScheduledDate({ weekStart: WEEK_START, slotIndex: 0 }),
      "2026-08-31",
    );
    assert.equal(
      mapSlotScheduledDate({ weekStart: WEEK_START, slotIndex: 1 }),
      "2026-09-02",
    );
    assert.equal(
      mapSlotScheduledDate({ weekStart: WEEK_START, slotIndex: 4 }),
      "2026-09-06",
    );
  });
});

describe("deriveCalendarPipelineStatus", () => {
  it("cascades published → approved → pending → qa → generating → draft", () => {
    const base = {
      reelScriptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      captionSummary: {
        ...PENDING_REEL_CAPTION_SUMMARY,
        status: "generated" as const,
      },
      videoJobStatus: null,
      assemblyStatus: null,
      brandingStatus: null,
      outputMediaAssetId: null,
      qaReportStatus: null,
      approvalStatus: null,
      approvalId: null,
      assembledReelId: null,
    };

    assert.equal(
      deriveCalendarPipelineStatus({ ...base, publishStatus: "published" })
        .pipelineStatus,
      "published",
    );

    assert.equal(
      deriveCalendarPipelineStatus({
        ...base,
        publishStatus: "ready",
        approvalStatus: "approved",
        approvalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }).pipelineStatus,
      "approved",
    );

    const pending = deriveCalendarPipelineStatus({
      ...base,
      publishStatus: "ready",
      approvalStatus: "changes_requested",
      approvalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    assert.equal(pending.pipelineStatus, "pending");
    assert.equal(pending.changesRequested, true);

    assert.equal(
      deriveCalendarPipelineStatus({
        ...base,
        publishStatus: "ready",
        assemblyStatus: "completed",
        brandingStatus: "completed",
        outputMediaAssetId: ASSET_ID,
        assembledReelId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        qaReportStatus: "passed",
      }).pipelineStatus,
      "qa",
    );

    assert.equal(
      deriveCalendarPipelineStatus({
        ...base,
        publishStatus: "ready",
        reelScriptId: null,
      }).pipelineStatus,
      "generating",
    );

    assert.equal(
      deriveCalendarPipelineStatus({
        ...base,
        publishStatus: "ready",
        captionSummary: PENDING_REEL_CAPTION_SUMMARY,
      }).pipelineStatus,
      "generating",
    );

    assert.equal(
      deriveCalendarPipelineStatus({
        ...base,
        publishStatus: "ready",
      }).pipelineStatus,
      "draft",
    );
  });

  it("Rule R1: rejected skips approved/pending branches", () => {
    const result = deriveCalendarPipelineStatus({
      publishStatus: "ready",
      reelScriptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      captionSummary: {
        ...PENDING_REEL_CAPTION_SUMMARY,
        status: "generated",
      },
      videoJobStatus: null,
      assemblyStatus: "completed",
      brandingStatus: "completed",
      outputMediaAssetId: ASSET_ID,
      qaReportStatus: "passed",
      approvalStatus: "rejected",
      approvalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assembledReelId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });

    assert.equal(result.pipelineStatus, "qa");
    assert.notEqual(result.pipelineStatus, "approved");
    assert.notEqual(result.pipelineStatus, "pending");
  });

  it("thumbnailPreviewUrl matches calendar media path regex when asset present", () => {
    const result = deriveCalendarPipelineStatus({
      publishStatus: "ready",
      reelScriptId: null,
      captionSummary: null,
      videoJobStatus: null,
      assemblyStatus: "completed",
      brandingStatus: "completed",
      outputMediaAssetId: ASSET_ID,
      qaReportStatus: null,
      approvalStatus: null,
      approvalId: null,
      assembledReelId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });

    assert.equal(
      calendarMediaPreviewPathSchema.safeParse(result.thumbnailPreviewUrl).success,
      true,
    );
  });
});

describe("calendar contracts", () => {
  it("rejects client_id and clientId before parse", () => {
    assert.deepEqual(findForbiddenCalendarKeys({ weekStart: WEEK_START, client_id: CLIENT_A }), [
      "client_id",
    ]);
    assert.deepEqual(findForbiddenCalendarKeys({ weekStart: WEEK_START, clientId: CLIENT_A }), [
      "clientId",
    ]);
  });

  it("getOperatorCalendarForWeekInputSchema is weekStart strict only", () => {
    assert.equal(
      getOperatorCalendarForWeekInputSchema.safeParse({ weekStart: WEEK_START }).success,
      true,
    );
    assert.equal(
      getOperatorCalendarForWeekInputSchema.safeParse({
        weekStart: WEEK_START,
        client_id: CLIENT_A,
      }).success,
      false,
    );
  });
});

describe("getOperatorCalendarForWeek action", () => {
  it("Cliente session → FORBIDDEN with no sync", async () => {
    let syncCalled = false;

    await withServerOnlyStub(async () => {
      const restore = installCalendarMocks({
        requireOperator: async () => {
          const { AuthGuardError } = require("@/lib/auth/require-user.ts");
          throw new AuthGuardError(403, {
            ok: false,
            error: { code: "FORBIDDEN", messageKey: "auth.errors.forbidden" },
          });
        },
        requireActive: async () => clientUser,
        syncCalendarSlotsForWeek: async () => {
          syncCalled = true;
          return {
            clientsSynced: 0,
            clientsWithoutApprovedStrategyCount: 0,
            slotsUpserted: 0,
            slotsDeleted: 0,
          };
        },
      });

      try {
        const { getOperatorCalendarForWeek } = require("./actions/get-operator-calendar-for-week.ts");
        const result = await getOperatorCalendarForWeek({ weekStart: WEEK_START });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN");
        }
        assert.equal(syncCalled, false);
      } finally {
        restore();
      }
    });
  });

  it("Operator session → success shape", async () => {
    await withServerOnlyStub(async () => {
      const restore = installCalendarMocks({
        requireOperator: async () => operatorUser,
        getOperatorCalendarForWeekCore: async () => ({
          ok: true,
          weekStart: WEEK_START,
          clients: [{ clientId: CLIENT_A, clientDisplayName: "Cafe Luna" }],
          slots: [
            {
              slotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              clientId: CLIENT_A,
              clientDisplayName: "Cafe Luna",
              weekStart: WEEK_START,
              scheduledDate: WEEK_START,
              slotIndex: 0,
              tema: "Promo",
              reelScriptId: null,
              pipelineStatus: "draft",
              approvalId: null,
              assembledReelId: null,
              thumbnailPreviewUrl: null,
              strategyId: STRATEGY_ID,
              goal: "local_sale",
              approvalStatus: null,
              changesRequested: false,
              publishedAt: null,
              instagramPostUrl: null,
              metrics: null,
            },
          ],
          gapWarnings: [],
          clientsWithoutApprovedStrategyCount: 0,
        }),
      });

      try {
        const { getOperatorCalendarForWeek } = require("./actions/get-operator-calendar-for-week.ts");
        const result = await getOperatorCalendarForWeek({ weekStart: WEEK_START });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(
            getOperatorCalendarForWeekSuccessSchema.safeParse(result).success,
            true,
          );
        }
      } finally {
        restore();
      }
    });
  });

  it("body with client_id → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const restore = installCalendarMocks({
        requireOperator: async () => operatorUser,
      });

      try {
        const { getOperatorCalendarForWeek } = require("./actions/get-operator-calendar-for-week.ts");
        const result = await getOperatorCalendarForWeek({
          weekStart: WEEK_START,
          client_id: CLIENT_A,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        }
      } finally {
        restore();
      }
    });
  });

  it("body with clientId → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const restore = installCalendarMocks({
        requireOperator: async () => operatorUser,
      });

      try {
        const { getOperatorCalendarForWeek } = require("./actions/get-operator-calendar-for-week.ts");
        const result = await getOperatorCalendarForWeek({
          weekStart: WEEK_START,
          clientId: CLIENT_A,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        }
      } finally {
        restore();
      }
    });
  });

  it("requireOperator is first await in action", () => {
    const src = readSrc("actions/get-operator-calendar-for-week.ts");
    const fnStart = src.indexOf("export async function getOperatorCalendarForWeek");
    const requireIdx = src.indexOf('requireOperator("handler")', fnStart);
    const forbiddenIdx = src.indexOf("findForbiddenCalendarKeys", fnStart);
    const parseIdx = src.indexOf(".safeParse(rawInput)", fnStart);
    const coreIdx = src.indexOf("await getOperatorCalendarForWeekCore", fnStart);
    assert.ok(requireIdx > fnStart);
    assert.ok(requireIdx < forbiddenIdx);
    assert.ok(forbiddenIdx < parseIdx);
    assert.ok(parseIdx < coreIdx);
  });
});

describe("syncCalendarSlotsForWeek", () => {
  it("is idempotent and deletes orphan slot_index rows", async () => {
    await withServerOnlyStub(async () => {
      const calendarRows = new Map<string, Record<string, unknown>>();

      const restore = installCalendarMocks({
        loadOperatorClientsForStrategy: async () => [
          { id: CLIENT_A, displayName: "Cafe Luna", email: "a@test.com" },
        ],
        getApprovedStrategyForWeek: async () => ({
          id: STRATEGY_ID,
          clientId: CLIENT_A,
          weekStart: WEEK_START,
          version: 1,
          status: "approved" as const,
          brief: VALID_BRIEF,
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z",
        }),
        supabaseFrom: (table: string) => createCalendarTableMock(table, calendarRows, {
          existingOrphanSlotIndex: 6,
        }),
      });

      try {
        const { syncCalendarSlotsForWeek } = require("./sync-calendar-slots-for-week.ts");
        const first = await syncCalendarSlotsForWeek(WEEK_START);
        const second = await syncCalendarSlotsForWeek(WEEK_START);

        assert.equal(first.slotsUpserted, 3);
        assert.equal(first.slotsDeleted, 1);
        assert.equal(second.slotsUpserted, 3);
        assert.equal(second.slotsDeleted, 0);
        assert.equal(calendarRows.size, 3);
      } finally {
        restore();
      }
    });
  });
});

describe("gap warnings", () => {
  it("missingCount when scheduledCount < 3 for approved client", async () => {
    await withServerOnlyStub(async () => {
      const restore = installCalendarMocks({
        loadOperatorClientsForStrategy: async () => [
          { id: CLIENT_B, displayName: "Studio Vega", email: "b@test.com" },
        ],
        getApprovedStrategyForWeek: async () => ({
          id: STRATEGY_ID,
          clientId: CLIENT_B,
          weekStart: WEEK_START,
          version: 1,
          status: "approved" as const,
          brief: VALID_BRIEF,
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z",
        }),
        syncCalendarSlotsForWeek: async () => ({
          clientsSynced: 1,
          clientsWithoutApprovedStrategyCount: 0,
          slotsUpserted: 2,
          slotsDeleted: 0,
        }),
        supabaseFrom: (table: string) =>
          createCalendarTableMock(table, new Map(), {
            slotRows: [
              {
                id: "12121212-1212-4121-8121-121212121212",
                client_id: CLIENT_B,
                week_start: WEEK_START,
                scheduled_date: WEEK_START,
                slot_index: 0,
                strategy_id: STRATEGY_ID,
                reel_script_id: null,
                publish_status: "ready",
              },
              {
                id: "23232323-2323-4232-8232-232323232323",
                client_id: CLIENT_B,
                week_start: WEEK_START,
                scheduled_date: "2026-09-03",
                slot_index: 1,
                strategy_id: STRATEGY_ID,
                reel_script_id: null,
                publish_status: "ready",
              },
            ],
            strategyBrief: VALID_BRIEF,
          }),
        getVideoJobsForReelScripts: async () => ({}),
        getAssemblyJobsForReelScripts: async () => ({}),
        getQaReportsForAssembledReels: async () => ({}),
        listReelCaptionsForStrategy: async () => [],
      });

      try {
        const { getOperatorCalendarForWeekCore } = require("./get-operator-calendar-for-week.ts");
        const result = await getOperatorCalendarForWeekCore(WEEK_START);
        assert.equal(result.ok, true);
        assert.equal(result.gapWarnings.length, 1);
        assert.equal(result.gapWarnings[0]?.scheduledCount, 2);
        assert.equal(result.gapWarnings[0]?.missingCount, 1);
      } finally {
        restore();
      }
    });
  });
});

describe("US-13.1 calendar metrics DTO", () => {
  it("non-published slot uses metrics null", () => {
    const parsed = calendarSlotDetailDtoSchema.safeParse({
      slotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clientId: CLIENT_A,
      clientDisplayName: "Cafe Luna",
      weekStart: WEEK_START,
      scheduledDate: WEEK_START,
      slotIndex: 0,
      tema: "Promo",
      reelScriptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      pipelineStatus: "approved",
      approvalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assembledReelId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      thumbnailPreviewUrl: `/api/media/assets/${ASSET_ID}`,
      strategyId: STRATEGY_ID,
      goal: "local_sale",
      approvalStatus: "approved",
      changesRequested: false,
      publishedAt: null,
      instagramPostUrl: null,
      metrics: null,
    });
    assert.equal(parsed.success, true);
  });

  it("published slot accepts metrics snapshot with editable", () => {
    const metrics = {
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      dms: 0,
      recordedAt: null,
      editable: true,
    };
    assert.equal(reelMetricsDtoSchema.safeParse(metrics).success, true);

    const parsed = calendarSlotDetailDtoSchema.safeParse({
      slotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clientId: CLIENT_A,
      clientDisplayName: "Cafe Luna",
      weekStart: WEEK_START,
      scheduledDate: WEEK_START,
      slotIndex: 0,
      tema: "Promo",
      reelScriptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      pipelineStatus: "published",
      approvalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assembledReelId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      thumbnailPreviewUrl: `/api/media/assets/${ASSET_ID}`,
      strategyId: STRATEGY_ID,
      goal: "local_sale",
      approvalStatus: "approved",
      changesRequested: false,
      publishedAt: "2026-08-30T12:00:00.000Z",
      instagramPostUrl: null,
      metrics,
    });
    assert.equal(parsed.success, true);
  });

  it("calendar read loader does not UPSERT metrics", () => {
    const src = readSrc("get-operator-calendar-for-week.ts");
    assert.equal(src.includes("loadReelMetricsByAssembledReelIds"), true);
    assert.equal(src.includes(".upsert("), false);
  });
});

describe("US-12.1 security grep guards", () => {
  const denylistKeys = [
    "storage_key",
    "storageKey",
    "estimated_cost_cents",
    "costCents",
    "provider_key",
  ];

  it("success DTO schema excludes denylist keys in fixture", () => {
    const fixture = {
      ok: true as const,
      weekStart: WEEK_START,
      clients: [{ clientId: CLIENT_A, clientDisplayName: "Cafe Luna" }],
      slots: [
        {
          slotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          clientId: CLIENT_A,
          clientDisplayName: "Cafe Luna",
          weekStart: WEEK_START,
          scheduledDate: WEEK_START,
          slotIndex: 0,
          tema: "Promo",
          reelScriptId: null,
          pipelineStatus: "draft" as const,
          approvalId: null,
          assembledReelId: null,
          thumbnailPreviewUrl: `/api/media/assets/${ASSET_ID}`,
          strategyId: STRATEGY_ID,
          goal: "local_sale",
          approvalStatus: null,
          changesRequested: false,
          publishedAt: null,
          instagramPostUrl: null,
          metrics: null,
        },
      ],
      gapWarnings: [],
      clientsWithoutApprovedStrategyCount: 0,
    };

    const json = JSON.stringify(fixture);
    for (const key of denylistKeys) {
      assert.equal(json.includes(`"${key}"`), false);
    }
    assert.equal(getOperatorCalendarForWeekSuccessSchema.safeParse(fixture).success, true);
  });

  it("calendar modules do not import Cliente queue helpers", () => {
    const files = [
      "get-operator-calendar-for-week.ts",
      "sync-calendar-slots-for-week.ts",
      "actions/get-operator-calendar-for-week.ts",
    ];
    for (const file of files) {
      const src = readSrc(file);
      assert.equal(src.includes("listApprovedApprovals"), false, file);
      assert.equal(src.includes("listApprovedApprovalsForClient"), false, file);
      assert.equal(src.includes("ready-to-publish"), false, file);
    }
  });

  it("calendar modules do not UPDATE publish_status to published", () => {
    const files = [
      "sync-calendar-slots-for-week.ts",
      "get-operator-calendar-for-week.ts",
      "actions/get-operator-calendar-for-week.ts",
    ];
    for (const file of files) {
      const src = readSrc(file);
      assert.equal(src.includes("publish_status: \"published\""), false, file);
      assert.equal(src.includes("publish_status = 'published'"), false, file);
    }
  });

  it("media route allows Operator cross-client assembled_reel without ownership check", () => {
    const src = readFileSync(
      path.join(repoRoot, "app/api/media/assets/[assetId]/route.ts"),
      "utf8",
    );
    assert.match(src, /US-12\.1: Operator may stream any active client's assembled_reel/);
    const assembledBranch = src.slice(
      src.indexOf("MEDIA_ASSET_TYPE_ASSEMBLED_REEL"),
      src.indexOf("} else {", src.indexOf("MEDIA_ASSET_TYPE_ASSEMBLED_REEL")),
    );
    assert.equal(assembledBranch.includes("row.client_id === operator.id"), false);
  });
});

type CalendarMockOptions = {
  requireOperator?: () => Promise<typeof operatorUser>;
  requireActive?: () => Promise<typeof clientUser>;
  syncCalendarSlotsForWeek?: () => Promise<unknown>;
  getOperatorCalendarForWeekCore?: () => Promise<unknown>;
  loadOperatorClientsForStrategy?: () => Promise<
    Array<{ id: string; displayName: string; email: string }>
  >;
  getApprovedStrategyForWeek?: () => Promise<unknown>;
  supabaseFrom?: (table: string) => unknown;
  getVideoJobsForReelScripts?: () => Promise<Record<string, null>>;
  getAssemblyJobsForReelScripts?: () => Promise<Record<string, null>>;
  getQaReportsForAssembledReels?: () => Promise<Record<string, null>>;
  listReelCaptionsForStrategy?: () => Promise<unknown[]>;
};

function installCalendarMocks(options: CalendarMockOptions): () => void {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;

  nodeModule._load = function (request, parent, isMain) {
    if (request === "@/lib/auth/require-user.ts" || request.endsWith("/auth/require-user")) {
      return {
        requireOperator:
          options.requireOperator ??
          (async () => {
            throw new Error("requireOperator not stubbed");
          }),
        requireActive:
          options.requireActive ??
          (async () => {
            throw new Error("requireActive not stubbed");
          }),
        isAuthGuardError: (error: unknown) =>
          error instanceof Error && error.name === "AuthGuardError",
        AuthGuardError: class AuthGuardError extends Error {
          status: 401 | 403;
          envelope: unknown;
          constructor(status: 401 | 403, envelope: unknown) {
            super("auth");
            this.name = "AuthGuardError";
            this.status = status;
            this.envelope = envelope;
          }
        },
      };
    }

    if (
      request === "./get-operator-calendar-for-week.ts" ||
      request.endsWith("/calendar/get-operator-calendar-for-week")
    ) {
      if (options.getOperatorCalendarForWeekCore) {
        return { getOperatorCalendarForWeekCore: options.getOperatorCalendarForWeekCore };
      }
    }

    if (
      request === "./sync-calendar-slots-for-week.ts" ||
      request.endsWith("/calendar/sync-calendar-slots-for-week")
    ) {
      if (options.syncCalendarSlotsForWeek) {
        return { syncCalendarSlotsForWeek: options.syncCalendarSlotsForWeek, CALENDAR_SLOTS_TABLE: "neuramark_content_calendar_slots" };
      }
    }

    if (request === "@/lib/supabase/server.ts" || request.endsWith("/supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: (table: string) =>
            options.supabaseFrom ? options.supabaseFrom(table) : defaultSupabaseFrom(table),
        }),
      };
    }

    if (request.includes("load-operator-clients-for-strategy")) {
      return {
        loadOperatorClientsForStrategy:
          options.loadOperatorClientsForStrategy ??
          (async () => []),
      };
    }

    if (request.includes("load-approved-strategy-for-week")) {
      return {
        getApprovedStrategyForWeek:
          options.getApprovedStrategyForWeek ??
          (async () => null),
      };
    }

    if (request.includes("get-video-jobs-for-reel-scripts")) {
      return {
        getVideoJobsForReelScripts:
          options.getVideoJobsForReelScripts ?? (async () => ({})),
      };
    }

    if (request.includes("get-assembly-jobs-for-reel-scripts")) {
      return {
        getAssemblyJobsForReelScripts:
          options.getAssemblyJobsForReelScripts ?? (async () => ({})),
      };
    }

    if (request.includes("get-qa-reports-for-assembled-reels")) {
      return {
        getQaReportsForAssembledReels:
          options.getQaReportsForAssembledReels ?? (async () => ({})),
      };
    }

    if (request.includes("persist-reel-caption")) {
      return {
        listReelCaptionsForStrategy:
          options.listReelCaptionsForStrategy ?? (async () => []),
        buildGeneratedReelCaptionSummary: (params: {
          captionRow: { updatedAt: string };
        }) => ({
          status: "generated" as const,
          captionId: "cap-1",
          record: null,
          selectedCtaIndex: null,
          selectedCtaText: null,
          effectiveCaptionCharCount: 10,
          effectiveCaptionOverLimit: false,
          updatedAt: params.captionRow.updatedAt,
          stale: false,
        }),
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  for (const key of Object.keys(require.cache)) {
    if (key.includes("/lib/calendar/")) {
      delete require.cache[key];
    }
  }

  return () => {
    nodeModule._load = originalLoad;
    for (const key of Object.keys(require.cache)) {
      if (key.includes("/lib/calendar/")) {
        delete require.cache[key];
      }
    }
  };
}

function defaultSupabaseFrom(_table: string) {
  return {
    select: () => ({
      eq: () => ({
        in: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  };
}

function createCalendarTableMock(
  table: string,
  rows: Map<string, Record<string, unknown>>,
  options: {
    existingOrphanSlotIndex?: number;
    slotRows?: Record<string, unknown>[];
    strategyBrief?: typeof VALID_BRIEF;
  } = {},
) {
  if (table === "neuramark_content_calendar_slots") {
    if (rows.size === 0 && options.existingOrphanSlotIndex !== undefined) {
      const key = `${CLIENT_A}:${WEEK_START}:${options.existingOrphanSlotIndex}`;
      rows.set(key, {
        client_id: CLIENT_A,
        week_start: WEEK_START,
        slot_index: options.existingOrphanSlotIndex,
        publish_status: "ready",
      });
    }

    if (options.slotRows) {
      for (const row of options.slotRows) {
        const key = `${row.client_id}:${row.week_start}:${row.slot_index}`;
        rows.set(key, row);
      }
    }

    return {
      select: (cols: string) => ({
        eq: (col: string, val: unknown) => ({
          eq: (col2: string, val2: unknown) => {
            const handler = {
              in: async () => ({
                data:
                  col === "week_start" && val === WEEK_START
                    ? [...rows.values()]
                    : [],
                error: null,
              }),
              maybeSingle: async () => ({ data: null, error: null }),
            };

            if (
              cols.includes("slot_index") &&
              cols.includes("publish_status") &&
              col === "client_id" &&
              col2 === "week_start"
            ) {
              return Promise.resolve({
                data: [...rows.values()].map((row) => ({
                  slot_index: row.slot_index,
                  publish_status: row.publish_status ?? "ready",
                })),
                error: null,
              });
            }

            return handler;
          },
          in: async (_col: string, ids: string[]) => ({
            data: [...rows.values()].filter((row) =>
              ids.includes(String(row.client_id)),
            ),
            error: null,
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        const key = `${row.client_id}:${row.week_start}:${row.slot_index}`;
        rows.set(key, row);
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          eq: () => ({
            eq: () => {
              return { error: null };
            },
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: () => ({
            eq: (_col: string, slotIndex: number) => {
              for (const [key, row] of rows) {
                if (row.slot_index === slotIndex) {
                  rows.delete(key);
                }
              }
              return { error: null };
            },
          }),
        }),
      }),
    };
  }

  if (table === "neuramark_reel_scripts") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };
  }

  if (table === "neuramark_content_strategies") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { brief: options.strategyBrief ?? VALID_BRIEF },
            error: null,
          }),
        }),
      }),
    };
  }

  return defaultSupabaseFrom(table);
}
