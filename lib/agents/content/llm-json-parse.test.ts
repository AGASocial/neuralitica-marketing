import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const nodeModule = Module as unknown as NodeModuleLoad;
const originalLoad = nodeModule._load.bind(nodeModule);
nodeModule._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

describe("tryParseLlmJson", () => {
  it("parses fenced JSON with prose around it", async () => {
    const { tryParseLlmJson } = await import("./generate-reel-script");
    const out = tryParseLlmJson('Here you go:\n```json\n{"a": 1}\n```\nThanks');
    assert.deepEqual(out, { a: 1 });
  });

  it("repairs raw newlines inside strings and trailing commas", async () => {
    const { tryParseLlmJson } = await import("./generate-reel-script");
    const out = tryParseLlmJson('{"hook": "line one\nline two", "list": [1, 2,],}');
    assert.deepEqual(out, { hook: "line one\nline two", list: [1, 2] });
  });

  it("returns undefined for non-JSON", async () => {
    const { tryParseLlmJson } = await import("./generate-reel-script");
    assert.equal(tryParseLlmJson("sorry, I cannot help"), undefined);
  });
});
