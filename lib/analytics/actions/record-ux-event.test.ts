import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  recordUxEventInputSchema,
  UX_EVENT_NAMES,
} from "@/lib/contracts/ux-analytics";

describe("ux-analytics contracts (KAN-107)", () => {
  it("accepts core event names", () => {
    for (const event of UX_EVENT_NAMES) {
      const parsed = recordUxEventInputSchema.safeParse({
        event,
        props: { acted: false },
      });
      assert.equal(parsed.success, true);
    }
  });

  it("rejects unknown events", () => {
    const parsed = recordUxEventInputSchema.safeParse({
      event: "not_a_real_event",
      props: {},
    });
    assert.equal(parsed.success, false);
  });

  it("migration creates neuramark_ux_events with RLS", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261104140000_neuramark_ux_events.sql",
      ),
      "utf8",
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.neuramark_ux_events/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /client_id/);
    assert.match(sql, /props jsonb/);
  });
});
