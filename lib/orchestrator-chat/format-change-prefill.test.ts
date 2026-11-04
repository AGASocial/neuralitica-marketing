import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractLatestCardAnchorId,
  formatChangePrefill,
  readCardAnchorId,
} from "@/lib/orchestrator-chat/format-change-prefill";

describe("formatChangePrefill", () => {
  const cardId = "f24e0fe9-1234-5678-9abc-def012345678";

  it("ES visible text is Cambiar: title without UUID", () => {
    const result = formatChangePrefill({
      title: "Transformación de una pared exterior",
      cardId,
      locale: "es",
    });
    assert.equal(
      result.text,
      "Cambiar: Transformación de una pared exterior",
    );
    assert.doesNotMatch(result.text, /card:/i);
    assert.doesNotMatch(result.text, /f24e0fe9/);
    assert.equal(result.metadata?.cardId, cardId);
  });

  it("EN visible text is Change: title without UUID", () => {
    const result = formatChangePrefill({
      title: "Exterior wall transformation",
      cardId,
      locale: "en",
    });
    assert.equal(result.text, "Change: Exterior wall transformation");
    assert.doesNotMatch(result.text, new RegExp(cardId));
    assert.equal(result.metadata?.cardId, cardId);
  });

  it("empty title uses prefix only", () => {
    assert.equal(
      formatChangePrefill({ title: "  ", cardId, locale: "es" }).text,
      "Cambiar",
    );
    assert.equal(
      formatChangePrefill({ title: "", cardId, locale: "en" }).text,
      "Change",
    );
  });

  it("extractLatestCardAnchorId reads last user metadata", () => {
    assert.equal(readCardAnchorId({ cardId }), cardId);
    assert.equal(readCardAnchorId(null), null);
    assert.equal(
      extractLatestCardAnchorId([
        { role: "user", metadata: { cardId: "old" } },
        { role: "assistant", metadata: { cardId: "nope" } },
        { role: "user", metadata: { cardId } },
      ]),
      cardId,
    );
  });
});
