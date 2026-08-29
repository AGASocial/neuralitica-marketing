import {
  INTERVIEW_ANSWERS_MAX_UTF8_BYTES,
  INTERVIEW_STEP_ORDER,
  interviewAnswersStoredSchema,
  interviewDashboardSummarySchema,
  interviewSessionStatusSchema,
  interviewStepKeySchema,
  type InterviewAnswers,
  type InterviewDashboardSummaryRow,
  type InterviewDraftView,
  type InterviewSessionStatus,
  type InterviewStepKey,
} from "../contracts/interview";

const REJECT_KEYS = new Set([
  "status",
  "role",
  "active",
  "auth_user_id",
  "authuserid",
]);

const STRIP_KEYS = new Set([
  "client_id",
  "clientid",
  "id",
  "session_id",
  "sessionid",
]);

export type DraftWriteDecision = "insert" | "update" | "conflict";

/** Privilege / completeness keys: reject before Zod. Case-insensitive names. */
export function findForbiddenInterviewKeys(input: unknown): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  return Object.keys(input).filter((key) => REJECT_KEYS.has(key.toLowerCase()));
}

/** Identity keys: strip and ignore. Never used in queries. */
export function stripInterviewIdentityKeys(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (STRIP_KEYS.has(key.toLowerCase())) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function mergeInterviewAnswers(
  stored: InterviewAnswers | null | undefined,
  incoming: InterviewAnswers,
): InterviewAnswers {
  const merged: InterviewAnswers = {};
  const base = stored ?? {};

  for (const key of INTERVIEW_STEP_ORDER) {
    const existing = base[key];
    if (existing != null) {
      assignStep(merged, key, existing);
    }
  }

  for (const key of INTERVIEW_STEP_ORDER) {
    const next = incoming[key];
    if (next != null) {
      assignStep(merged, key, next);
    }
  }

  return merged;
}

function assignStep(
  target: InterviewAnswers,
  key: InterviewStepKey,
  value: NonNullable<InterviewAnswers[InterviewStepKey]>,
): void {
  switch (key) {
    case "services":
      target.services = value as InterviewAnswers["services"];
      break;
    case "zone":
      target.zone = value as InterviewAnswers["zone"];
      break;
    case "tone":
      target.tone = value as InterviewAnswers["tone"];
      break;
    case "offers":
      target.offers = value as InterviewAnswers["offers"];
      break;
    case "objections":
      target.objections = value as InterviewAnswers["objections"];
      break;
    case "style":
      target.style = value as InterviewAnswers["style"];
      break;
    case "restrictions":
      target.restrictions = value as InterviewAnswers["restrictions"];
      break;
  }
}

export function nextInterviewStep(step: InterviewStepKey): InterviewStepKey {
  if (step === "restrictions") {
    return "restrictions";
  }
  const index = INTERVIEW_STEP_ORDER.indexOf(step);
  return INTERVIEW_STEP_ORDER[index + 1] ?? "restrictions";
}

export function laterInterviewStep(
  a: InterviewStepKey,
  b: InterviewStepKey,
): InterviewStepKey {
  return INTERVIEW_STEP_ORDER.indexOf(a) >= INTERVIEW_STEP_ORDER.indexOf(b)
    ? a
    : b;
}

/**
 * High-water resume cursor. Re-saving an earlier step does not rewind.
 * No existing row is treated as `services`.
 */
export function resumeCursorAfterSave(
  savedStep: InterviewStepKey,
  existingCursor: InterviewStepKey | null,
): InterviewStepKey {
  if (savedStep === "restrictions") {
    return "restrictions";
  }
  const existing = existingCursor ?? "services";
  return laterInterviewStep(existing, nextInterviewStep(savedStep));
}

export function answersUtf8ByteLength(answers: InterviewAnswers): number {
  return Buffer.byteLength(JSON.stringify(answers), "utf8");
}

export function isAnswersPayloadTooLarge(answers: InterviewAnswers): boolean {
  return answersUtf8ByteLength(answers) > INTERVIEW_ANSWERS_MAX_UTF8_BYTES;
}

export function decideDraftWrite(
  row: { status: string } | null,
): DraftWriteDecision {
  if (row == null) {
    return "insert";
  }
  if (row.status !== "draft") {
    return "conflict";
  }
  return "update";
}

/** After UNIQUE(client_id) race: SELECT; never UPDATE a non-draft row. */
export function decideUniqueRaceWrite(
  row: { status: string } | null,
): DraftWriteDecision {
  if (row == null) {
    return "conflict";
  }
  return decideDraftWrite(row);
}

export function coerceStoredAnswers(raw: unknown): InterviewAnswers {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const source = raw as Record<string, unknown>;
  const picked: Record<string, unknown> = {};

  for (const key of INTERVIEW_STEP_ORDER) {
    if (!(key in source) || source[key] == null) {
      continue;
    }
    const slice = interviewAnswersStoredSchema.safeParse({ [key]: source[key] });
    if (slice.success && slice.data[key] != null) {
      picked[key] = slice.data[key];
    }
  }

  const parsed = interviewAnswersStoredSchema.safeParse(picked);
  return parsed.success ? parsed.data : {};
}

export type InterviewSessionRow = {
  current_step: InterviewStepKey;
  answers: InterviewAnswers;
  status: InterviewSessionStatus;
};

export function toInterviewDraftView(row: {
  current_step: unknown;
  answers: unknown;
  status: unknown;
}): InterviewDraftView {
  return {
    currentStep: interviewStepKeySchema.parse(row.current_step),
    answers: coerceStoredAnswers(row.answers),
    status: interviewSessionStatusSchema.parse(row.status),
  };
}

export function parseSessionRow(row: {
  current_step: unknown;
  answers: unknown;
  status: unknown;
}): InterviewSessionRow {
  const view = toInterviewDraftView(row);
  return {
    current_step: view.currentStep,
    answers: view.answers,
    status: view.status,
  };
}

/**
 * Meaningful progress for dashboard Start vs Resume (US-1.2 freeze).
 * `hasProgress = (current_step !== 'services') OR (at least one answers key present)`.
 */
export function computeHasProgress(
  currentStep: InterviewStepKey,
  answers: InterviewAnswers,
): boolean {
  if (currentStep !== "services") {
    return true;
  }
  return (
    answers.services != null ||
    answers.zone != null ||
    answers.tone != null ||
    answers.offers != null ||
    answers.objections != null ||
    answers.style != null ||
    answers.restrictions != null
  );
}

/** Pure row → dashboard summary (answers used only for hasProgress; never returned). */
export function toDashboardSummary(row: {
  current_step: unknown;
  answers: unknown;
  status: unknown;
}): InterviewDashboardSummaryRow {
  const parsed = parseSessionRow(row);
  const summary = {
    status: parsed.status,
    currentStep: parsed.current_step,
    hasProgress: computeHasProgress(parsed.current_step, parsed.answers),
  };
  return interviewDashboardSummarySchema.parse(summary);
}

/**
 * Map a SELECT result to the dashboard card payload.
 * `null` row → not started (Start CTA). No get-or-create.
 */
export function summarizeInterviewSessionRow(
  row: {
    current_step: unknown;
    answers: unknown;
    status: unknown;
  } | null,
): InterviewDashboardSummaryRow | null {
  if (row == null) {
    return null;
  }
  return toDashboardSummary(row);
}
