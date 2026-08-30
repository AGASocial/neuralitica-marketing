import { ApprovalPackageView } from "@/components/approvals/ApprovalPackageView";
import { ApprovalsErrorState } from "@/components/approvals/ApprovalsLoading";
import { getApprovalPackage } from "@/lib/approvals/actions/get-approval-package";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ApprovalErrorCode } from "@/lib/contracts/approval";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

type ApprovalDetailPageProps = {
  params: Promise<{ approvalId: string }>;
};

function isNextNavigationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_HTTP_ERROR"))
  );
}

function mapLoadError(
  code: ApprovalErrorCode | undefined,
  errors: {
    notFound: string;
    unauthenticated: string;
    forbidden: string;
    loadError: string;
  },
): string {
  switch (code) {
    case "NOT_FOUND":
      return errors.notFound;
    case "UNAUTHENTICATED":
      return errors.unauthenticated;
    case "FORBIDDEN":
      return errors.forbidden;
    default:
      return errors.loadError;
  }
}

/**
 * Cliente approval package preview + decide (US-11.1 Phase A).
 * Approve / Reject only — no request-changes (US-11.2).
 * Data: `getApprovalPackage` · mutation: `decideApproval` (client island).
 */
export default async function ApprovalDetailPage({
  params,
}: ApprovalDetailPageProps) {
  const { approvalId } = await params;
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let loadErrorCode: ApprovalErrorCode | undefined;
  let loadFailed = false;

  try {
    const result = await getApprovalPackage({ approvalId });
    if (result.ok) {
      return (
        <ApprovalPackageView
          initialPackage={result.package}
          locale={locale}
          disclosureLine={t.legal.genericAvatarDisclosure}
          checkLabels={t.scripts.qa.checks}
          copy={{
            title: t.approvals.detail.title,
            backList: t.approvals.detail.backList,
            caption: t.approvals.detail.caption,
            selectedCta: t.approvals.detail.selectedCta,
            hashtags: t.approvals.detail.hashtags,
            disclosureTitle: t.approvals.detail.disclosureTitle,
            overridesTitle: t.approvals.detail.overridesTitle,
            overridesEmpty: t.approvals.detail.overridesEmpty,
            overrideReason: t.approvals.detail.overrideReason,
            videoLabel: t.approvals.detail.videoLabel,
            approve: t.approvals.detail.approve,
            reject: t.approvals.detail.reject,
            confirmReject: t.approvals.detail.confirmReject,
            cancelReject: t.approvals.detail.cancelReject,
            approving: t.approvals.detail.approving,
            rejecting: t.approvals.detail.rejecting,
            feedbackLabel: t.approvals.detail.feedbackLabel,
            feedbackHint: t.approvals.detail.feedbackHint,
            feedbackTooLong: t.approvals.detail.feedbackTooLong,
            decidedAt: t.approvals.detail.decidedAt,
            gateNotReadyHint: t.approvals.detail.gateNotReadyHint,
            toastApproved: t.approvals.detail.toastApproved,
            toastRejected: t.approvals.detail.toastRejected,
            status: t.approvals.detail.status,
            errors: t.approvals.errors,
          }}
        />
      );
    }
    loadErrorCode = result.error.code;
    loadFailed = true;
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <ApprovalsErrorState
        title={t.approvals.detail.title}
        message={mapLoadError(loadErrorCode, {
          notFound: t.approvals.errors.notFound,
          unauthenticated: t.approvals.errors.unauthenticated,
          forbidden: t.approvals.errors.forbidden,
          loadError: t.approvals.detail.loadError,
        })}
        backHref="/approvals"
        backLabel={t.approvals.detail.backList}
      />
    );
  }

  return null;
}
