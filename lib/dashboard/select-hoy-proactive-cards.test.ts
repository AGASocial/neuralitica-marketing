import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HOY_PROACTIVE_CARD_BUDGET,
  selectHoyProactiveCards,
  type HoyProactiveCandidate,
} from "./select-hoy-proactive-cards";

describe("selectHoyProactiveCards", () => {
  it("caps at 5 needs_ok cards", () => {
    const candidates: HoyProactiveCandidate[] = Array.from(
      { length: 8 },
      (_, i) => ({
        id: `ok-${i}`,
        kind: "needs_ok" as const,
        rank: i,
      }),
    );
    const { selected, overflowCount } = selectHoyProactiveCards(candidates);
    assert.equal(selected.length, HOY_PROACTIVE_CARD_BUDGET);
    assert.equal(overflowCount, 3);
    assert.deepEqual(
      selected.map((c) => c.id),
      ["ok-0", "ok-1", "ok-2", "ok-3", "ok-4"],
    );
  });

  it("prefers needs_ok over next_action when budget is tight", () => {
    const candidates: HoyProactiveCandidate[] = [
      { id: "ok-0", kind: "needs_ok", rank: 0 },
      { id: "ok-1", kind: "needs_ok", rank: 1 },
      { id: "ok-2", kind: "needs_ok", rank: 2 },
      { id: "ok-3", kind: "needs_ok", rank: 3 },
      { id: "ok-4", kind: "needs_ok", rank: 4 },
      { id: "next", kind: "next_action", rank: 0 },
    ];
    const { selected } = selectHoyProactiveCards(candidates, 5);
    assert.equal(selected.length, 5);
    assert.equal(
      selected.some((c) => c.kind === "next_action"),
      false,
    );
  });

  it("includes one next_action when there is room", () => {
    const candidates: HoyProactiveCandidate[] = [
      { id: "ok-0", kind: "needs_ok", rank: 0 },
      { id: "ok-1", kind: "needs_ok", rank: 1 },
      { id: "next", kind: "next_action", rank: 0 },
    ];
    const { selected, overflowCount } = selectHoyProactiveCards(candidates, 5);
    assert.equal(selected.length, 3);
    assert.equal(overflowCount, 0);
    assert.equal(selected[2]?.id, "next");
  });
});
