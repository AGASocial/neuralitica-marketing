import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  persistInterviewDraftInputSchema,
  type InterviewAnswers,
} from "../contracts/interview";
import {
  interviewConflictError,
  interviewForbiddenFieldsError,
  interviewPayloadTooLargeError,
  interviewValidationError,
} from "./errors";
import {
  coerceStoredAnswers,
  decideDraftWrite,
  decideUniqueRaceWrite,
  findForbiddenInterviewKeys,
  isAnswersPayloadTooLarge,
  mergeInterviewAnswers,
  resumeCursorAfterSave,
  stripInterviewIdentityKeys,
  toInterviewDraftView,
} from "./merge-answers";
import { zodInterviewErrorToFieldErrors } from "./zod-field-errors";

function parsePersist(raw: unknown) {
  const parsed = persistInterviewDraftInputSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true as const, data: parsed.data };
  }
  return {
    ok: false as const,
    fields: zodInterviewErrorToFieldErrors(parsed.error),
  };
}

describe("mergeInterviewAnswers", () => {
  it("replaces only the seven step keys and keeps stored values for others", () => {
    const stored: InterviewAnswers = {
      services: { items: ["Emergency plumbing", "Drain cleaning"] },
    };
    const incoming: InterviewAnswers = {
      zone: { description: "Austin, Texas and nearby ZIP codes" },
    };
    const merged = mergeInterviewAnswers(stored, incoming);
    assert.deepEqual(merged, {
      services: { items: ["Emergency plumbing", "Drain cleaning"] },
      zone: { description: "Austin, Texas and nearby ZIP codes" },
    });
  });

  it("replaces a key wholesale and drops unknown keys from stored JSON", () => {
    const stored = {
      services: { items: ["A"] },
      extra: { dump: true },
    } as InterviewAnswers;
    const incoming: InterviewAnswers = {
      services: { items: ["B"] },
    };
    const merged = mergeInterviewAnswers(
      coerceStoredAnswers(stored),
      incoming,
    );
    assert.deepEqual(merged, { services: { items: ["B"] } });
    assert.equal("extra" in merged, false);
  });
});

describe("resumeCursorAfterSave (high-water)", () => {
  it("advances to the next step on first persist of services", () => {
    assert.equal(resumeCursorAfterSave("services", null), "zone");
  });

  it("stays on restrictions after saving restrictions", () => {
    assert.equal(resumeCursorAfterSave("restrictions", "style"), "restrictions");
    assert.equal(resumeCursorAfterSave("restrictions", null), "restrictions");
  });

  it("does not rewind when re-saving an earlier step", () => {
    assert.equal(resumeCursorAfterSave("services", "offers"), "offers");
    assert.equal(resumeCursorAfterSave("zone", "restrictions"), "restrictions");
    assert.equal(resumeCursorAfterSave("style", "zone"), "restrictions");
  });
});

describe("persist validation 400", () => {
  it("rejects empty services items with too_small on services.items", () => {
    const result = parsePersist({
      currentStep: "services",
      answers: { services: { items: [] } },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.fields["services.items"], ["too_small"]);
    }
    const envelope = interviewValidationError(
      result.ok ? {} : result.fields,
    );
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, "VALIDATION_ERROR");
    assert.equal(envelope.error.messageKey, "interview.errors.validation");
  });

  it("rejects a missing currentStep key with required", () => {
    const result = parsePersist({
      currentStep: "zone",
      answers: {},
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.fields.zone, ["required"]);
    }
  });

  it("rejects unknown top-level keys as unrecognized_key not FORBIDDEN_FIELDS", () => {
    const result = parsePersist({
      currentStep: "services",
      answers: { services: { items: ["Lawn care"] } },
      foo: 1,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.fields.foo, ["unrecognized_key"]);
    }
    assert.equal(findForbiddenInterviewKeys({ foo: 1 }).length, 0);
  });

  it("allows empty restrictions items", () => {
    const result = parsePersist({
      currentStep: "restrictions",
      answers: { restrictions: { items: [] } },
    });
    assert.equal(result.ok, true);
  });
});

describe("oversize 413", () => {
  it("rejects merged answers above 65536 UTF-8 bytes", () => {
    const item = "文".repeat(500);
    const list = { items: Array.from({ length: 20 }, () => item) };
    const answers: InterviewAnswers = {
      services: list,
      offers: list,
      objections: list,
    };
    assert.equal(isAnswersPayloadTooLarge(answers), true);
    const envelope = interviewPayloadTooLargeError();
    assert.equal(envelope.error.code, "PAYLOAD_TOO_LARGE");
    assert.equal(envelope.error.messageKey, "interview.errors.payloadTooLarge");
    assert.equal(envelope.error.fields, undefined);
  });

  it("accepts a small valid payload", () => {
    assert.equal(
      isAnswersPayloadTooLarge({
        services: { items: ["Emergency plumbing"] },
      }),
      false,
    );
  });
});

describe("identity strip vs privilege reject", () => {
  it("strips client_id and still parses the persist body", () => {
    const raw = {
      currentStep: "services",
      answers: { services: { items: ["Roof repair"] } },
      client_id: "00000000-0000-0000-0000-000000000099",
      clientId: "00000000-0000-0000-0000-000000000098",
      id: "00000000-0000-0000-0000-000000000097",
      session_id: "00000000-0000-0000-0000-000000000096",
      sessionId: "00000000-0000-0000-0000-000000000095",
    };
    const stripped = stripInterviewIdentityKeys(raw);
    const result = parsePersist(stripped);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.currentStep, "services");
      assert.deepEqual(result.data.answers.services, {
        items: ["Roof repair"],
      });
    }
    assert.equal(
      stripped !== null &&
        typeof stripped === "object" &&
        "client_id" in stripped,
      false,
    );
  });

  it("rejects status=completed as FORBIDDEN_FIELDS and does not parse as a write", () => {
    const raw = {
      currentStep: "services",
      answers: { services: { items: ["Lawn care"] } },
      status: "completed",
    };
    const forbidden = findForbiddenInterviewKeys(raw);
    assert.ok(forbidden.includes("status"));
    assert.equal(interviewForbiddenFieldsError().error.code, "FORBIDDEN_FIELDS");
    assert.ok(findForbiddenInterviewKeys({ STATUS: "draft" }).length > 0);
    assert.ok(findForbiddenInterviewKeys({ role: "operator" }).length > 0);
    assert.ok(findForbiddenInterviewKeys({ active: true }).length > 0);
    assert.ok(findForbiddenInterviewKeys({ auth_user_id: "x" }).length > 0);
    assert.ok(findForbiddenInterviewKeys({ authUserId: "x" }).length > 0);
  });
});

describe("write predicate / completed CONFLICT", () => {
  it("inserts when no row, updates draft, conflicts on completed", () => {
    assert.equal(decideDraftWrite(null), "insert");
    assert.equal(decideDraftWrite({ status: "draft" }), "update");
    assert.equal(decideDraftWrite({ status: "completed" }), "conflict");
    assert.equal(decideUniqueRaceWrite({ status: "completed" }), "conflict");
    assert.equal(decideUniqueRaceWrite({ status: "draft" }), "update");
    assert.equal(decideUniqueRaceWrite(null), "conflict");
    assert.equal(interviewConflictError().error.code, "CONFLICT");
    assert.equal(
      interviewConflictError().error.messageKey,
      "interview.errors.conflict",
    );
  });

  it("load view omits id and can surface completed as-is", () => {
    const view = toInterviewDraftView({
      current_step: "restrictions",
      answers: { restrictions: { items: [] } },
      status: "completed",
    });
    assert.equal(view.status, "completed");
    assert.equal(view.currentStep, "restrictions");
    assert.equal("id" in view, false);
    assert.equal("client_id" in view, false);
  });
});
