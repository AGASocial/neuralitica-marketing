"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";

import { GenericAvatarDisclosurePreview } from "@/components/preferences/GenericAvatarDisclosurePreview";
import { decideApproval } from "@/lib/approvals/actions/decide-approval";
import {
  APPROVAL_FEEDBACK_MAX_LENGTH,
  type ApprovalErrorCode,
  type ApprovalPackageDto,
  type ApprovalStatus,
} from "@/lib/contracts/approval";
import {
  APPROVAL_CHANGE_TAGS,
  type ApprovalChangeTag,
  type ChangeRequestInput,
} from "@/lib/contracts/approval-revision";

export type ApprovalPackageCopy = {
  title: string;
  backList: string;
  caption: string;
  selectedCta: string;
  hashtags: string;
  disclosureTitle: string;
  overridesTitle: string;
  overridesEmpty: string;
  overrideReason: string;
  videoLabel: string;
  approve: string;
  reject: string;
  confirmReject: string;
  cancelReject: string;
  approving: string;
  rejecting: string;
  feedbackLabel: string;
  feedbackHint: string;
  feedbackTooLong: string;
  decidedAt: string;
  gateNotReadyHint: string;
  toastApproved: string;
  toastRejected: string;
  status: Record<ApprovalStatus, string>;
  revision: {
    requestChanges: string;
    confirmRequestChanges: string;
    cancelRequestChanges: string;
    requesting: string;
    tagsTitle: string;
    tags: Record<ApprovalChangeTag, string>;
    tagNotesLabel: string;
    tagNotesHint: string;
    summaryLabel: string;
    summaryHint: string;
    noteTooLong: string;
    remaining: string;
    grantHint: string;
    limitExceeded: string;
    waiting: string;
    toastSubmitted: string;
  };
  errors: Record<
    | "unauthenticated"
    | "forbidden"
    | "validation"
    | "notFound"
    | "forbiddenFields"
    | "qaGateNotReady"
    | "assemblyNotReady"
    | "brandingRequired"
    | "captionRequired"
    | "captionCtaNotSelected"
    | "invalidTransition"
    | "revisionLimitExceeded"
    | "rateLimited"
    | "internal",
    string
  >;
};

type ApprovalPackageViewProps = {
  initialPackage: ApprovalPackageDto;
  locale: "en" | "es";
  disclosureLine: string;
  checkLabels: Record<string, string>;
  copy: ApprovalPackageCopy;
};

type DecideMode = "approved" | "rejected" | "request_changes";

function formatDateTime(iso: string, locale: "en" | "es"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusSeverity(
  status: ApprovalStatus,
): "success" | "info" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "pending_client":
      return "warning";
    case "changes_requested":
      return "info";
    default:
      return "secondary";
  }
}

function mapErrorMessage(
  code: ApprovalErrorCode,
  errors: ApprovalPackageCopy["errors"],
): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return errors.unauthenticated;
    case "FORBIDDEN":
      return errors.forbidden;
    case "VALIDATION_ERROR":
      return errors.validation;
    case "NOT_FOUND":
      return errors.notFound;
    case "FORBIDDEN_FIELDS":
      return errors.forbiddenFields;
    case "QA_GATE_NOT_READY":
      return errors.qaGateNotReady;
    case "ASSEMBLY_NOT_READY":
      return errors.assemblyNotReady;
    case "BRANDING_REQUIRED":
      return errors.brandingRequired;
    case "CAPTION_REQUIRED":
      return errors.captionRequired;
    case "CAPTION_CTA_NOT_SELECTED":
      return errors.captionCtaNotSelected;
    case "INVALID_TRANSITION":
      return errors.invalidTransition;
    case "REVISION_LIMIT_EXCEEDED":
      return errors.revisionLimitExceeded;
    case "RATE_LIMITED":
      return errors.rateLimited;
    case "INTERNAL_ERROR":
    case "REVISION_ROUTING_FAILED":
    default:
      return errors.internal;
  }
}

function trimNote(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildChangeRequest(
  selectedTags: ApprovalChangeTag[],
  notesByTag: Partial<Record<ApprovalChangeTag, string>>,
  summary: string,
): ChangeRequestInput {
  const notes: Partial<Record<ApprovalChangeTag, string>> = {};
  for (const tag of selectedTags) {
    const note = trimNote(notesByTag[tag] ?? "");
    if (note) {
      notes[tag] = note;
    }
  }

  const summaryNote = trimNote(summary);

  return {
    tags: selectedTags,
    ...(Object.keys(notes).length > 0 ? { notesByTag: notes } : {}),
    ...(summaryNote ? { summary: summaryNote } : {}),
  };
}

export function ApprovalPackageView({
  initialPackage,
  locale,
  disclosureLine,
  checkLabels,
  copy,
}: ApprovalPackageViewProps) {
  const toastRef = useRef<Toast>(null);
  const [pkg, setPkg] = useState(initialPackage);
  const [rejectMode, setRejectMode] = useState(false);
  const [requestChangesMode, setRequestChangesMode] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [selectedTags, setSelectedTags] = useState<ApprovalChangeTag[]>([]);
  const [notesByTag, setNotesByTag] = useState<
    Partial<Record<ApprovalChangeTag, string>>
  >({});
  const [revisionSummary, setRevisionSummary] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isPending = pkg.status === "pending_client";
  const isWaiting = pkg.status === "changes_requested";
  const gateBlocksApprove = pkg.gate?.ready === false;
  const feedbackTrimmed = feedback.trim();
  const feedbackTooLong = feedbackTrimmed.length > APPROVAL_FEEDBACK_MAX_LENGTH;
  const summaryTrimmed = revisionSummary.trim();
  const summaryTooLong = summaryTrimmed.length > APPROVAL_FEEDBACK_MAX_LENGTH;

  const revisionsRemaining = pkg.revisionsRemaining;
  const maxRevisionRounds = pkg.maxRevisionRounds;
  const canRequestChanges =
    isPending &&
    (pkg.extraRevisionGranted === true ||
      (typeof revisionsRemaining === "number" && revisionsRemaining > 0));
  const limitExceeded =
    isPending &&
    typeof revisionsRemaining === "number" &&
    revisionsRemaining === 0 &&
    !pkg.extraRevisionGranted;

  const tagNoteTooLong = selectedTags.some((tag) => {
    const note = (notesByTag[tag] ?? "").trim();
    return note.length > APPROVAL_FEEDBACK_MAX_LENGTH;
  });
  const revisionFormInvalid =
    selectedTags.length === 0 || tagNoteTooLong || summaryTooLong;

  function resetRevisionForm() {
    setSelectedTags([]);
    setNotesByTag({});
    setRevisionSummary("");
  }

  function toggleTag(tag: ApprovalChangeTag, checked: boolean) {
    setSelectedTags((prev) => {
      if (checked) {
        return prev.includes(tag) ? prev : [...prev, tag];
      }
      return prev.filter((value) => value !== tag);
    });
    if (!checked) {
      setNotesByTag((prev) => {
        const next = { ...prev };
        delete next[tag];
        return next;
      });
    }
  }

  function runDecide(decision: DecideMode) {
    if (pending || !isPending) {
      return;
    }

    if (decision === "rejected" && feedbackTooLong) {
      setBanner(copy.feedbackTooLong);
      return;
    }

    if (decision === "request_changes") {
      if (revisionFormInvalid) {
        if (tagNoteTooLong || summaryTooLong) {
          setBanner(copy.revision.noteTooLong);
        }
        return;
      }
    }

    setBanner(null);
    startTransition(async () => {
      const result = await decideApproval({
        approvalId: pkg.approvalId,
        decision,
        ...(decision === "rejected" && feedbackTrimmed.length > 0
          ? { clientFeedback: feedbackTrimmed }
          : {}),
        ...(decision === "request_changes"
          ? {
              changeRequest: buildChangeRequest(
                selectedTags,
                notesByTag,
                revisionSummary,
              ),
            }
          : {}),
      });

      if (!result.ok) {
        const message = mapErrorMessage(result.error.code, copy.errors);
        setBanner(message);
        toastRef.current?.show({
          severity: "error",
          summary: message,
          life: 5000,
        });
        return;
      }

      setPkg((prev) => ({
        ...prev,
        status: result.status,
        decidedAt: result.decidedAt,
        ...(typeof result.revisionCount === "number"
          ? { revisionCount: result.revisionCount }
          : {}),
        ...(typeof result.revisionsRemaining === "number"
          ? { revisionsRemaining: result.revisionsRemaining }
          : {}),
      }));
      setRejectMode(false);
      setRequestChangesMode(false);
      setFeedback("");
      resetRevisionForm();

      let toastSummary = copy.toastApproved;
      if (result.status === "rejected") {
        toastSummary = copy.toastRejected;
      } else if (result.status === "changes_requested") {
        toastSummary = copy.revision.toastSubmitted;
      }

      toastRef.current?.show({
        severity: "success",
        summary: toastSummary,
        life: 4000,
      });
    });
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      <Toast ref={toastRef} position="top-right" />

      <div style={{ marginBottom: "1.25rem" }}>
        <Link
          href="/approvals"
          style={{
            color: "#4b5563",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          ← {copy.backList}
        </Link>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.6rem",
            marginTop: "0.75rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.75rem" }}>{copy.title}</h1>
          <Tag
            value={copy.status[pkg.status]}
            severity={statusSeverity(pkg.status)}
          />
        </div>
        {pkg.decidedAt ? (
          <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            {copy.decidedAt.replace(
              "{date}",
              formatDateTime(pkg.decidedAt, locale),
            )}
          </p>
        ) : null}
      </div>

      {banner ? (
        <Message
          severity="error"
          text={banner}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {isWaiting ? (
        <Message
          severity="info"
          text={copy.revision.waiting}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {isPending && gateBlocksApprove ? (
        <Message
          severity="warn"
          text={copy.gateNotReadyHint}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      <section
        aria-label={copy.videoLabel}
        style={{ marginBottom: "1.25rem" }}
      >
        <video
          key={pkg.video.previewUrl}
          controls
          playsInline
          preload="metadata"
          poster={pkg.cover?.previewUrl}
          src={pkg.video.previewUrl}
          style={{
            width: "100%",
            maxHeight: "70vh",
            background: "#111827",
            borderRadius: "8px",
            display: "block",
          }}
        />
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1rem",
            color: "#374151",
          }}
        >
          {copy.caption}
        </h2>
        <p
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            color: "#111827",
          }}
        >
          {pkg.caption.body}
        </p>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1rem",
            color: "#374151",
          }}
        >
          {copy.selectedCta}
        </h2>
        <p style={{ margin: 0, color: "#111827", lineHeight: 1.45 }}>
          {pkg.caption.selectedCtaText}
        </p>
      </section>

      {pkg.hashtags.length > 0 ? (
        <section style={{ marginBottom: "1.25rem" }}>
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1rem",
              color: "#374151",
            }}
          >
            {copy.hashtags}
          </h2>
          <p
            style={{
              margin: 0,
              color: "#4b5563",
              lineHeight: 1.45,
              wordBreak: "break-word",
            }}
          >
            {pkg.hashtags.join(" ")}
          </p>
        </section>
      ) : null}

      {pkg.disclosure.required ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <h2
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1rem",
              color: "#374151",
            }}
          >
            {copy.disclosureTitle}
          </h2>
          <GenericAvatarDisclosurePreview
            visible
            variant="approval"
            line={pkg.disclosure.text?.trim() || disclosureLine}
          />
        </div>
      ) : null}

      <section style={{ marginBottom: "1.5rem" }}>
        <h2
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1rem",
            color: "#374151",
          }}
        >
          {copy.overridesTitle}
        </h2>
        {pkg.qaOverrides.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>
            {copy.overridesEmpty}
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
            }}
          >
            {pkg.qaOverrides.map((override) => (
              <li
                key={override.overrideId}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "0.75rem 0.9rem",
                  background: "#f9fafb",
                }}
              >
                <p
                  style={{
                    margin: "0 0 0.35rem",
                    fontWeight: 600,
                    color: "#111827",
                  }}
                >
                  {checkLabels[override.checkKey] ?? override.checkKey}
                </p>
                <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.45 }}>
                  {copy.overrideReason.replace("{reason}", override.reason)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isPending ? (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            paddingTop: "0.25rem",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          {typeof revisionsRemaining === "number" &&
          typeof maxRevisionRounds === "number" ? (
            <p style={{ margin: 0, color: "#4b5563", fontSize: "0.9rem" }}>
              {copy.revision.remaining
                .replace("{remaining}", String(revisionsRemaining))
                .replace("{max}", String(maxRevisionRounds))}
            </p>
          ) : null}

          {pkg.extraRevisionGranted ? (
            <Message
              severity="info"
              text={copy.revision.grantHint}
              style={{ width: "100%" }}
            />
          ) : null}

          {limitExceeded ? (
            <Message
              severity="warn"
              text={copy.revision.limitExceeded}
              style={{ width: "100%" }}
            />
          ) : null}

          {requestChangesMode ? (
            <>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  color: "#374151",
                }}
              >
                {copy.revision.tagsTitle}
              </h2>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                {APPROVAL_CHANGE_TAGS.map((tag) => {
                  const checked = selectedTags.includes(tag);
                  const noteValue = notesByTag[tag] ?? "";
                  const noteTrimmed = noteValue.trim();
                  const noteTooLong =
                    noteTrimmed.length > APPROVAL_FEEDBACK_MAX_LENGTH;

                  return (
                    <div
                      key={tag}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "0.75rem 0.9rem",
                        background: checked ? "#f9fafb" : "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <Checkbox
                          inputId={`revision-tag-${tag}`}
                          checked={checked}
                          disabled={pending}
                          onChange={(event) =>
                            toggleTag(tag, event.checked === true)
                          }
                        />
                        <label
                          htmlFor={`revision-tag-${tag}`}
                          style={{ fontWeight: 600, color: "#111827" }}
                        >
                          {copy.revision.tags[tag]}
                        </label>
                      </div>
                      {checked ? (
                        <div style={{ marginTop: "0.65rem" }}>
                          <label
                            htmlFor={`revision-notes-${tag}`}
                            style={{
                              display: "block",
                              marginBottom: "0.35rem",
                              fontSize: "0.875rem",
                              color: "#374151",
                            }}
                          >
                            {copy.revision.tagNotesLabel.replace(
                              "{tag}",
                              copy.revision.tags[tag],
                            )}
                          </label>
                          <InputTextarea
                            id={`revision-notes-${tag}`}
                            value={noteValue}
                            onChange={(event) =>
                              setNotesByTag((prev) => ({
                                ...prev,
                                [tag]: event.target.value,
                              }))
                            }
                            rows={3}
                            autoResize
                            disabled={pending}
                            maxLength={APPROVAL_FEEDBACK_MAX_LENGTH + 50}
                            placeholder={copy.revision.tagNotesHint}
                            style={{ width: "100%" }}
                          />
                          <p
                            style={{
                              margin: "0.25rem 0 0",
                              color: "#6b7280",
                              fontSize: "0.8rem",
                            }}
                          >
                            {noteTrimmed.length}/{APPROVAL_FEEDBACK_MAX_LENGTH}
                          </p>
                          {noteTooLong ? (
                            <Message
                              severity="error"
                              text={copy.revision.noteTooLong}
                              style={{ width: "100%", marginTop: "0.35rem" }}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <label
                htmlFor="revision-summary"
                style={{ fontWeight: 600, color: "#374151" }}
              >
                {copy.revision.summaryLabel}
              </label>
              <InputTextarea
                id="revision-summary"
                value={revisionSummary}
                onChange={(event) => setRevisionSummary(event.target.value)}
                rows={3}
                autoResize
                disabled={pending}
                maxLength={APPROVAL_FEEDBACK_MAX_LENGTH + 50}
                placeholder={copy.revision.summaryHint}
                style={{ width: "100%" }}
              />
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8rem" }}>
                {summaryTrimmed.length}/{APPROVAL_FEEDBACK_MAX_LENGTH}
              </p>
              {summaryTooLong ? (
                <Message
                  severity="error"
                  text={copy.revision.noteTooLong}
                  style={{ width: "100%" }}
                />
              ) : null}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.65rem",
                }}
              >
                <Button
                  type="button"
                  label={
                    pending
                      ? copy.revision.requesting
                      : copy.revision.confirmRequestChanges
                  }
                  severity="secondary"
                  disabled={pending || revisionFormInvalid}
                  onClick={() => runDecide("request_changes")}
                />
                <Button
                  type="button"
                  label={copy.revision.cancelRequestChanges}
                  text
                  disabled={pending}
                  onClick={() => {
                    setRequestChangesMode(false);
                    resetRevisionForm();
                    setBanner(null);
                  }}
                />
              </div>
            </>
          ) : rejectMode ? (
            <>
              <label
                htmlFor="approval-reject-feedback"
                style={{ fontWeight: 600, color: "#374151" }}
              >
                {copy.feedbackLabel}
              </label>
              <InputTextarea
                id="approval-reject-feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={4}
                autoResize
                disabled={pending}
                maxLength={APPROVAL_FEEDBACK_MAX_LENGTH + 50}
                placeholder={copy.feedbackHint}
                style={{ width: "100%" }}
              />
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8rem" }}>
                {feedbackTrimmed.length}/{APPROVAL_FEEDBACK_MAX_LENGTH}
              </p>
              {feedbackTooLong ? (
                <Message
                  severity="error"
                  text={copy.feedbackTooLong}
                  style={{ width: "100%" }}
                />
              ) : null}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.65rem",
                }}
              >
                <Button
                  type="button"
                  label={pending ? copy.rejecting : copy.confirmReject}
                  severity="danger"
                  disabled={pending || feedbackTooLong}
                  onClick={() => runDecide("rejected")}
                />
                <Button
                  type="button"
                  label={copy.cancelReject}
                  text
                  disabled={pending}
                  onClick={() => {
                    setRejectMode(false);
                    setFeedback("");
                    setBanner(null);
                  }}
                />
              </div>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.65rem",
              }}
            >
              <Button
                type="button"
                label={pending ? copy.approving : copy.approve}
                disabled={pending || gateBlocksApprove}
                onClick={() => runDecide("approved")}
              />
              <Button
                type="button"
                label={copy.reject}
                severity="secondary"
                outlined
                disabled={pending}
                onClick={() => {
                  setBanner(null);
                  setRequestChangesMode(false);
                  resetRevisionForm();
                  setRejectMode(true);
                }}
              />
              {canRequestChanges ? (
                <Button
                  type="button"
                  label={copy.revision.requestChanges}
                  severity="secondary"
                  outlined
                  disabled={pending || gateBlocksApprove}
                  onClick={() => {
                    setBanner(null);
                    setRejectMode(false);
                    setFeedback("");
                    setRequestChangesMode(true);
                  }}
                />
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
