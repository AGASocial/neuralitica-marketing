import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/weekly-cycle-live-env")) {
      delete require.cache[key];
    }
  }
}

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const CLIENT_C = "33333333-3333-4333-8333-333333333333";

function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    originals[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return run();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  }
}

describe("weekly cycle live env — kill switch, allowlist, cap (server-only rollout authority)", () => {
  it("is disabled by default and for any value other than the literal 'true'", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { isWeeklyCycleLiveEnabled } = require("./weekly-cycle-live-env.ts");
    for (const value of [undefined, "false", "1", "TRUE", " true", "yes"]) {
      withEnv({ WEEKLY_CYCLE_LIVE_ENABLED: value }, () => {
        assert.equal(isWeeklyCycleLiveEnabled(), false, `expected disabled for ${JSON.stringify(value)}`);
      });
    }
    withEnv({ WEEKLY_CYCLE_LIVE_ENABLED: "true" }, () => {
      assert.equal(isWeeklyCycleLiveEnabled(), true);
    });
    clearModuleCache();
  }));

  it("parses a comma-separated UUID allowlist and trims whitespace", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { getWeeklyCycleLiveClientAllowlist } = require("./weekly-cycle-live-env.ts");
    withEnv({ WEEKLY_CYCLE_LIVE_CLIENT_IDS: ` ${CLIENT_A}, ${CLIENT_B} ,${CLIENT_A}` }, () => {
      const allowlist = getWeeklyCycleLiveClientAllowlist();
      assert.deepEqual([...allowlist].sort(), [CLIENT_A, CLIENT_B].sort());
    });
    withEnv({ WEEKLY_CYCLE_LIVE_CLIENT_IDS: undefined }, () => {
      assert.equal(getWeeklyCycleLiveClientAllowlist().size, 0);
    });
    clearModuleCache();
  }));

  it("fails the ENTIRE allowlist closed (empty set) when any single entry is invalid", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { getWeeklyCycleLiveClientAllowlist } = require("./weekly-cycle-live-env.ts");
    withEnv({ WEEKLY_CYCLE_LIVE_CLIENT_IDS: `${CLIENT_A},not-a-uuid,${CLIENT_B}` }, () => {
      const allowlist = getWeeklyCycleLiveClientAllowlist();
      assert.equal(allowlist.size, 0, "one bad UUID must fail the whole allowlist closed, not just skip the bad entry");
    });
    clearModuleCache();
  }));

  it("bounds WEEKLY_CYCLE_LIVE_MAX_CLIENTS to 1..25, default 3, and rejects non-integers", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { getWeeklyCycleLiveMaxClients } = require("./weekly-cycle-live-env.ts");
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: undefined }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 3));
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "10" }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 10));
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "0" }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 3));
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "26" }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 3));
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "3.5" }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 3));
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "not-a-number" }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 3));
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "25" }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 25));
    withEnv({ WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "1" }, () => assert.equal(getWeeklyCycleLiveMaxClients(), 1));
    clearModuleCache();
  }));

  it("isWeeklyCycleLiveAllowedForClient requires BOTH the kill switch and the per-client allowlist", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { isWeeklyCycleLiveAllowedForClient } = require("./weekly-cycle-live-env.ts");
    withEnv({ WEEKLY_CYCLE_LIVE_ENABLED: "true", WEEKLY_CYCLE_LIVE_CLIENT_IDS: CLIENT_A }, () => {
      assert.equal(isWeeklyCycleLiveAllowedForClient(CLIENT_A), true);
      assert.equal(isWeeklyCycleLiveAllowedForClient(CLIENT_B), false);
    });
    withEnv({ WEEKLY_CYCLE_LIVE_ENABLED: "false", WEEKLY_CYCLE_LIVE_CLIENT_IDS: CLIENT_A }, () => {
      assert.equal(isWeeklyCycleLiveAllowedForClient(CLIENT_A), false, "kill switch off must override an otherwise-allowlisted client");
    });
    clearModuleCache();
  }));

  it("selectWeeklyCycleLiveClientIds returns [] when disabled, regardless of allowlist", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { selectWeeklyCycleLiveClientIds } = require("./weekly-cycle-live-env.ts");
    withEnv({ WEEKLY_CYCLE_LIVE_ENABLED: "false", WEEKLY_CYCLE_LIVE_CLIENT_IDS: `${CLIENT_A},${CLIENT_B}` }, () => {
      assert.deepEqual(selectWeeklyCycleLiveClientIds([CLIENT_A, CLIENT_B]), []);
    });
    clearModuleCache();
  }));

  it("selectWeeklyCycleLiveClientIds preserves the caller's deterministic order and enforces the cap", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { selectWeeklyCycleLiveClientIds } = require("./weekly-cycle-live-env.ts");
    withEnv({
      WEEKLY_CYCLE_LIVE_ENABLED: "true",
      WEEKLY_CYCLE_LIVE_CLIENT_IDS: `${CLIENT_A},${CLIENT_B},${CLIENT_C}`,
      WEEKLY_CYCLE_LIVE_MAX_CLIENTS: "2",
    }, () => {
      // Eligible order is C, A, B (server-derived, not allowlist order) —
      // selection must respect the caller's order and stop at the cap.
      const selected = selectWeeklyCycleLiveClientIds([CLIENT_C, CLIENT_A, CLIENT_B]);
      assert.deepEqual(selected, [CLIENT_C, CLIENT_A]);
    });
    clearModuleCache();
  }));

  it("selectWeeklyCycleLiveClientIds only ever returns allowlisted+eligible clients, never an unlisted one", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { selectWeeklyCycleLiveClientIds } = require("./weekly-cycle-live-env.ts");
    withEnv({ WEEKLY_CYCLE_LIVE_ENABLED: "true", WEEKLY_CYCLE_LIVE_CLIENT_IDS: CLIENT_A }, () => {
      const selected = selectWeeklyCycleLiveClientIds([CLIENT_A, CLIENT_B, CLIENT_C]);
      assert.deepEqual(selected, [CLIENT_A]);
    });
    clearModuleCache();
  }));

  it("selectWeeklyCycleLiveClientIds returns [] when the allowlist has an invalid entry (fail-closed cascades to selection)", async () => withServerOnlyStub(async () => {
    clearModuleCache();
    const { selectWeeklyCycleLiveClientIds } = require("./weekly-cycle-live-env.ts");
    withEnv({ WEEKLY_CYCLE_LIVE_ENABLED: "true", WEEKLY_CYCLE_LIVE_CLIENT_IDS: `${CLIENT_A},not-a-uuid` }, () => {
      assert.deepEqual(selectWeeklyCycleLiveClientIds([CLIENT_A]), []);
    });
    clearModuleCache();
  }));

  it("no request/query/cookie/UI surface exists — only process.env is read (structural check)", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const source = readFileSync(path.join(process.cwd(), "lib/orchestration/weekly-cycle-live-env.ts"), "utf8");
    assert.match(source, /^import "server-only";/);
    assert.equal(source.includes("request."), false);
    assert.equal(source.includes("searchParams"), false);
    assert.equal(source.includes("cookies("), false);
    assert.match(source, /process\.env\.WEEKLY_CYCLE_LIVE_ENABLED/);
  });
});
