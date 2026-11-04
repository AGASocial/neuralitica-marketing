"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheckIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";

import { GenericAvatarDisclosurePreview } from "@/components/preferences/GenericAvatarDisclosurePreview";
import { ReadyToPublishDownloadPanel } from "@/components/ready-to-publish/ReadyToPublishDownloadPanel";
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
  confirmApproveHeader: string;
  confirmApproveMessage: string;
  confirmApprove: string;
  cancelApprove: string;
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
  readyToPublish: {
    title: string;
    subtitle: string;
    downloadVideo: string;
    downloadCaption: string;
    viewDetail: string;
    downloadHint: string;
  };
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
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
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
        toast.error(message, { duration: 5000 });
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

      toast.success(toastSummary, { duration: 4000 });
    });
  }

  function askToApprove() {
    if (pending || !isPending || gateBlocksApprove) {
      return;
    }

    setConfirmApproveOpen(true);
  }

  return (
    <div className="max-w-[640px] my-0 mx-auto">
      <AlertDialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <AlertDialogContent className="border-edge bg-panel text-fog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-2xl">
              <CircleCheckIcon className="size-5 text-success" aria-hidden />
              {copy.confirmApproveHeader}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              {copy.confirmApproveMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.cancelApprove}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                runDecide("approved");
              }}
            >
              {copy.confirmApprove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-5">
        <Link
          href="/approvals"
          className="text-dim no-underline text-[0.9rem]"
        >
          ← {copy.backList}
        </Link>
        <div
          className="flex flex-wrap items-center gap-[0.6rem] mt-3"
        >
          <h1 className="font-display text-fog m-0 text-[1.75rem]">{copy.title}</h1>
          <StatusBadge
            value={copy.status[pkg.status]}
            severity={statusSeverity(pkg.status)}
          />
        </div>
        {pkg.decidedAt ? (
          <p className="mt-2 mx-0 mb-0 text-dim text-sm">
            {copy.decidedAt.replace(
              "{date}",
              formatDateTime(pkg.decidedAt, locale),
            )}
          </p>
        ) : null}
      </div>

      {banner ? (
        <StatusAlert
          severity="error"
          text={banner}
          className="w-full mb-4"
        />
      ) : null}

      {isWaiting ? (
        <StatusAlert
          severity="info"
          text={copy.revision.waiting}
          className="w-full mb-4"
        />
      ) : null}

      {isPending && gateBlocksApprove ? (
        <StatusAlert
          severity="warn"
          text={copy.gateNotReadyHint}
          className="w-full mb-4"
        />
      ) : null}

      <section
        aria-label={copy.videoLabel}
        className="mb-5"
      >
        <video
          key={pkg.video.previewUrl}
          controls
          playsInline
          preload="metadata"
          poster={pkg.cover?.previewUrl}
          src={pkg.video.previewUrl}
          className="w-full max-h-[70vh] bg-deep rounded-lg block"
        />
      </section>

      <section className="mb-5">
        <h2
          className="font-display mt-0 mx-0 mb-2 text-base text-fog"
        >
          {copy.caption}
        </h2>
        <p
          className="m-0 whitespace-pre-wrap leading-[1.5] text-fog"
        >
          {pkg.caption.body}
        </p>
      </section>

      <section className="mb-5">
        <h2
          className="font-display mt-0 mx-0 mb-2 text-base text-fog"
        >
          {copy.selectedCta}
        </h2>
        <p className="m-0 text-fog leading-[1.45]">
          {pkg.caption.selectedCtaText}
        </p>
      </section>

      {pkg.hashtags.length > 0 ? (
        <section className="mb-5">
          <h2
            className="font-display mt-0 mx-0 mb-2 text-base text-fog"
          >
            {copy.hashtags}
          </h2>
          <p
            className="m-0 text-dim leading-[1.45] break-words"
          >
            {pkg.hashtags.join(" ")}
          </p>
        </section>
      ) : null}

      {pkg.disclosure.required ? (
        <div className="mb-5">
          <h2
            className="font-display mt-0 mx-0 mb-2 text-base text-fog"
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

      <section className="mb-6">
        <h2
          className="font-display mt-0 mx-0 mb-2 text-base text-fog"
        >
          {copy.overridesTitle}
        </h2>
        {pkg.qaOverrides.length === 0 ? (
          <p className="m-0 text-dim text-[0.9rem]">
            {copy.overridesEmpty}
          </p>
        ) : (
          <ul
            className="list-none m-0 p-0 flex flex-col gap-[0.65rem]"
          >
            {pkg.qaOverrides.map((override) => (
              <li
                key={override.overrideId}
                className="border border-edge rounded-lg py-3 px-[0.9rem] bg-panel"
              >
                <p
                  className="mt-0 mx-0 mb-[0.35rem] font-semibold text-fog"
                >
                  {checkLabels[override.checkKey] ?? override.checkKey}
                </p>
                <p className="m-0 text-dim leading-[1.45]">
                  {copy.overrideReason.replace("{reason}", override.reason)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pkg.status === "approved" ? (
        <ReadyToPublishDownloadPanel
          approvalId={pkg.approvalId}
          videoAssetId={pkg.video.assetId}
          copy={copy.readyToPublish}
        />
      ) : null}

      {isPending ? (
        <section
          className="flex flex-col gap-3 pt-1 border-t border-edge"
        >
          {typeof revisionsRemaining === "number" &&
          typeof maxRevisionRounds === "number" ? (
            <p className="m-0 text-dim text-[0.9rem]">
              {copy.revision.remaining
                .replace("{remaining}", String(revisionsRemaining))
                .replace("{max}", String(maxRevisionRounds))}
            </p>
          ) : null}

          {pkg.extraRevisionGranted ? (
            <StatusAlert
              severity="info"
              text={copy.revision.grantHint}
              className="w-full"
            />
          ) : null}

          {limitExceeded ? (
            <StatusAlert
              severity="warn"
              text={copy.revision.limitExceeded}
              className="w-full"
            />
          ) : null}

          {requestChangesMode ? (
            <>
              <h2
                className="font-display m-0 text-base text-fog"
              >
                {copy.revision.tagsTitle}
              </h2>
              <div
                className="flex flex-col gap-[0.85rem]"
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
                      className={cn(
                        "rounded-lg border border-edge px-[0.9rem] py-3",
                        checked ? "bg-panel" : "bg-deep",
                      )}
                    >
                      <div
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          id={`revision-tag-${tag}`}
                          checked={checked}
                          disabled={pending}
                          onCheckedChange={(value) =>
                            toggleTag(tag, value === true)
                          }
                        />
                        <Label
                          htmlFor={`revision-tag-${tag}`}
                          className="font-semibold text-fog"
                        >
                          {copy.revision.tags[tag]}
                        </Label>
                      </div>
                      {checked ? (
                        <div className="mt-[0.65rem]">
                          <Label
                            htmlFor={`revision-notes-${tag}`}
                            className="mb-[0.35rem] block text-sm text-fog"
                          >
                            {copy.revision.tagNotesLabel.replace(
                              "{tag}",
                              copy.revision.tags[tag],
                            )}
                          </Label>
                          <Textarea
                            id={`revision-notes-${tag}`}
                            value={noteValue}
                            onChange={(event) =>
                              setNotesByTag((prev) => ({
                                ...prev,
                                [tag]: event.target.value,
                              }))
                            }
                            rows={3}
                            disabled={pending}
                            maxLength={APPROVAL_FEEDBACK_MAX_LENGTH + 50}
                            placeholder={copy.revision.tagNotesHint}
                            className="w-full"
                          />
                          <p
                            className="mt-1 mx-0 mb-0 text-dim text-[0.8rem]"
                          >
                            {noteTrimmed.length}/{APPROVAL_FEEDBACK_MAX_LENGTH}
                          </p>
                          {noteTooLong ? (
                            <StatusAlert
                              severity="error"
                              text={copy.revision.noteTooLong}
                              className="w-full mt-[0.35rem]"
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <Label
                htmlFor="revision-summary"
                className="font-semibold text-fog"
              >
                {copy.revision.summaryLabel}
              </Label>
              <Textarea
                id="revision-summary"
                value={revisionSummary}
                onChange={(event) => setRevisionSummary(event.target.value)}
                rows={3}
                disabled={pending}
                maxLength={APPROVAL_FEEDBACK_MAX_LENGTH + 50}
                placeholder={copy.revision.summaryHint}
                className="w-full"
              />
              <p className="m-0 text-dim text-[0.8rem]">
                {summaryTrimmed.length}/{APPROVAL_FEEDBACK_MAX_LENGTH}
              </p>
              {summaryTooLong ? (
                <StatusAlert
                  severity="error"
                  text={copy.revision.noteTooLong}
                  className="w-full"
                />
              ) : null}

              <div
                className="flex flex-wrap gap-[0.65rem]"
              >
                <Button
                  type="button"
                  disabled={pending || revisionFormInvalid}
                  onClick={() => runDecide("request_changes")}
                  variant="secondary"
                >
                  {pending
                    ? copy.revision.requesting
                    : copy.revision.confirmRequestChanges}
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setRequestChangesMode(false);
                    resetRevisionForm();
                    setBanner(null);
                  }}
                  variant="ghost"
                >
                  {copy.revision.cancelRequestChanges}
                </Button>
              </div>
            </>
          ) : rejectMode ? (
            <>
              <Label
                htmlFor="approval-reject-feedback"
                className="font-semibold text-fog"
              >
                {copy.feedbackLabel}
              </Label>
              <Textarea
                id="approval-reject-feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={4}
                disabled={pending}
                maxLength={APPROVAL_FEEDBACK_MAX_LENGTH + 50}
                placeholder={copy.feedbackHint}
                className="w-full"
              />
              <p className="m-0 text-dim text-[0.8rem]">
                {feedbackTrimmed.length}/{APPROVAL_FEEDBACK_MAX_LENGTH}
              </p>
              {feedbackTooLong ? (
                <StatusAlert
                  severity="error"
                  text={copy.feedbackTooLong}
                  className="w-full"
                />
              ) : null}
              <div
                className="flex flex-wrap gap-[0.65rem]"
              >
                <Button
                  type="button"
                  disabled={pending || feedbackTooLong}
                  onClick={() => runDecide("rejected")}
                  variant="destructive"
                >
                  {pending ? copy.rejecting : copy.confirmReject}
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setRejectMode(false);
                    setFeedback("");
                    setBanner(null);
                  }}
                  variant="ghost"
                >
                  {copy.cancelReject}
                </Button>
              </div>
            </>
          ) : (
            <div
              className="flex flex-wrap gap-[0.65rem]"
            >
              <Button
                type="button"
                disabled={pending || gateBlocksApprove}
                onClick={askToApprove}
              >
                {pending ? copy.approving : copy.approve}
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setBanner(null);
                  setRequestChangesMode(false);
                  resetRevisionForm();
                  setRejectMode(true);
                }}
                variant="outline"
              >
                {copy.reject}
              </Button>
              {canRequestChanges ? (
                <Button
                  type="button"
                  disabled={pending || gateBlocksApprove}
                  onClick={() => {
                    setBanner(null);
                    setRejectMode(false);
                    setFeedback("");
                    setRequestChangesMode(true);
                  }}
                  variant="outline"
                >
                  {copy.revision.requestChanges}
                </Button>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
