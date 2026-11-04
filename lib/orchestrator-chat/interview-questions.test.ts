import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInterviewAnswerFragment,
  formatInterviewAnswerPreview,
  interviewStepQuestion,
  isInterviewTextStep,
} from "./interview-questions";

describe("interview-questions helpers", () => {
  it("classifies text vs list steps", () => {
    assert.equal(isInterviewTextStep("zone"), true);
    assert.equal(isInterviewTextStep("services"), false);
  });

  it("builds list and text fragments for persistInterviewDraft", () => {
    const list = buildInterviewAnswerFragment({
      currentStep: "services",
      items: ["  Drain cleaning ", ""],
    });
    assert.deepEqual(list, {
      services: { items: ["Drain cleaning"] },
    });

    const text = buildInterviewAnswerFragment({
      currentStep: "zone",
      description: " Austin TX ",
    });
    assert.deepEqual(text, {
      zone: { description: "Austin TX" },
    });

    assert.equal(
      buildInterviewAnswerFragment({ currentStep: "services", items: [] }),
      null,
    );
    assert.deepEqual(
      buildInterviewAnswerFragment({
        currentStep: "restrictions",
        items: [],
      }),
      { restrictions: { items: [] } },
    );
  });

  it("formats answer previews and locale questions", () => {
    assert.equal(
      formatInterviewAnswerPreview("offers", {
        offers: { items: ["A", "B"] },
      }),
      "A, B",
    );
    const es = interviewStepQuestion("es", "tone");
    assert.match(es.question, /\¿/);
    const en = interviewStepQuestion("en", "tone");
    assert.match(en.question, /How should/);
  });
});
