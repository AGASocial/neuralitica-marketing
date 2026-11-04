"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

import { InterviewStepFields } from "@/components/interview/InterviewStepFields";
import {
  INTERVIEW_STEP_ORDER,
  MAX_DESCRIPTION_LENGTH,
  MAX_ITEM_LENGTH,
  MAX_LIST_ITEMS,
  getDescription,
  getListItems,
  isRequiredListStep,
  isTextStep,
  stepFromFieldPath,
} from "@/components/interview/step-helpers";
import type { InterviewStepKey } from "@/lib/contracts/interview";
import type {
  BusinessProfileFields,
  BusinessProfileView,
  UpdateBusinessProfileErrorCode,
  UpdateBusinessProfileResult,
} from "@/lib/contracts/profile";
import { updateBusinessProfile } from "@/lib/profile/update-business-profile";

type StepFieldCopy = {
  question: string;
  helper: string;
  placeholder: string;
};

type LivingProfileEditorCopy = {
  updatedAt: string;
  emptySection: string;
  sections: Record<InterviewStepKey, string>;
  edit: string;
  save: string;
  cancel: string;
  saving: string;
  toastSuccess: string;
  addItem: string;
  removeItem: string;
  itemPlaceholder: string;
  chipsHintRequired: string;
  chipsHintOptional: string;
  steps: Record<InterviewStepKey, StepFieldCopy>;
  errors: {
    validation: string;
    forbiddenFields: string;
    payloadTooLarge: string;
    notFound: string;
    unauthenticated: string;
    forbidden: string;
    conflict: string;
    internal: string;
    required: string;
    tooSmallList: string;
    tooSmallText: string;
    tooBigItems: string;
    tooBigText: string;
    invalidType: string;
    unrecognizedKey: string;
  };
};

type LivingProfileEditorProps = {
  initial: BusinessProfileView;
  locale: string;
  copy: LivingProfileEditorCopy;
  title: string;
};

function cloneFields(fields: BusinessProfileFields): BusinessProfileFields {
  return structuredClone(fields);
}

function formatUpdatedAt(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function sectionSatisfied(
  fields: BusinessProfileFields,
  step: InterviewStepKey,
): boolean {
  if (isTextStep(step)) {
    const text = getDescription(fields, step).trim();
    return text.length >= 1 && text.length <= MAX_DESCRIPTION_LENGTH;
  }

  const items = getListItems(fields, step)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.some((item) => item.length > MAX_ITEM_LENGTH)) {
    return false;
  }
  if (items.length > MAX_LIST_ITEMS) {
    return false;
  }
  if (isRequiredListStep(step)) {
    return items.length >= 1;
  }
  return true;
}

function buildSnapshot(fields: BusinessProfileFields): BusinessProfileFields {
  const next = {} as BusinessProfileFields;
  for (const step of INTERVIEW_STEP_ORDER) {
    if (isTextStep(step)) {
      next[step] = { description: getDescription(fields, step).trim() };
    } else {
      next[step] = {
        items: getListItems(fields, step)
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }
  }
  return next;
}

/**
 * Editable Living profile / Ficha viva (US-2.2).
 * Controlled inputs + React text only — no dangerouslySetInnerHTML.
 * No consent / Preferencias editors.
 */
export function LivingProfileEditor({
  initial,
  locale,
  copy,
  title,
}: LivingProfileEditorProps) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverFields, setServerFields] = useState(() =>
    cloneFields(initial.fields),
  );
  const [draftFields, setDraftFields] = useState(() =>
    cloneFields(initial.fields),
  );
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt ?? null);
  const [banner, setBanner] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<InterviewStepKey, string>>
  >({});

  const displayFields = editing ? draftFields : serverFields;

  const updatedLabel =
    updatedAt != null
      ? copy.updatedAt.replace("{date}", formatUpdatedAt(updatedAt, locale))
      : null;

  function clearFeedback() {
    setBanner(null);
    setFieldErrors({});
  }

  function startEdit() {
    setDraftFields(cloneFields(serverFields));
    clearFeedback();
    setEditing(true);
  }

  function cancelEdit() {
    setDraftFields(cloneFields(serverFields));
    clearFeedback();
    setEditing(false);
  }

  function setStepItems(step: InterviewStepKey, items: string[]) {
    if (isTextStep(step)) {
      return;
    }
    clearFeedback();
    setDraftFields((prev) => ({
      ...prev,
      [step]: { items },
    }));
  }

  function setStepDescription(step: InterviewStepKey, description: string) {
    if (!isTextStep(step)) {
      return;
    }
    clearFeedback();
    setDraftFields((prev) => ({
      ...prev,
      [step]: { description },
    }));
  }

  function messageForFieldCode(fieldPath: string, code: string): string {
    if (code === "required" || code === "invalid_type") {
      return code === "required" ? copy.errors.required : copy.errors.invalidType;
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
    if (code.toLowerCase().includes("unrecognized")) {
      return copy.errors.unrecognizedKey;
    }
    return copy.errors.validation;
  }

  function messageForCode(
    code: UpdateBusinessProfileErrorCode,
    messageKey?: string,
  ): string {
    if (messageKey === "profile.errors.notFound") {
      return copy.errors.notFound;
    }
    switch (code) {
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "FORBIDDEN_FIELDS":
        return copy.errors.forbiddenFields;
      case "PAYLOAD_TOO_LARGE":
        return copy.errors.payloadTooLarge;
      case "PROFILE_NOT_FOUND":
        return copy.errors.notFound;
      case "UNAUTHENTICATED":
        return copy.errors.unauthenticated;
      case "FORBIDDEN":
        return copy.errors.forbidden;
      case "CONFLICT":
        return copy.errors.conflict;
      default:
        return copy.errors.internal;
    }
  }

  function applyValidationFields(
    fields: Record<string, string[]>,
  ): Partial<Record<InterviewStepKey, string>> {
    const next: Partial<Record<InterviewStepKey, string>> = {};
    let firstBanner: string | null = null;

    for (const [path, codes] of Object.entries(fields)) {
      const owner = stepFromFieldPath(path);
      const code = codes[0];
      if (!code) {
        continue;
      }
      const text = messageForFieldCode(path, code);
      if (!firstBanner) {
        firstBanner = text;
      }
      if (owner && !next[owner]) {
        next[owner] = text;
      }
    }

    setFieldErrors(next);
    setBanner(firstBanner ?? copy.errors.validation);
    return next;
  }

  function validateClientSnapshot(snapshot: BusinessProfileFields): string | null {
    for (const step of INTERVIEW_STEP_ORDER) {
      if (!sectionSatisfied(snapshot, step)) {
        if (isTextStep(step)) {
          const text = getDescription(snapshot, step).trim();
          if (text.length === 0) {
            return copy.errors.tooSmallText;
          }
          if (text.length > MAX_DESCRIPTION_LENGTH) {
            return copy.errors.tooBigText;
          }
        } else if (isRequiredListStep(step)) {
          const items = getListItems(snapshot, step);
          if (items.length === 0) {
            return copy.errors.tooSmallList;
          }
        }
        return copy.errors.validation;
      }
    }
    return null;
  }

  async function handleSave() {
    if (pending) {
      return;
    }

    const snapshot = buildSnapshot(draftFields);
    const clientError = validateClientSnapshot(snapshot);
    if (clientError) {
      setBanner(clientError);
      return;
    }

    setPending(true);
    clearFeedback();

    try {
      const result: UpdateBusinessProfileResult =
        await updateBusinessProfile(snapshot);

      if (result.ok) {
        setServerFields(cloneFields(result.fields));
        setDraftFields(cloneFields(result.fields));
        setUpdatedAt(result.updatedAt);
        setEditing(false);
        toast.success(copy.toastSuccess, { duration: 5000 });
        return;
      }

      if (result.error.code === "VALIDATION_ERROR" && result.error.fields) {
        applyValidationFields(result.error.fields);
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  return (
    <ProfileShell
      title={title}
      subtitle={updatedLabel}
      actions={
        editing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={pending}
            >
              {pending ? <Spinner className="size-4 text-current" /> : null}
              {pending ? copy.saving : copy.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={cancelEdit}
              disabled={pending}
            >
              {copy.cancel}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={startEdit}>
            {copy.edit}
          </Button>
        )
      }
    >
      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full" />
      ) : null}

      {INTERVIEW_STEP_ORDER.map((step) => (
        <section
          key={step}
          className="rounded-xl border border-edge bg-panel px-5 py-4"
        >
          {editing ? (
            <>
              <InterviewStepFields
                step={step}
                items={getListItems(draftFields, step)}
                description={getDescription(draftFields, step)}
                pending={pending}
                stepCopy={{
                  question: copy.sections[step],
                  helper: copy.steps[step].helper,
                  placeholder: copy.steps[step].placeholder,
                }}
                copy={{
                  addItem: copy.addItem,
                  removeItem: copy.removeItem,
                  itemPlaceholder: copy.itemPlaceholder,
                  chipsHintRequired: copy.chipsHintRequired,
                  chipsHintOptional: copy.chipsHintOptional,
                }}
                onItemsChange={(items) => setStepItems(step, items)}
                onDescriptionChange={(description) =>
                  setStepDescription(step, description)
                }
                onClearMessage={clearFeedback}
              />
              {fieldErrors[step] ? (
                <StatusAlert
                  severity="error"
                  text={fieldErrors[step]}
                  className="mt-3 w-full"
                />
              ) : null}
            </>
          ) : (
            <>
              <h2 className="mb-3 font-display text-xl text-fog">
                {copy.sections[step]}
              </h2>
              <SectionBody
                step={step}
                fields={displayFields}
                emptyLabel={copy.emptySection}
              />
            </>
          )}
        </section>
      ))}
    </ProfileShell>
  );
}

function ProfileShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-display text-4xl text-fog">{title}</h1>
          {subtitle ? <p className="text-sm text-dim">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function SectionBody({
  step,
  fields,
  emptyLabel,
}: {
  step: InterviewStepKey;
  fields: BusinessProfileFields;
  emptyLabel: string;
}) {
  if (isTextStep(step)) {
    const description = getDescription(fields, step);
    return (
      <p className="whitespace-pre-wrap text-fog">{description || emptyLabel}</p>
    );
  }

  const items = getListItems(fields, step);
  if (items.length === 0) {
    return <p className="text-fog">{emptyLabel}</p>;
  }

  return (
    <ul className="list-disc pl-5 text-fog">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}
