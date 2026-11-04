import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("DashboardView last-updated + next-action a11y", () => {
  it("formats lastUpdatedAt on the client and uses one next-action label", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(join(here, "DashboardView.tsx"), "utf8");
    const page = readFileSync(
      join(here, "../../app/(app)/dashboard/page.tsx"),
      "utf8",
    );
    assert.match(view, /formatLastUpdatedClient/);
    assert.match(view, /lastUpdatedAt/);
    assert.match(view, /id="home-next-action"/);
    assert.doesNotMatch(view, /sr-only[\s\S]*sectionTitle/);
    assert.match(page, /lastUpdatedAt=\{data\.lastUpdatedAt\}/);
    assert.doesNotMatch(page, /formatLastUpdated\(/);
  });
});
