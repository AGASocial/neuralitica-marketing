/**
 * US-9.1 Phase B — parseColdOpenTrimSec.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseColdOpenTrimSec } from "./parse-cold-open-trim-sec.ts";

describe("parseColdOpenTrimSec", () => {
  it("accepts 1–2 digit integers within bounds", () => {
    assert.equal(
      parseColdOpenTrimSec({ coldOpenNotes: "2", targetDurationSec: 30 }),
      2,
    );
    assert.equal(
      parseColdOpenTrimSec({ coldOpenNotes: " 15 ", targetDurationSec: 30 }),
      15,
    );
  });

  it("treats 0 as skip", () => {
    assert.equal(
      parseColdOpenTrimSec({ coldOpenNotes: "0", targetDurationSec: 30 }),
      null,
    );
  });

  it("rejects free text and metacharacters", () => {
    assert.equal(
      parseColdOpenTrimSec({
        coldOpenNotes: "Abrir con la toma; rm -rf /",
        targetDurationSec: 30,
      }),
      null,
    );
    assert.equal(
      parseColdOpenTrimSec({
        coldOpenNotes: "2s",
        targetDurationSec: 30,
      }),
      null,
    );
    assert.equal(
      parseColdOpenTrimSec({
        coldOpenNotes: "-1",
        targetDurationSec: 30,
      }),
      null,
    );
  });

  it("rejects out of bounds vs target and max 30", () => {
    assert.equal(
      parseColdOpenTrimSec({ coldOpenNotes: "31", targetDurationSec: 45 }),
      null,
    );
    assert.equal(
      parseColdOpenTrimSec({ coldOpenNotes: "20", targetDurationSec: 15 }),
      null,
    );
  });

  it("null/empty → skip", () => {
    assert.equal(
      parseColdOpenTrimSec({ coldOpenNotes: null, targetDurationSec: 30 }),
      null,
    );
    assert.equal(
      parseColdOpenTrimSec({ coldOpenNotes: "", targetDurationSec: 30 }),
      null,
    );
  });
});
