"use client";

import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Steps } from "primereact/steps";
import { useMemo, useState } from "react";

import { persistInterviewDraft } from "@/lib/interview/actions/persist-interview-draft";
import type {
  InterviewAnswers,
  InterviewDraftView,
  InterviewErrorCode,
  InterviewStepKey,
  PersistInterviewDraftInput,
  PersistInterviewDraftResult,
} from "@/lib/contracts/interview";
import type enMessages from "@/messages/en.json";

import { InterviewCompletedView } from "./InterviewCompletedView";
import { InterviewStepFields } from "./InterviewStepFields";
import {
  INTERVIEW_STEP_ORDER,
  MAX_DESCRIPTION_LENGTH,
  MAX_ITEM_LENGTH,
  MAX_LIST_ITEMS,
  getDescription,
  getListItems,
  isRequiredListStep,
  isTextStep,
  previousStep,
  stepFromFieldPath,
  stepIndex,
} from "./step-helpers";

type InterviewCopy = (typeof enMessages)["interview"];
type AuthErrorsCopy = Pick<
  (typeof enMessages)["auth"]["errors"],
  "unauthenticated" | "forbidden"
>;

type InterviewWizardProps = {
  draft: InterviewDraftView;
  copy: InterviewCopy;
  authErrors: AuthErrorsCopy;
};

type Banner = {
  severity: "error" | "success" | "info";
  text: string;
};

type PendingMode = "next" | "leave" | null;

export function InterviewWizard({ draft, copy, authErrors }: InterviewWizardProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<InterviewAnswers>(draft.answers);
  const [viewStep, setViewStep] = useState<InterviewStepKey>(draft.currentStep);
  const [status, setStatus] = useState(draft.status);
  const [pendingMode, setPendingMode] = useState<PendingMode>(null);
  const [banner, setBanner] = useState<Banner | null>(
    Object.keys(draft.answers).length === 0 && draft.status === "draft"
      ? { severity: "info", text: copy.emptyIntro }
      : null,
  );

  const pending = pendingMode !== null;
  const readOnly = status === "completed";
  const activeIndex = stepIndex(viewStep);
  const isLastStep = viewStep === "restrictions";
  const items = getListItems(answers, viewStep);
  const description = getDescription(answers, viewStep);

  const stepModel = useMemo(
    () =>
      INTERVIEW_STEP_ORDER.map((key) => ({
        label: copy.steps[key].label,
      })),
    [copy.steps],
  );

  const progressLabel = copy.progress
    .replace("{current}", String(activeIndex + 1))
    .replace("{total}", String(INTERVIEW_STEP_ORDER.length));

  function clearMessages() {
    setBanner(null);
  }

  function setListItems(nextItems: string[]) {
    setAnswers((current) => ({
      ...current,
      [viewStep]: { items: nextItems },
    }));
  }

  function setText(nextDescription: string) {
    setAnswers((current) => ({
      ...current,
      [viewStep]: { description: nextDescription },
    }));
  }

  function goBack() {
    const previous = previousStep(viewStep);
    if (!previous || pending) {
      return;
    }
    setViewStep(previous);
    setBanner(null);
  }

  function validateCurrentStep(): string | null {
    if (isTextStep(viewStep)) {
      const trimmed = description.trim();
      if (!trimmed) {
        return copy.errors.tooSmallText;
      }
      if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
        return copy.errors.tooBigText;
      }
      return null;
    }

    const trimmedItems = items.map((item) => item.trim()).filter(Boolean);
    if (trimmedItems.some((item) => item.length > MAX_ITEM_LENGTH)) {
      return copy.errors.tooBigText;
    }
    if (trimmedItems.length > MAX_LIST_ITEMS) {
      return copy.errors.tooBigItems;
    }
    if (isRequiredListStep(viewStep) && trimmedItems.length < 1) {
      return copy.errors.tooSmallList;
    }
    return null;
  }

  function buildPayload(): PersistInterviewDraftInput["answers"] {
    if (isTextStep(viewStep)) {
      return {
        [viewStep]: { description: description.trim() },
      };
    }

    return {
      [viewStep]: {
        items: items.map((item) => item.trim()).filter(Boolean),
      },
    };
  }

  function messageForCode(
    code: InterviewErrorCode | string,
    messageKey?: string,
  ): string {
    const byKey: Record<string, string> = {
      "interview.errors.validation": copy.errors.validation,
      "interview.errors.forbiddenFields": copy.errors.forbiddenFields,
      "interview.errors.payloadTooLarge": copy.errors.payloadTooLarge,
      "interview.errors.conflict": copy.errors.conflict,
      "interview.errors.internal": copy.errors.internal,
      "auth.errors.unauthenticated": authErrors.unauthenticated,
      "auth.errors.forbidden": authErrors.forbidden,
    };

    if (messageKey && byKey[messageKey]) {
      return byKey[messageKey];
    }

    const byCode: Record<string, string> = {
      VALIDATION_ERROR: copy.errors.validation,
      FORBIDDEN_FIELDS: copy.errors.forbiddenFields,
      PAYLOAD_TOO_LARGE: copy.errors.payloadTooLarge,
      CONFLICT: copy.errors.conflict,
      INTERNAL_ERROR: copy.errors.internal,
      UNAUTHENTICATED: authErrors.unauthenticated,
      FORBIDDEN: authErrors.forbidden,
    };

    return byCode[code] ?? copy.errors.internal;
  }

  function messageForFieldCode(fieldPath: string, code: string): string {
    if (code === "required") {
      return copy.errors.required;
    }
    if (code === "invalid_type") {
      return copy.errors.invalidType;
    }
    if (code === "unrecognized_key") {
      return copy.errors.unrecognizedKey;
    }
    if (code === "too_small") {
      return fieldPath.includes("description")
        ? copy.errors.tooSmallText
        : copy.errors.tooSmallList;
    }
    if (code === "too_big") {
      const itemIndexPath = /\.items\.\d+$/.test(fieldPath);
      return itemIndexPath || fieldPath.includes("description")
        ? copy.errors.tooBigText
        : copy.errors.tooBigItems;
    }
    return copy.errors.validation;
  }

  function applyValidationFields(
    fields: Record<string, string[]>,
  ): InterviewStepKey | null {
    let firstStep: InterviewStepKey | null = null;
    let firstMessage: string | null = null;

    for (const [path, codes] of Object.entries(fields)) {
      const owner = stepFromFieldPath(path);
      if (owner && !firstStep) {
        firstStep = owner;
      }
      const code = codes[0];
      if (code && !firstMessage) {
        firstMessage = messageForFieldCode(path, code);
      }
    }

    if (firstMessage) {
      setBanner({ severity: "error", text: firstMessage });
    } else {
      setBanner({ severity: "error", text: copy.errors.validation });
    }

    return firstStep;
  }

  function handlePersistFailure(result: Extract<PersistInterviewDraftResult, { ok: false }>) {
    const { error } = result;

    if (error.code === "CONFLICT") {
      setStatus("completed");
      setBanner({
        severity: "error",
        text: messageForCode(error.code, error.messageKey),
      });
      return;
    }

    if (error.code === "VALIDATION_ERROR" && error.fields) {
      const owner = applyValidationFields(error.fields);
      if (owner && owner !== viewStep) {
        setViewStep(owner);
      }
      return;
    }

    setBanner({
      severity: "error",
      text: messageForCode(error.code, error.messageKey),
    });
  }

  async function runPersist(mode: Exclude<PendingMode, null>): Promise<boolean> {
    if (pending || readOnly) {
      return false;
    }

    const clientError = validateCurrentStep();
    if (clientError) {
      setBanner({ severity: "error", text: clientError });
      return false;
    }

    setPendingMode(mode);
    setBanner(null);

    try {
      const result = await persistInterviewDraft({
        currentStep: viewStep,
        answers: buildPayload(),
      });

      if (result.ok) {
        setAnswers(result.draft.answers);
        setViewStep(result.draft.currentStep);
        setStatus(result.draft.status);
        return true;
      }

      handlePersistFailure(result);
      return false;
    } catch {
      setBanner({ severity: "error", text: copy.errors.internal });
      return false;
    } finally {
      setPendingMode(null);
    }
  }

  async function handleNext(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const stepBeforePersist = viewStep;
    const ok = await runPersist("next");
    if (ok && stepBeforePersist === "restrictions") {
      setBanner({ severity: "success", text: copy.progressSaved });
    }
  }

  async function handleSaveAndContinueLater() {
    const ok = await runPersist("leave");
    if (ok) {
      router.push("/dashboard");
    }
  }

  if (readOnly) {
    return (
      <InterviewCompletedView
        answers={answers}
        copy={{
          title: copy.title,
          completedTitle: copy.completedTitle,
          completedBody: copy.completedBody,
          none: copy.none,
          backToDashboard: copy.backToDashboard,
          steps: copy.steps,
        }}
        banner={banner?.severity === "error" ? banner.text : undefined}
      />
    );
  }

  return (
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <div>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
      </div>

      <p style={{ margin: 0, fontWeight: 600 }} aria-live="polite">
        {progressLabel}
      </p>

      <Steps model={stepModel} activeIndex={activeIndex} readOnly />

      {banner ? (
        <Message
          severity={banner.severity}
          text={banner.text}
          style={{ width: "100%" }}
        />
      ) : null}

      <form
        onSubmit={handleNext}
        noValidate
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <InterviewStepFields
          key={viewStep}
          step={viewStep}
          items={items}
          description={description}
          pending={pending}
          stepCopy={copy.steps[viewStep]}
          copy={{
            addItem: copy.addItem,
            removeItem: copy.removeItem,
            itemPlaceholder: copy.itemPlaceholder,
            chipsHintRequired: copy.chipsHintRequired,
            chipsHintOptional: copy.chipsHintOptional,
          }}
          onItemsChange={setListItems}
          onDescriptionChange={setText}
          onClearMessage={clearMessages}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <Button
            type="button"
            label={copy.back}
            severity="secondary"
            outlined
            onClick={goBack}
            disabled={pending || activeIndex === 0}
          />
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginLeft: "auto",
            }}
          >
            <Button
              type="button"
              label={
                pendingMode === "leave"
                  ? copy.saveAndContinueLaterPending
                  : copy.saveAndContinueLater
              }
              severity="secondary"
              outlined
              onClick={handleSaveAndContinueLater}
              loading={pendingMode === "leave"}
              disabled={pending}
            />
            <Button
              type="submit"
              label={
                pendingMode === "next"
                  ? copy.saving
                  : isLastStep
                    ? copy.save
                    : copy.next
              }
              loading={pendingMode === "next"}
              disabled={pending}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
