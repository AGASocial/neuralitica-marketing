import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as { _load: (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown };
  const original = loader._load;
  loader._load = (request, parent, isMain) => request === "server-only" ? {} : original(request, parent, isMain);
  return run().finally(() => { loader._load = original; });
}

describe("weekly cycle eligibility", () => {
  it("classifies eligible, missing-profile, and defensive inactive rows", async () => withServerOnlyStub(async () => {
    const { listEligibleClientsForWeeklyCycle } = await import("./list-eligible-clients-for-weekly-cycle");
    const rows = [{ id: "eligible", active: true }, { id: "missing", active: true }, { id: "inactive", active: false }];
    const query = { select: () => query, eq: () => query, order: async () => ({ data: rows, error: null }) };
    const result = await listEligibleClientsForWeeklyCycle({
      createClient: (() => ({ from: () => query })) as never,
      getProfile: async (clientId: string) => clientId === "eligible"
        ? ({ exists: true, clientId: "11111111-1111-4111-8111-111111111111", version: 1, fields: {} as never, visualModeSummary: { allowedModes: [], mustDiscloseNotOwner: false } })
        : ({ exists: false }),
    });
    assert.deepEqual(result.eligible, [{ clientId: "eligible" }]);
    assert.deepEqual(result.skipped, [
      { clientId: "missing", skipReason: "PROFILE_MISSING" },
      { clientId: "inactive", skipReason: "INACTIVE" },
    ]);
  }));
});
