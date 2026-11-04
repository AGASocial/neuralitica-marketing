import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("OwnerMobileTabBar", () => {
  it("renders safe-area aware bottom tab bar with four destinations", () => {
    const src = readFileSync(
      join(__dirname, "OwnerMobileTabBar.tsx"),
      "utf8",
    );
    assert.match(src, /owner-mobile-tab-bar/);
    assert.match(src, /safe-area-inset-bottom/);
    assert.match(src, /hoy/);
    assert.match(src, /campaign/);
    assert.match(src, /videos/);
    assert.match(src, /business/);
    assert.match(src, /md:hidden/);
  });

  it("AppShell mounts tab bar and layout composer without FAB", () => {
    const shell = readFileSync(join(__dirname, "AppShell.tsx"), "utf8");
    const header = readFileSync(join(__dirname, "AppHeader.tsx"), "utf8");
    assert.match(shell, /OwnerMobileTabBar/);
    assert.match(shell, /OwnerComposer/);
    assert.doesNotMatch(header, /OrchestratorChatFab/);
    assert.doesNotMatch(shell, /OrchestratorChatFab/);
    assert.doesNotMatch(header, /fixed[\s\S]*bottom-[\s\S]*Abrir chat|OrchestratorChatToggle/);
    assert.match(
      shell,
      /pb-\[calc\(11\.5rem\+env\(safe-area-inset-bottom\)\)\]/,
    );
  });
});
