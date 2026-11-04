import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("resolveApprovalListCardMeta", () => {
  it("wires tema/hook title, modalidad formatKey, and assembly updatedAt", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const meta = readFileSync(
      join(here, "resolve-approval-list-card-meta.ts"),
      "utf8",
    );
    const compose = readFileSync(
      join(here, "compose-approval-package.ts"),
      "utf8",
    );
    const hub = readFileSync(
      join(here, "../../components/ready-to-publish/MyVideosHubView.tsx"),
      "utf8",
    );
    const contract = readFileSync(
      join(here, "../contracts/approval.ts"),
      "utf8",
    );

    assert.match(meta, /loadStrategyRowForOperator/);
    assert.match(meta, /loadReelScriptForQa/);
    assert.match(meta, /slot\.tema/);
    assert.match(meta, /package\.hook/);
    assert.match(meta, /formatKey = script\.modalidad/);
    assert.match(meta, /assembly\?\.updatedAt/);

    assert.match(compose, /resolveApprovalListCardMeta/);
    assert.match(compose, /assembledAt: meta\.assembledAt/);
    assert.match(compose, /title: meta\.title/);
    assert.match(compose, /reelTitle/);

    assert.match(contract, /assembledAt:/);
    assert.match(contract, /formatKey:/);
    assert.match(contract, /title:/);
    assert.match(contract, /reelTitle:/);

    assert.match(hub, /formatLabels/);
    assert.match(hub, /assembledAt/);
    assert.match(hub, /ClientLocalDateTime/);
    assert.match(hub, /copy\.formatLabels\[item\.formatKey\]/);
  });
});
