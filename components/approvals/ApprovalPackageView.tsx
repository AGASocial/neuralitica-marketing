"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
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
    case "RATE_LIMITED":
      return errors.rateLimited;
    case "INTERNAL_ERROR":
    default:
      return errors.internal;
  }
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
  const [feedback, setFeedback] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isPending = pkg.status === "pending_client";
  const gateBlocksApprove = pkg.gate?.ready === false;
  const feedbackTrimmed = feedback.trim();
  const feedbackTooLong = feedbackTrimmed.length > APPROVAL_FEEDBACK_MAX_LENGTH;

  function runDecide(decision: "approved" | "rejected") {
    if (pending || !isPending) {
      return;
    }
    if (decision === "rejected" && feedbackTooLong) {
      setBanner(copy.feedbackTooLong);
      return;
    }

    setBanner(null);
    startTransition(async () => {
      const result = await decideApproval({
        approvalId: pkg.approvalId,
        decision,
        ...(decision === "rejected" && feedbackTrimmed.length > 0
          ? { clientFeedback: feedbackTrimmed }
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
      }));
      setRejectMode(false);
      setFeedback("");
      toastRef.current?.show({
        severity: "success",
        summary:
          result.status === "approved" ? copy.toastApproved : copy.toastRejected,
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
          {!rejectMode ? (
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
                  setRejectMode(true);
                }}
              />
            </div>
          ) : (
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
          )}
        </section>
      ) : null}
    </div>
  );
}
