import {
  INTERVIEW_STEP_ORDER,
  type InterviewAnswers,
  type InterviewStepKey,
} from "@/lib/contracts/interview";

export const MAX_LIST_ITEMS = 20;
export const MAX_ITEM_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 2000;

export { INTERVIEW_STEP_ORDER };

export function isTextStep(
  step: InterviewStepKey,
): step is "zone" | "tone" | "style" {
  return step === "zone" || step === "tone" || step === "style";
}

export function isRequiredListStep(
  step: InterviewStepKey,
): step is "services" | "offers" | "objections" {
  return step === "services" || step === "offers" || step === "objections";
}

export function stepIndex(step: InterviewStepKey): number {
  const index = INTERVIEW_STEP_ORDER.indexOf(step);
  return index >= 0 ? index : 0;
}

export function previousStep(step: InterviewStepKey): InterviewStepKey | null {
  const index = stepIndex(step);
  if (index <= 0) {
    return null;
  }
  return INTERVIEW_STEP_ORDER[index - 1] ?? null;
}

export function getListItems(
  answers: InterviewAnswers,
  step: InterviewStepKey,
): string[] {
  if (isTextStep(step)) {
    return [];
  }

  const value = answers[step];
  if (!value || !("items" in value) || !Array.isArray(value.items)) {
    return [];
  }

  return value.items;
}

export function getDescription(
  answers: InterviewAnswers,
  step: InterviewStepKey,
): string {
  if (!isTextStep(step)) {
    return "";
  }

  const value = answers[step];
  if (
    !value ||
    !("description" in value) ||
    typeof value.description !== "string"
  ) {
    return "";
  }

  return value.description;
}

export function stepFromFieldPath(
  path: string,
): InterviewStepKey | null {
  const prefix = path.split(".")[0];
  if (
    prefix &&
    (INTERVIEW_STEP_ORDER as readonly string[]).includes(prefix)
  ) {
    return prefix as InterviewStepKey;
  }
  return null;
}
