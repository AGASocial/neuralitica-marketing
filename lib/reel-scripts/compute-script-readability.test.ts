/**
 * US-5.2 Script readability — pure compute, save hook, mapper, security.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { ReelScriptPackage } from "../contracts/reel-script";
import {
  assertScriptReadabilityForSave,
  computeScriptReadabilityMetrics,
  countVoiceoverWords,
  parseOnScreenBeats,
} from "./compute-script-readability";

const WEEK_START = "2026-01-05";
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const STRATEGY_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const actionsDir = path.join(repoRoot, "lib/reel-scripts/actions");

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

function basePackage(overrides: Partial<ReelScriptPackage> = {}): ReelScriptPackage {
  return {
    hook: "Hook text",
    body: "Body text for the reel script package.",
    cta: "Save this reel.",
    onScreenText: "Short beat",
    voiceoverText: words(38),
    targetDurationSec: 15,
    ...overrides,
  };
}

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearReadabilityModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/reel-scripts/") ||
      normalized.includes("/lib/content-strategy/load-approved-strategy-for-week") ||
      normalized.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

function installReadabilityMocks(options: {
  requireOperator?: () => Promise<unknown>;
}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (request === "next/cache") {
      return { revalidatePath: () => {} };
    }
    if (
      request === "@/lib/auth/require-user" ||
      String(request).includes("lib/auth/require-user")
    ) {
      return {
        isAuthGuardError: (error: unknown) =>
          Boolean(
            error &&
              typeof error === "object" &&
              "status" in error &&
              ((error as { status: number }).status === 401 ||
                (error as { status: number }).status === 403),
          ),
        requireOperator:
          options.requireOperator ??
          (async () => ({
            id: OPERATOR_ID,
            email: "operator@example.com",
            displayName: "Operator",
            preferredLocale: "en",
            role: "operator",
            active: true,
          })),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  return () => {
    nodeModule._load = originalLoad;
  };
}

describe("computeScriptReadabilityMetrics (US-5.2)", () => {
  it("1 — beat at exactly 40 chars has no chars_exceeded", () => {
    const beat = "a".repeat(40);
    const metrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText: beat }),
    );
    assert.equal(metrics.onScreen.beatLines[0].charCount, 40);
    assert.deepEqual(metrics.onScreen.beatLines[0].warnings, []);
    assert.ok(!metrics.onScreen.warnings.includes("beat_chars"));
  });

  it("2 — beat at 41 chars triggers chars_exceeded and beat_chars", () => {
    const beat = "a".repeat(41);
    const metrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText: beat }),
    );
    assert.deepEqual(metrics.onScreen.beatLines[0].warnings, ["chars_exceeded"]);
    assert.ok(metrics.onScreen.warnings.includes("beat_chars"));
    assert.equal(metrics.hasWarnings, true);
  });

  it("3 — empty lines stripped from onScreenText", () => {
    const beats = parseOnScreenBeats("a\n\nb");
    assert.deepEqual(beats, ["a", "b"]);
    const metrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText: "a\n\nb" }),
    );
    assert.equal(metrics.onScreen.totalBeatLines, 2);
    assert.deepEqual(
      metrics.onScreen.beatLines.map((beat) => beat.index),
      [0, 1],
    );
  });

  it("4 — whitespace trim on beat segments", () => {
    const metrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText: "  hello  \n world " }),
    );
    assert.equal(metrics.onScreen.beatLines[0].text, "hello");
    assert.equal(metrics.onScreen.beatLines[0].charCount, 5);
    assert.equal(metrics.onScreen.beatLines[1].text, "world");
    assert.equal(metrics.onScreen.beatLines[1].charCount, 5);
  });

  it("5 — 9 beat lines triggers too_many_beats", () => {
    const onScreenText = Array.from({ length: 9 }, (_, i) => `beat${i}`).join(
      "\n",
    );
    const metrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText }),
    );
    assert.equal(metrics.onScreen.totalBeatLines, 9);
    assert.ok(metrics.onScreen.warnings.includes("too_many_beats"));
  });

  it("6 — 8 beat lines does not trigger too_many_beats", () => {
    const onScreenText = Array.from({ length: 8 }, (_, i) => `beat${i}`).join(
      "\n",
    );
    const metrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText }),
    );
    assert.equal(metrics.onScreen.totalBeatLines, 8);
    assert.ok(!metrics.onScreen.warnings.includes("too_many_beats"));
  });

  it("7 — VO at target word count is ok", () => {
    const metrics = computeScriptReadabilityMetrics(
      basePackage({
        targetDurationSec: 15,
        voiceoverText: words(38),
      }),
    );
    assert.equal(metrics.voiceover.targetWordCount, 38);
    assert.equal(metrics.voiceover.wordCount, 38);
    assert.equal(metrics.voiceover.status, "ok");
  });

  it("8 — VO over +15% threshold", () => {
    const metrics = computeScriptReadabilityMetrics(
      basePackage({
        targetDurationSec: 15,
        voiceoverText: words(45),
      }),
    );
    assert.equal(metrics.voiceover.wordCount, 45);
    assert.equal(metrics.voiceover.status, "over");
  });

  it("9 — VO under −30% threshold", () => {
    const metrics = computeScriptReadabilityMetrics(
      basePackage({
        targetDurationSec: 15,
        voiceoverText: words(25),
      }),
    );
    assert.equal(metrics.voiceover.wordCount, 25);
    assert.equal(metrics.voiceover.status, "under");
  });

  it("10 — unicode emoji uses UTF-16 .length", () => {
    const emojiBeat = "😀".repeat(20);
    assert.equal(emojiBeat.length, 40);
    const metrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText: emojiBeat }),
    );
    assert.equal(metrics.onScreen.beatLines[0].charCount, 40);
    assert.deepEqual(metrics.onScreen.beatLines[0].warnings, []);

    const overEmoji = "😀".repeat(21);
    assert.equal(overEmoji.length, 42);
    const overMetrics = computeScriptReadabilityMetrics(
      basePackage({ onScreenText: overEmoji }),
    );
    assert.equal(overMetrics.onScreen.beatLines[0].charCount, 42);
    assert.ok(
      overMetrics.onScreen.beatLines[0].warnings.includes("chars_exceeded"),
    );
  });

  it("11 — hasWarnings false when beats and VO are ok", () => {
    const metrics = computeScriptReadabilityMetrics(
      basePackage({
        onScreenText: "ok beat",
        voiceoverText: words(38),
        targetDurationSec: 15,
      }),
    );
    assert.equal(metrics.hasWarnings, false);
    assert.equal(metrics.voiceover.status, "ok");
    assert.equal(metrics.onScreen.warnings.length, 0);
    assert.ok(metrics.onScreen.beatLines.every((beat) => beat.warnings.length === 0));
  });
});

describe("assertScriptReadabilityForSave (US-5.2)", () => {
  it("12 — returns ok when metrics are clean", () => {
    const result = assertScriptReadabilityForSave(
      basePackage({
        onScreenText: "ok beat",
        voiceoverText: words(38),
        targetDurationSec: 15,
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.metrics.hasWarnings, false);
    }
  });

  it("13 — returns issues matching warnings when metrics fail", () => {
    const result = assertScriptReadabilityForSave(
      basePackage({
        onScreenText: "a".repeat(41),
        voiceoverText: words(45),
        targetDurationSec: 15,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      const codes = result.issues.map((issue) => issue.code);
      assert.ok(codes.includes("beat_chars_exceeded"));
      assert.ok(codes.includes("voiceover_over"));
      assert.equal(result.issues[0].messageKey.startsWith("scripts.readability."), true);
    }
  });
});

describe("buildReelScriptListForStrategy readability (US-5.2)", () => {
  it("14 — generated item has readability; pending has null", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(Module);
    const scriptPackage = basePackage({ onScreenText: "generated beat" });

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      if (
        request === "@/lib/reel-scripts/persist-reel-script" ||
        String(request).includes("persist-reel-script")
      ) {
        return {
          listReelScriptsForStrategy: async () => [
            {
              id: "11111111-1111-4111-8111-111111111111",
              clientId: OPERATOR_ID,
              strategyId: STRATEGY_ID,
              slotIndex: 0,
              modalidad: "faceless",
              package: scriptPackage,
              mustDiscloseNotOwner: false,
            },
          ],
          hasOrphanedScriptsForWeek: async () => false,
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    try {
      clearReadabilityModuleCache();
      const { buildReelScriptListForStrategy } = require("./list-reel-scripts-for-week.ts");
      const { items } = await buildReelScriptListForStrategy({
        clientId: OPERATOR_ID,
        weekStart: WEEK_START,
        strategyId: STRATEGY_ID,
        version: 1,
        brief: {
          pillars: ["Trust"],
          themes: ["Winter"],
          slots: [
            {
              slotIndex: 0,
              dayOfWeek: "monday",
              tema: "Generated slot",
              goal: "trust",
              formatoPlaybookSlug: "tip-rapido",
              modalidad: "faceless",
            },
            {
              slotIndex: 1,
              dayOfWeek: "wednesday",
              tema: "Pending slot",
              goal: "education",
              formatoPlaybookSlug: "tip-rapido",
              modalidad: "faceless",
            },
          ],
        },
      });

      assert.equal(items.length, 2);
      assert.equal(items[0].status, "generated");
      assert.notEqual(items[0].readability, null);
      assert.equal(items[0].readability?.onScreen.totalBeatLines, 1);
      assert.equal(items[1].status, "pending");
      assert.equal(items[1].readability, null);
    } finally {
      nodeModule._load = originalLoad;
      clearReadabilityModuleCache();
    }
  });
});

describe("readability security regression (US-5.2)", () => {
  it("S1 — non-operator getReelScriptsForWeek returns 403", async () => {
    const restore = installReadabilityMocks({
      requireOperator: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      },
    });
    try {
      clearReadabilityModuleCache();
      const { getReelScriptsForWeek } = require("./actions/get-reel-scripts-for-week.ts");
      const result = await getReelScriptsForWeek({ weekStart: WEEK_START });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
    } finally {
      restore();
      clearReadabilityModuleCache();
    }
  });

  it("S2 — smuggled maxCharsPerBeat returns FORBIDDEN_FIELDS", async () => {
    const restore = installReadabilityMocks({});
    try {
      clearReadabilityModuleCache();
      const { getReelScriptsForWeek } = require("./actions/get-reel-scripts-for-week.ts");
      const result = await getReelScriptsForWeek({
        weekStart: WEEK_START,
        maxCharsPerBeat: 99,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      restore();
      clearReadabilityModuleCache();
    }
  });

  it("S3 — no updateReelScript* Server Action export", () => {
    const actionFiles = readdirSync(actionsDir).filter((name) => name.endsWith(".ts"));
    for (const file of actionFiles) {
      const source = readFileSync(path.join(actionsDir, file), "utf8");
      assert.match(source, /export async function (?!updateReelScript)/);
      assert.doesNotMatch(source, /export async function updateReelScript/);
    }

    const reelScriptsIndex = path.join(repoRoot, "lib/reel-scripts");
    for (const file of readdirSync(readdirSync(reelScriptsIndex).length ? reelScriptsIndex : actionsDir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const fullPath = path.join(reelScriptsIndex, file);
      if (!fullPath.includes("actions")) {
        const source = readFileSync(fullPath, "utf8");
        assert.doesNotMatch(source, /export async function updateReelScript/);
      }
    }
  });
});

describe("countVoiceoverWords helper (US-5.2)", () => {
  it("counts whitespace-separated tokens", () => {
    assert.equal(countVoiceoverWords("  one   two three  "), 3);
    assert.equal(countVoiceoverWords(""), 0);
  });
});
