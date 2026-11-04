import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STICK_TO_BOTTOM_THRESHOLD_PX,
  distanceFromBottom,
  isNearBottom,
  shouldAutoScroll,
} from "./stick-to-bottom";

describe("stick-to-bottom", () => {
  it("computes distance from bottom", () => {
    assert.equal(
      distanceFromBottom({ scrollTop: 100, scrollHeight: 500, clientHeight: 200 }),
      200,
    );
    assert.equal(
      distanceFromBottom({ scrollTop: 300, scrollHeight: 500, clientHeight: 200 }),
      0,
    );
    assert.equal(
      distanceFromBottom({ scrollTop: 400, scrollHeight: 500, clientHeight: 200 }),
      0,
    );
  });

  it("treats within-threshold as near bottom", () => {
    const near = {
      scrollTop: 500 - 200 - 50,
      scrollHeight: 500,
      clientHeight: 200,
    };
    assert.equal(isNearBottom(near), true);
    assert.equal(isNearBottom(near, 40), false);
    assert.equal(STICK_TO_BOTTOM_THRESHOLD_PX, 80);
  });

  it("does not stick when user scrolled up beyond threshold", () => {
    const scrolledUp = {
      scrollTop: 0,
      scrollHeight: 800,
      clientHeight: 200,
    };
    assert.equal(isNearBottom(scrolledUp), false);
    assert.equal(shouldAutoScroll({ stuck: false }), false);
    assert.equal(shouldAutoScroll({ stuck: true }), true);
    assert.equal(shouldAutoScroll({ force: true, stuck: false }), true);
  });
});
