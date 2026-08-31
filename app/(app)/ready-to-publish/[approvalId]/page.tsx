import { notFound } from "next/navigation";

import { ApprovalsErrorState } from "@/components/approvals/ApprovalsLoading";
import { ReadyToPublishDetailView } from "@/components/ready-to-publish/ReadyToPublishDetailView";
import { getApprovalPackage } from "@/lib/approvals/actions/get-approval-package";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ApprovalErrorCode } from "@/lib/contracts/approval";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

type ReadyToPublishDetailPageProps = {
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
 * Cliente ready-to-publish package detail + backup downloads (US-11.3).
 * Guard: only `approved` packages; others → 404.
 */
export default async function ReadyToPublishDetailPage({
  params,
}: ReadyToPublishDetailPageProps) {
  const { approvalId } = await params;
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let loadErrorCode: ApprovalErrorCode | undefined;
  let loadFailed = false;

  try {
    const result = await getApprovalPackage({ approvalId });
    if (result.ok) {
      if (result.package.status !== "approved") {
        notFound();
      }

      return (
        <ReadyToPublishDetailView
          pkg={result.package}
          locale={locale}
          disclosureLine={t.legal.genericAvatarDisclosure}
          copy={{
            title: t.readyToPublish.detail.title,
            backList: t.readyToPublish.detail.backList,
            caption: t.readyToPublish.detail.caption,
            selectedCta: t.readyToPublish.detail.selectedCta,
            hashtags: t.readyToPublish.detail.hashtags,
            disclosureTitle: t.readyToPublish.detail.disclosureTitle,
            videoLabel: t.readyToPublish.detail.videoLabel,
            decidedAt: t.readyToPublish.detail.decidedAt,
            approvedStatus: t.readyToPublish.status.approved,
            downloads: {
              title: t.readyToPublish.detail.downloadsTitle,
              subtitle: t.readyToPublish.detail.downloadsSubtitle,
              downloadVideo: t.readyToPublish.detail.downloadVideo,
              downloadCaption: t.readyToPublish.detail.downloadCaption,
              viewDetail: t.readyToPublish.panel.viewDetail,
              downloadHint: t.readyToPublish.detail.downloadHint,
            },
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
        title={t.readyToPublish.detail.title}
        message={mapLoadError(loadErrorCode, {
          notFound: t.readyToPublish.errors.notFound,
          unauthenticated: t.readyToPublish.errors.unauthenticated,
          forbidden: t.readyToPublish.errors.forbidden,
          loadError: t.readyToPublish.detail.loadError,
        })}
        backHref="/ready-to-publish"
        backLabel={t.readyToPublish.detail.backList}
      />
    );
  }

  return null;
}
