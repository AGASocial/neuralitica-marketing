import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  isOperator,
  requireOrchestratorRole,
} from "@/lib/orchestrator-chat/authorize";

const baseUser: CurrentUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  displayName: "Owner",
  preferredLocale: "en",
  role: "client",
  active: true,
};

describe("orchestrator-chat authorize", () => {
  it("clients are not operators", () => {
    assert.equal(isOperator(baseUser), false);
    const denied = requireOrchestratorRole(baseUser, ["operator"]);
    assert.equal(denied?.ok, false);
    assert.equal(denied?.error, "FORBIDDEN");
  });

  it("operators pass operator gate", () => {
    const operator = { ...baseUser, role: "operator" as const };
    assert.equal(isOperator(operator), true);
    assert.equal(requireOrchestratorRole(operator, ["operator"]), null);
  });

  it("both roles allowed for shared tools", () => {
    assert.equal(
      requireOrchestratorRole(baseUser, ["client", "operator"]),
      null,
    );
  });
});
