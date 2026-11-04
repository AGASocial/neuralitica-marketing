import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FALLBACK_REEL_DURATION_POLICIES } from "@/lib/contracts/reel-duration-policy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

describe("neuramark_reel_duration_policies migration", () => {
  it("creates modality-keyed table with RLS and seed rows", () => {
    const migration = readFileSync(
      path.join(
        repoRoot,
        "supabase/migrations/20261103220000_neuramark_reel_duration_policies.sql",
      ),
      "utf8",
    );
    assert.match(migration, /neuramark_reel_duration_policies/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /modality_key IN \('avatar', 'faceless'\)/);
    assert.match(migration, /'avatar'/);
    assert.match(migration, /'faceless'/);
    assert.match(migration, /avatar_segment_max_sec/);
    assert.match(migration, /broll_cutaways_allowed/);
    // Seeded avatar bounds
    assert.match(migration, /\b8,\s*\n\s*15,\s*\n\s*8,\s*\n\s*1,\s*\n\s*2/);
    // Seeded faceless bounds
    assert.match(migration, /\b15,\s*\n\s*45/);
  });
});

describe("FALLBACK_REEL_DURATION_POLICIES", () => {
  it("matches product avatar 8–15 / segment ≤8 / 1–2 / cutaways", () => {
    const { avatar, faceless } = FALLBACK_REEL_DURATION_POLICIES;
    assert.equal(avatar.targetDurationSecMin, 8);
    assert.equal(avatar.targetDurationSecMax, 15);
    assert.equal(avatar.avatarSegmentMaxSec, 8);
    assert.equal(avatar.avatarSegmentsMin, 1);
    assert.equal(avatar.avatarSegmentsMax, 2);
    assert.equal(avatar.brollCutawaysAllowed, true);
    assert.equal(faceless.targetDurationSecMin, 15);
    assert.equal(faceless.targetDurationSecMax, 45);
    assert.equal(faceless.avatarSegmentMaxSec, null);
    assert.equal(faceless.brollCutawaysAllowed, false);
  });
});
