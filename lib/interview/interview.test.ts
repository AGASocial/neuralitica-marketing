import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import {
  interviewAnswersCompleteSchema,
  interviewDashboardSummarySchema,
  persistInterviewDraftInputSchema,
  submitInterviewInputSchema,
  type InterviewAnswers,
} from "../contracts/interview";
import {
  mapAnswersToProfileFields,
  validateInterviewCompleteness,
} from "./completeness";
import {
  interviewConflictError,
  interviewForbiddenFieldsError,
  interviewNotFoundError,
  interviewPayloadTooLargeError,
  interviewUnauthenticatedError,
  interviewForbiddenError,
  interviewValidationError,
} from "./errors";
import {
  buildSubmitSuccess,
  coerceStoredAnswers,
  computeHasProgress,
  decideDraftWrite,
  decideSubmitSessionPath,
  decideUniqueRaceWrite,
  findForbiddenInterviewKeys,
  isAnswersPayloadTooLarge,
  mayMarkInterviewCompleted,
  mergeInterviewAnswers,
  resumeCursorAfterSave,
  stripInterviewIdentityKeys,
  stripSubmitInterviewInput,
  summarizeInterviewSessionRow,
  toDashboardSummary,
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

describe("computeHasProgress (US-1.2 freeze)", () => {
  it("is false for empty draft at services", () => {
    assert.equal(computeHasProgress("services", {}), false);
  });

  it("is true when any answers key is present at services", () => {
    assert.equal(
      computeHasProgress("services", {
        services: { items: ["Emergency plumbing"] },
      }),
      true,
    );
    assert.equal(
      computeHasProgress("services", {
        restrictions: { items: [] },
      }),
      true,
    );
  });

  it("is true whenever current_step is past services", () => {
    assert.equal(computeHasProgress("zone", {}), true);
    assert.equal(computeHasProgress("tone", {}), true);
    assert.equal(computeHasProgress("restrictions", {}), true);
  });
});

describe("toDashboardSummary (US-1.2)", () => {
  it("maps empty draft to Start shape (hasProgress false)", () => {
    const summary = toDashboardSummary({
      current_step: "services",
      answers: {},
      status: "draft",
    });
    assert.deepEqual(summary, {
      status: "draft",
      currentStep: "services",
      hasProgress: false,
    });
    assert.equal("answers" in summary, false);
    assert.equal("id" in summary, false);
    assert.equal("client_id" in summary, false);
    assert.equal(interviewDashboardSummarySchema.safeParse(summary).success, true);
  });

  it("maps draft with progress to Resume shape", () => {
    const summary = toDashboardSummary({
      current_step: "tone",
      answers: {
        services: { items: ["Emergency plumbing"] },
        zone: { description: "Austin metro" },
      },
      status: "draft",
    });
    assert.deepEqual(summary, {
      status: "draft",
      currentStep: "tone",
      hasProgress: true,
    });
    assert.equal("answers" in summary, false);
  });

  it("maps completed without returning answers", () => {
    const summary = toDashboardSummary({
      current_step: "restrictions",
      answers: {
        services: { items: ["Emergency plumbing"] },
        zone: { description: "Austin metro" },
        tone: { description: "Warm and plain" },
        offers: { items: ["Same-week visit"] },
        objections: { items: ["Price"] },
        style: { description: "Short sentences" },
        restrictions: { items: [] },
      },
      status: "completed",
    });
    assert.deepEqual(summary, {
      status: "completed",
      currentStep: "restrictions",
      hasProgress: true,
    });
    assert.equal("answers" in summary, false);
  });
});

describe("summarizeInterviewSessionRow (US-1.2 dashboard)", () => {
  it("returns null when no row (not started → Start)", () => {
    assert.equal(summarizeInterviewSessionRow(null), null);
  });

  it("returns empty draft / progress / completed without answers or ids", () => {
    assert.deepEqual(
      summarizeInterviewSessionRow({
        current_step: "services",
        answers: {},
        status: "draft",
      }),
      {
        status: "draft",
        currentStep: "services",
        hasProgress: false,
      },
    );

    assert.deepEqual(
      summarizeInterviewSessionRow({
        current_step: "tone",
        answers: { services: { items: ["Emergency plumbing"] } },
        status: "draft",
      }),
      {
        status: "draft",
        currentStep: "tone",
        hasProgress: true,
      },
    );

    const completed = summarizeInterviewSessionRow({
      current_step: "restrictions",
      answers: {
        services: { items: ["Emergency plumbing"] },
        restrictions: { items: [] },
      },
      status: "completed",
    });
    assert.deepEqual(completed, {
      status: "completed",
      currentStep: "restrictions",
      hasProgress: true,
    });
    assert.ok(completed);
    assert.equal("answers" in completed, false);
    assert.equal("id" in completed, false);
    assert.equal("client_id" in completed, false);
  });
});

describe("getInterviewDashboardSummary signature (IDOR)", () => {
  it("accepts no client_id / session id parameters", async () => {
    const nodeModule = Module as unknown as {
      _load: (
        request: string,
        parent: NodeModule | null | undefined,
        isMain: boolean,
      ) => unknown;
    };
    const originalLoad = nodeModule._load;
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      for (const key of Object.keys(require.cache)) {
        if (
          key.replace(/\\/g, "/").includes("/lib/interview/get-interview-dashboard-summary")
        ) {
          delete require.cache[key];
        }
      }
      const { getInterviewDashboardSummary } = await import(
        "./get-interview-dashboard-summary.ts"
      );
      assert.equal(getInterviewDashboardSummary.length, 0);
    } finally {
      nodeModule._load = originalLoad;
    }
  });
});

const COMPLETE_ANSWERS = {
  services: { items: ["Emergency plumbing"] },
  zone: { description: "Austin metro" },
  tone: { description: "Warm and plain" },
  offers: { items: ["Same-week visit"] },
  objections: { items: ["Price"] },
  style: { description: "Short sentences" },
  restrictions: { items: [] },
} as const;

describe("US-1.3 completeness Zod", () => {
  it("accepts all seven keys with empty restrictions.items", () => {
    const result = validateInterviewCompleteness(COMPLETE_ANSWERS);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.fields.restrictions, { items: [] });
      assert.deepEqual(
        mapAnswersToProfileFields(result.fields),
        interviewAnswersCompleteSchema.parse(COMPLETE_ANSWERS),
      );
    }
  });

  it("rejects missing zone with required field error (no write implied)", () => {
    const { zone: _omit, ...incomplete } = COMPLETE_ANSWERS;
    const result = validateInterviewCompleteness(incomplete);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.fieldErrors.zone, ["required"]);
    }
    const envelope = interviewValidationError(
      result.ok ? {} : result.fieldErrors,
    );
    assert.equal(envelope.error.code, "VALIDATION_ERROR");
  });

  it("rejects empty services.items with too_small", () => {
    const result = validateInterviewCompleteness({
      ...COMPLETE_ANSWERS,
      services: { items: [] },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.fieldErrors["services.items"], ["too_small"]);
    }
  });
});

describe("US-1.3 submit strip / reject / answers SoT", () => {
  it("rejects status as FORBIDDEN_FIELDS before empty-body parse", () => {
    const raw = { status: "completed" };
    assert.ok(findForbiddenInterviewKeys(raw).includes("status"));
    assert.equal(
      interviewForbiddenFieldsError().error.code,
      "FORBIDDEN_FIELDS",
    );
  });

  it("strips client_id / source_interview_id / profile_id and parses {}", () => {
    const stripped = stripSubmitInterviewInput({
      client_id: "00000000-0000-0000-0000-000000000099",
      source_interview_id: "00000000-0000-0000-0000-000000000088",
      profile_id: "00000000-0000-0000-0000-000000000077",
      sourceInterviewId: "x",
      profileId: "y",
    });
    const parsed = submitInterviewInputSchema.safeParse(stripped);
    assert.equal(parsed.success, true);
    assert.equal(
      stripped !== null &&
        typeof stripped === "object" &&
        "client_id" in stripped,
      false,
    );
    assert.equal(
      stripped !== null &&
        typeof stripped === "object" &&
        "source_interview_id" in stripped,
      false,
    );
  });

  it("strips forged answers then parses empty body (DB remains SoT)", () => {
    const stripped = stripSubmitInterviewInput({
      answers: COMPLETE_ANSWERS,
    });
    assert.equal(
      stripped !== null &&
        typeof stripped === "object" &&
        "answers" in stripped,
      false,
    );
    assert.equal(submitInterviewInputSchema.safeParse(stripped).success, true);
  });

  it("persist strip also drops source_interview_id (identity class)", () => {
    const stripped = stripInterviewIdentityKeys({
      currentStep: "services",
      answers: { services: { items: ["A"] } },
      source_interview_id: "00000000-0000-0000-0000-000000000088",
    });
    assert.equal(
      stripped !== null &&
        typeof stripped === "object" &&
        "source_interview_id" in stripped,
      false,
    );
  });
});

describe("US-1.3 fail-closed ordering + soft success", () => {
  it("mayMarkInterviewCompleted is false until profile upsert succeeds", () => {
    assert.equal(mayMarkInterviewCompleted(false), false);
    assert.equal(mayMarkInterviewCompleted(true), true);
  });

  it("not_found / draft / already_completed decisions", () => {
    assert.equal(decideSubmitSessionPath(null).kind, "not_found");
    assert.equal(interviewNotFoundError().error.code, "CONFLICT");
    assert.equal(
      interviewNotFoundError().error.messageKey,
      "interview.errors.notFound",
    );

    const draft = decideSubmitSessionPath({
      id: "sess-1",
      status: "draft",
      answers: { services: { items: ["A"] } },
    });
    assert.equal(draft.kind, "draft");
    if (draft.kind === "draft") {
      assert.equal(draft.sessionId, "sess-1");
    }

    const done = decideSubmitSessionPath({
      id: "sess-1",
      status: "completed",
      answers: COMPLETE_ANSWERS,
    });
    assert.equal(done.kind, "already_completed");
  });

  it("idempotent soft success shape (alreadyCompleted true)", () => {
    const success = buildSubmitSuccess({
      alreadyCompleted: true,
      version: 1,
    });
    assert.deepEqual(success, {
      ok: true,
      alreadyCompleted: true,
      redirectTo: "/profile",
      profile: { exists: true, version: 1 },
      interview: { status: "completed" },
    });
    assert.equal("fields" in success.profile, false);
  });

  it("first submit success shape (alreadyCompleted false)", () => {
    const success = buildSubmitSuccess({
      alreadyCompleted: false,
      version: 1,
    });
    assert.equal(success.alreadyCompleted, false);
    assert.equal(success.redirectTo, "/profile");
  });

  it("draft persist still conflicts on completed (US-1.1/1.2 regression)", () => {
    assert.equal(decideDraftWrite({ status: "completed" }), "conflict");
    assert.equal(interviewConflictError().error.code, "CONFLICT");
  });
});

describe("US-1.3 auth envelopes (no write implied)", () => {
  it("maps unauthenticated / forbidden codes for submit", () => {
    assert.equal(
      interviewUnauthenticatedError().error.code,
      "UNAUTHENTICATED",
    );
    assert.equal(interviewForbiddenError().error.code, "FORBIDDEN");
  });
});

describe("submitInterview signature (optional empty body)", () => {
  it("export accepts at most one optional argument", async () => {
    const nodeModule = Module as unknown as {
      _load: (
        request: string,
        parent: NodeModule | null | undefined,
        isMain: boolean,
      ) => unknown;
    };
    const originalLoad = nodeModule._load;
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      for (const key of Object.keys(require.cache)) {
        if (
          key.replace(/\\/g, "/").includes("/lib/interview/actions/submit-interview")
        ) {
          delete require.cache[key];
        }
      }
      const { submitInterview } = await import(
        "./actions/submit-interview.ts"
      );
      assert.ok(submitInterview.length <= 1);
    } finally {
      nodeModule._load = originalLoad;
    }
  });
});

describe("getProfileStubSummary signature (IDOR)", () => {
  it("accepts no client_id / profile id parameters", async () => {
    const nodeModule = Module as unknown as {
      _load: (
        request: string,
        parent: NodeModule | null | undefined,
        isMain: boolean,
      ) => unknown;
    };
    const originalLoad = nodeModule._load;
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      for (const key of Object.keys(require.cache)) {
        if (
          key.replace(/\\/g, "/").includes("/lib/profile/get-profile-stub-summary")
        ) {
          delete require.cache[key];
        }
      }
      const { getProfileStubSummary } = await import(
        "../profile/get-profile-stub-summary.ts"
      );
      assert.equal(getProfileStubSummary.length, 0);
    } finally {
      nodeModule._load = originalLoad;
    }
  });
});
