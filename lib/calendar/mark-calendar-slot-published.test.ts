/**
 * US-12.2 mark-published — action, core, contracts, sync preserve, security.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS,
  calendarInstagramPostUrlSchema,
  calendarSlotDetailDtoSchema,
  findForbiddenMarkPublishedKeys,
  markCalendarSlotPublishedInputSchema,
} from "@/lib/contracts/calendar";
import {
  addCalendarDays,
  isPublishedAtWithinBounds,
  operatorLocalCalendarDate,
  publishedAtUtcNoonIsoFromDateInput,
} from "@/lib/calendar/operator-local-calendar-date";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SLOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const PUBLISH_DATE = operatorLocalCalendarDate();
const WEEK_START = normalizeToIsoMonday(new Date(`${PUBLISH_DATE}T12:00:00.000Z`));
const REEL_SCRIPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSEMBLED_REEL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const APPROVAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STRATEGY_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ASSET_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const VALID_IG_URL = "https://www.instagram.com/reel/ABC123xyz/";

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

const baseSlotRow = {
  id: SLOT_ID,
  clientId: CLIENT_A,
  clientDisplayName: "Cafe Luna",
  weekStart: WEEK_START,
  scheduledDate: "2026-08-26",
  slotIndex: 1,
  strategyId: STRATEGY_ID,
  reelScriptId: REEL_SCRIPT_ID,
  publishStatus: "ready" as const,
  publishedAtRaw: null,
  instagramPostUrlRaw: null,
  tema: "Promo del martes",
  goal: "local_sale" as const,
};

const readyAssemblyJob = {
  jobId: ASSEMBLED_REEL_ID,
  status: "completed" as const,
  brandingStatus: "completed" as const,
  outputMediaAssetId: ASSET_ID,
};

const approvedApproval = {
  id: APPROVAL_ID,
  status: "approved" as const,
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

function clearMarkPublishedCaches() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes("/lib/calendar/") ||
      key.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

type MarkPublishedMockOptions = {
  requireOperator?: () => Promise<typeof operatorUser>;
  slotRow?: typeof baseSlotRow | null;
  approval?: typeof approvedApproval | null;
  assemblyJob?: typeof readyAssemblyJob | null;
  rateLimited?: boolean;
  updateCalls?: Array<Record<string, unknown>>;
  onUpdate?: (patch: Record<string, unknown>) => void;
};

function installMarkPublishedMocks(options: MarkPublishedMockOptions = {}): () => void {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  const updateCalls = options.updateCalls ?? [];
  let slotRow = options.slotRow === undefined ? { ...baseSlotRow } : options.slotRow;

  nodeModule._load = function (request, parent, isMain) {
    if (request === "@/lib/auth/require-user.ts" || request.endsWith("/auth/require-user")) {
      return {
        requireOperator:
          options.requireOperator ??
          (async () => operatorUser),
        requireActive: async () => clientUser,
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

    if (request.includes("check-calendar-mark-published-rate-limit")) {
      return {
        checkCalendarMarkPublishedRateLimit: async () =>
          options.rateLimited ? { ok: false, code: "RATE_LIMITED" } : { ok: true },
        recordCalendarMarkPublishedAttempt: async () => {},
      };
    }

    if (request.includes("get-assembly-jobs-for-reel-scripts")) {
      return {
        getAssemblyJobsForReelScripts: async () => {
          const job = options.assemblyJob === undefined ? readyAssemblyJob : options.assemblyJob;
          return job ? { [REEL_SCRIPT_ID]: job } : {};
        },
      };
    }

    if (request.includes("persist-approval")) {
      return {
        loadApprovalByAssembledReelScoped: async () =>
          options.approval === undefined ? approvedApproval : options.approval,
        mapApprovalRow: () => null,
        APPROVALS_TABLE: "neuramark_approvals",
      };
    }

    if (request.includes("get-operator-calendar-for-week")) {
      return {
        loadCalendarSlotRowById: async () => slotRow,
        buildCalendarSlotDetailDtoForRow: async (row: typeof baseSlotRow) => ({
          slotId: row.id,
          clientId: row.clientId,
          clientDisplayName: row.clientDisplayName,
          weekStart: row.weekStart,
          scheduledDate: row.scheduledDate,
          slotIndex: row.slotIndex,
          tema: row.tema,
          reelScriptId: row.reelScriptId,
          pipelineStatus: "published" as const,
          approvalId: APPROVAL_ID,
          assembledReelId: ASSEMBLED_REEL_ID,
          thumbnailPreviewUrl: `/api/media/assets/${ASSET_ID}`,
          strategyId: row.strategyId,
          goal: row.goal,
          approvalStatus: "approved" as const,
          changesRequested: false,
          publishedAt: row.publishedAtRaw
            ? `${row.publishedAtRaw.slice(0, 10)}T12:00:00.000Z`
            : null,
          instagramPostUrl: row.instagramPostUrlRaw,
        }),
      };
    }

    if (request === "@/lib/supabase/server.ts" || request.endsWith("/supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table !== "neuramark_content_calendar_slots") {
              return {
                update: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              };
            }

            return {
              update: (patch: Record<string, unknown>) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      updateCalls.push(patch);
                      options.onUpdate?.(patch);
                      if (slotRow) {
                        slotRow = {
                          ...slotRow,
                          publishStatus: "published",
                          publishedAtRaw:
                            typeof patch.published_at === "string"
                              ? patch.published_at
                              : slotRow.publishedAtRaw,
                          instagramPostUrlRaw:
                            patch.instagram_post_url === null
                              ? null
                              : typeof patch.instagram_post_url === "string"
                                ? patch.instagram_post_url
                                : slotRow.instagramPostUrlRaw,
                        };
                      }
                      return { data: { id: SLOT_ID }, error: null };
                    },
                  }),
                }),
              }),
            };
          },
        }),
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  clearMarkPublishedCaches();

  return () => {
    nodeModule._load = originalLoad;
    clearMarkPublishedCaches();
  };
}

describe("mark-published contracts", () => {
  it("rejects forbidden authority keys", () => {
    assert.deepEqual(
      findForbiddenMarkPublishedKeys({
        slotId: SLOT_ID,
        publishedAt: PUBLISH_DATE,
        client_id: CLIENT_A,
      }),
      ["client_id"],
    );
    assert.deepEqual(
      findForbiddenMarkPublishedKeys({
        slotId: SLOT_ID,
        publishedAt: PUBLISH_DATE,
        publish_status: "published",
      }),
      ["publish_status"],
    );
  });

  it("normalizes empty instagramPostUrl to null", () => {
    const parsed = markCalendarSlotPublishedInputSchema.safeParse({
      slotId: SLOT_ID,
      publishedAt: PUBLISH_DATE,
      instagramPostUrl: "   ",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.instagramPostUrl, null);
    }
  });

  it("rejects invalid IG URL hosts", () => {
    const parsed = markCalendarSlotPublishedInputSchema.safeParse({
      slotId: SLOT_ID,
      publishedAt: PUBLISH_DATE,
      instagramPostUrl: "https://instagram.com/p/abc",
    });
    assert.equal(parsed.success, false);
  });

  it("accepts valid https://www.instagram.com URL", () => {
    assert.equal(
      calendarInstagramPostUrlSchema.safeParse(VALID_IG_URL).success,
      true,
    );
  });

  it("publishedAt bounds helper enforces week_start and today+1", () => {
    const fixedWeekStart = "2026-08-25";
    const fixedNow = new Date("2026-08-30T12:00:00.000Z");
    assert.equal(
      isPublishedAtWithinBounds({
        publishedAt: fixedWeekStart,
        weekStart: fixedWeekStart,
        now: fixedNow,
      }),
      true,
    );
    assert.equal(
      isPublishedAtWithinBounds({
        publishedAt: "2026-08-24",
        weekStart: fixedWeekStart,
        now: fixedNow,
      }),
      false,
    );
    const maxDate = addCalendarDays(operatorLocalCalendarDate(fixedNow), 1);
    assert.equal(
      isPublishedAtWithinBounds({
        publishedAt: maxDate,
        weekStart: fixedWeekStart,
        now: fixedNow,
      }),
      true,
    );
    assert.equal(
      isPublishedAtWithinBounds({
        publishedAt: addCalendarDays(maxDate, 1),
        weekStart: fixedWeekStart,
        now: fixedNow,
      }),
      false,
    );
  });

  it("stores UTC noon anchor from date-only input", () => {
    assert.equal(
      publishedAtUtcNoonIsoFromDateInput("2026-08-30"),
      "2026-08-30T12:00:00.000Z",
    );
  });
});

describe("markCalendarSlotPublished action", () => {
  it("Cliente session → FORBIDDEN with no UPDATE", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({
        requireOperator: async () => {
          const { AuthGuardError } = require("@/lib/auth/require-user.ts");
          throw new AuthGuardError(403, {
            ok: false,
            error: { code: "FORBIDDEN" },
          });
        },
        updateCalls,
      });

      try {
        const { markCalendarSlotPublished } = require("./actions/mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublished({
          slotId: SLOT_ID,
          publishedAt: PUBLISH_DATE,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN");
        }
        assert.equal(updateCalls.length, 0);
      } finally {
        restore();
      }
    });
  });

  it("body with client_id → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks();
      try {
        const { markCalendarSlotPublished } = require("./actions/mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublished({
          slotId: SLOT_ID,
          publishedAt: PUBLISH_DATE,
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

  it("body with publish_status → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks();
      try {
        const { markCalendarSlotPublished } = require("./actions/mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublished({
          slotId: SLOT_ID,
          publishedAt: PUBLISH_DATE,
          publish_status: "published",
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

  it("invalid IG URL → VALIDATION_ERROR with invalidIgUrl messageKey", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks();
      try {
        const { markCalendarSlotPublished } = require("./actions/mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublished({
          slotId: SLOT_ID,
          publishedAt: PUBLISH_DATE,
          instagramPostUrl: "javascript:alert(1)",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "VALIDATION_ERROR");
          assert.equal(
            result.error.messageKey,
            CALENDAR_MARK_PUBLISHED_MESSAGE_KEYS.invalidIgUrl,
          );
          assert.ok(result.error.fields?.instagramPostUrl);
        }
      } finally {
        restore();
      }
    });
  });

  it("requireOperator is first await in action", () => {
    const src = readSrc("actions/mark-calendar-slot-published.ts");
    const fnStart = src.indexOf("export async function markCalendarSlotPublished");
    const requireIdx = src.indexOf('requireOperator("handler")', fnStart);
    const forbiddenIdx = src.indexOf("findForbiddenMarkPublishedKeys", fnStart);
    const parseIdx = src.indexOf(".safeParse(rawInput)", fnStart);
    const coreIdx = src.indexOf("await markCalendarSlotPublishedCore", fnStart);
    assert.ok(requireIdx > fnStart);
    assert.ok(requireIdx < forbiddenIdx);
    assert.ok(forbiddenIdx < parseIdx);
    assert.ok(parseIdx < coreIdx);
  });
});

describe("markCalendarSlotPublishedCore", () => {
  it("happy path updates publish columns and returns published slot", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({ updateCalls });
      try {
        const { markCalendarSlotPublishedCore } = require("./mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublishedCore({
          operator: operatorUser,
          input: {
            slotId: SLOT_ID,
            publishedAt: PUBLISH_DATE,
            instagramPostUrl: VALID_IG_URL,
          },
        });
        if (!result.ok) {
          assert.fail(`expected ok, got ${result.error.code}`);
        }
        assert.equal(
          calendarSlotDetailDtoSchema.safeParse(result.slot).success,
          true,
        );
        assert.equal(updateCalls.length, 1);
        assert.equal(updateCalls[0]?.publish_status, "published");
        assert.equal(
          updateCalls[0]?.published_at,
          publishedAtUtcNoonIsoFromDateInput(PUBLISH_DATE),
        );
        assert.equal(updateCalls[0]?.instagram_post_url, VALID_IG_URL);
      } finally {
        restore();
      }
    });
  });

  it("non-approved slot → NOT_APPROVED with no UPDATE", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({
        updateCalls,
        approval: { id: APPROVAL_ID, status: "pending_client" },
      });
      try {
        const { markCalendarSlotPublishedCore } = require("./mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublishedCore({
          operator: operatorUser,
          input: { slotId: SLOT_ID, publishedAt: PUBLISH_DATE },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_APPROVED");
        }
        assert.equal(updateCalls.length, 0);
      } finally {
        restore();
      }
    });
  });

  it("missing assembly → SLOT_NOT_READY", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({
        updateCalls,
        assemblyJob: null,
      });
      try {
        const { markCalendarSlotPublishedCore } = require("./mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublishedCore({
          operator: operatorUser,
          input: { slotId: SLOT_ID, publishedAt: PUBLISH_DATE },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "SLOT_NOT_READY");
        }
        assert.equal(updateCalls.length, 0);
      } finally {
        restore();
      }
    });
  });

  it("unknown slotId → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({ slotRow: null });
      try {
        const { markCalendarSlotPublishedCore } = require("./mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublishedCore({
          operator: operatorUser,
          input: { slotId: SLOT_ID, publishedAt: PUBLISH_DATE },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
        }
      } finally {
        restore();
      }
    });
  });

  it("re-mark clears instagramPostUrl when empty string provided", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({
        updateCalls,
        slotRow: {
          ...baseSlotRow,
          publishStatus: "published",
          publishedAtRaw: publishedAtUtcNoonIsoFromDateInput(
            addCalendarDays(PUBLISH_DATE, -1),
          ),
          instagramPostUrlRaw: VALID_IG_URL,
        },
      });
      try {
        const { markCalendarSlotPublishedCore } = require("./mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublishedCore({
          operator: operatorUser,
          input: {
            slotId: SLOT_ID,
            publishedAt: addCalendarDays(PUBLISH_DATE, -1),
            instagramPostUrl: null,
          },
        });
        assert.equal(result.ok, true);
        assert.equal(updateCalls[0]?.instagram_post_url, null);
      } finally {
        restore();
      }
    });
  });

  it("re-mark after approval revoked → NOT_APPROVED without UPDATE", async () => {
    const updateCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({
        updateCalls,
        slotRow: {
          ...baseSlotRow,
          publishStatus: "published",
          publishedAtRaw: publishedAtUtcNoonIsoFromDateInput(
            addCalendarDays(PUBLISH_DATE, -1),
          ),
          instagramPostUrlRaw: VALID_IG_URL,
        },
        approval: { id: APPROVAL_ID, status: "rejected" },
      });
      try {
        const { markCalendarSlotPublishedCore } = require("./mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublishedCore({
          operator: operatorUser,
          input: {
            slotId: SLOT_ID,
            publishedAt: addCalendarDays(PUBLISH_DATE, -1),
            instagramPostUrl: VALID_IG_URL,
          },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_APPROVED");
        }
        assert.equal(updateCalls.length, 0);
      } finally {
        restore();
      }
    });
  });

  it("rate limit exceeded → RATE_LIMITED", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMarkPublishedMocks({ rateLimited: true });
      try {
        const { markCalendarSlotPublishedCore } = require("./mark-calendar-slot-published.ts");
        const result = await markCalendarSlotPublishedCore({
          operator: operatorUser,
          input: { slotId: SLOT_ID, publishedAt: PUBLISH_DATE },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "RATE_LIMITED");
        }
      } finally {
        restore();
      }
    });
  });
});

describe("US-12.2 security grep guards", () => {
  it("sync module does not UPDATE publish metadata columns", () => {
    const src = readSrc("sync-calendar-slots-for-week.ts");
    assert.equal(src.includes("publish_status: \"published\""), false);
    assert.equal(src.includes("publish_status = 'published'"), false);
    const updateStart = src.indexOf("if (existing) {");
    const updateEnd = src.indexOf("} else {", updateStart);
    const updateBlock = src.slice(updateStart, updateEnd);
    assert.equal(updateBlock.includes("published_at"), false);
    assert.equal(updateBlock.includes("instagram_post_url"), false);
    assert.equal(updateBlock.includes("publish_status"), false);
  });

  it("read action does not UPDATE publish columns", () => {
    const src = readSrc("actions/get-operator-calendar-for-week.ts");
    assert.equal(src.includes(".update("), false);
  });

  it("mark action has no Graph/integrations imports", () => {
    for (const file of [
      "actions/mark-calendar-slot-published.ts",
      "mark-calendar-slot-published.ts",
    ]) {
      const src = readSrc(file);
      assert.equal(src.includes("integrations"), false, file);
      assert.equal(src.includes("graph"), false, file);
    }
  });
});
