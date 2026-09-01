import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type MockOptions = {
  requireOperator?: () => Promise<unknown>;
  clientsFrom?: (table: string) => unknown;
  isWeeklyCycleLiveEnabled?: () => boolean;
  isWeeklyCycleLiveAllowedForClient?: (clientId: string) => boolean;
  runWeeklyCycleLive?: (params: unknown) => Promise<unknown>;
  resolveWeekStartForCycle?: () => string;
};

function installMocks(options: MockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);
    if (req.includes("lib/auth/require-user")) {
      return {
        isAuthGuardError: (error: unknown) =>
          Boolean(error && typeof error === "object" && "status" in error &&
            ((error as { status: number }).status === 401 || (error as { status: number }).status === 403)),
        requireOperator: options.requireOperator ?? (async () => ({ id: "operator-1", role: "operator" })),
      };
    }
    if (req.includes("lib/supabase/server")) {
      return { createServerSupabaseClient: () => ({ from: options.clientsFrom ?? (() => { throw new Error("unexpected from()"); }) }) };
    }
    if (req.includes("weekly-cycle-live-env")) {
      return {
        isWeeklyCycleLiveEnabled: options.isWeeklyCycleLiveEnabled ?? (() => true),
        isWeeklyCycleLiveAllowedForClient: options.isWeeklyCycleLiveAllowedForClient ?? (() => true),
      };
    }
    if (req.includes("run-weekly-cycle-live")) {
      return { runWeeklyCycleLive: options.runWeeklyCycleLive ?? (async () => { throw new Error("must not run live"); }) };
    }
    if (req.includes("resolve-week-start-for-cycle")) {
      return { resolveWeekStartForCycle: options.resolveWeekStartForCycle ?? (() => "2026-08-31") };
    }
    return originalLoad(request, parent, isMain);
  };
  return () => { nodeModule._load = originalLoad; };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/orchestration/actions/trigger-weekly-cycle-for-client") ||
      normalized.includes("/lib/contracts/weekly-cycle-live")
    ) {
      delete require.cache[key];
    }
  }
}

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

function activeClientQuery(active: boolean, id = CLIENT_ID) {
  return () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id, active }, error: null }) }) }) });
}
function missingClientQuery() {
  return () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
}

describe("triggerWeeklyCycleForClient — manual-trigger auth", () => {
  it("calls requireOperator as the first await, before any input parsing or DB read", async () => {
    let requireCalled = false;
    let clientsQueried = false;
    const restore = installMocks({
      requireOperator: async () => { requireCalled = true; throw Object.assign(new Error("unauth"), { status: 401 }); },
      clientsFrom: () => { clientsQueried = true; throw new Error("must not query"); },
    });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const result = await triggerWeeklyCycleForClient({ clientId: "not-even-a-uuid" });
      assert.equal(requireCalled, true);
      assert.equal(clientsQueried, false);
      assert.deepEqual(result, { ok: false, error: { code: "UNAUTHENTICATED" } });
    } finally { restore(); clearModuleCache(); }
  });

  it("maps a 403 auth guard error to FORBIDDEN", async () => {
    const restore = installMocks({
      requireOperator: async () => { throw Object.assign(new Error("forbidden"), { status: 403 }); },
    });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const result = await triggerWeeklyCycleForClient({ clientId: CLIENT_ID });
      assert.deepEqual(result, { ok: false, error: { code: "FORBIDDEN" } });
    } finally { restore(); clearModuleCache(); }
  });

  it("rejects malformed/forbidden input as VALIDATION_ERROR before any DB read", async () => {
    let clientsQueried = false;
    const restore = installMocks({ clientsFrom: () => { clientsQueried = true; throw new Error("must not query"); } });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      for (const badInput of [
        { clientId: "not-a-uuid" },
        { clientId: CLIENT_ID, invokedBy: "system" }, // strict schema: extra key forbidden
        { clientId: CLIENT_ID, weekStart: "2020-01-06" }, // outside the current/next-2-Mondays window
      ]) {
        const result = await triggerWeeklyCycleForClient(badInput);
        assert.deepEqual(result, { ok: false, error: { code: "VALIDATION_ERROR" } });
      }
      assert.equal(clientsQueried, false);
    } finally { restore(); clearModuleCache(); }
  });

  it("returns the same non-enumerating NOT_FOUND for nonexistent, inactive, and not-allowlisted clients", async () => {
    const restore1 = installMocks({ clientsFrom: missingClientQuery() });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const nonexistent = await triggerWeeklyCycleForClient({ clientId: CLIENT_ID });
      assert.deepEqual(nonexistent, { ok: false, error: { code: "NOT_FOUND" } });
    } finally { restore1(); clearModuleCache(); }

    const restore2 = installMocks({ clientsFrom: activeClientQuery(false) });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const inactive = await triggerWeeklyCycleForClient({ clientId: CLIENT_ID });
      assert.deepEqual(inactive, { ok: false, error: { code: "NOT_FOUND" } });
    } finally { restore2(); clearModuleCache(); }

    const restore3 = installMocks({ clientsFrom: activeClientQuery(true), isWeeklyCycleLiveAllowedForClient: () => false });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const notAllowlisted = await triggerWeeklyCycleForClient({ clientId: CLIENT_ID });
      assert.deepEqual(notAllowlisted, { ok: false, error: { code: "NOT_FOUND" } });
    } finally { restore3(); clearModuleCache(); }
  });

  it("returns LIVE_DISABLED when the kill switch is off, even for an active allowlisted client", async () => {
    let liveCalled = false;
    const restore = installMocks({
      clientsFrom: activeClientQuery(true),
      isWeeklyCycleLiveAllowedForClient: () => true,
      isWeeklyCycleLiveEnabled: () => false,
      runWeeklyCycleLive: async () => { liveCalled = true; return { ok: true, runId: "r", outcome: "STARTED" }; },
    });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const result = await triggerWeeklyCycleForClient({ clientId: CLIENT_ID });
      assert.deepEqual(result, { ok: false, error: { code: "LIVE_DISABLED" } });
      assert.equal(liveCalled, false);
    } finally { restore(); clearModuleCache(); }
  });

  it("on success, resolves an omitted weekStart server-side and returns the shared-ledger outcome", async () => {
    let receivedParams: unknown;
    const restore = installMocks({
      clientsFrom: activeClientQuery(true),
      resolveWeekStartForCycle: () => "2026-08-31",
      runWeeklyCycleLive: async (params) => { receivedParams = params; return { ok: true, runId: "run-1", outcome: "STARTED" }; },
    });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const result = await triggerWeeklyCycleForClient({ clientId: CLIENT_ID });
      assert.deepEqual(result, { ok: true, runId: "run-1", clientId: CLIENT_ID, weekStart: "2026-08-31", outcome: "STARTED" });
      assert.deepEqual(receivedParams, { clientId: CLIENT_ID, weekStart: "2026-08-31", invokedBy: "system", mode: "operator" });
    } finally { restore(); clearModuleCache(); }
  });

  it("maps a live CLIENT_INACTIVE race (deactivated between load and run) to non-enumerating NOT_FOUND", async () => {
    const restore = installMocks({
      clientsFrom: activeClientQuery(true),
      runWeeklyCycleLive: async () => ({ ok: false, error: { code: "CLIENT_INACTIVE" } }),
    });
    try {
      clearModuleCache();
      const { triggerWeeklyCycleForClient } = require("./trigger-weekly-cycle-for-client.ts");
      const result = await triggerWeeklyCycleForClient({ clientId: CLIENT_ID });
      assert.deepEqual(result, { ok: false, error: { code: "NOT_FOUND" } });
    } finally { restore(); clearModuleCache(); }
  });
});
