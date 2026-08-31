import { ReadyToPublishListView } from "@/components/ready-to-publish/ReadyToPublishListView";
import { listApprovedApprovals } from "@/lib/approvals/actions/list-approved-approvals";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ApprovedListItemDto } from "@/lib/contracts/approval";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

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

/**
 * Cliente approved Reels ready to publish (US-11.3).
 * Auth via `(app)` + ready-to-publish layout `requireActive("page")`.
 * Data: `listApprovedApprovals` Server Action (BE-owned).
 */
export default async function ReadyToPublishPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let items: ApprovedListItemDto[] = [];
  let loadFailed = false;

  try {
    const result = await listApprovedApprovals();
    if (result.ok) {
      items = result.items;
    } else {
      loadFailed = true;
    }
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    loadFailed = true;
  }

  return (
    <ReadyToPublishListView
      items={items}
      loadFailed={loadFailed}
      locale={locale}
      copy={{
        title: t.readyToPublish.list.title,
        subtitle: t.readyToPublish.list.subtitle,
        empty: t.readyToPublish.list.empty,
        loadError: t.readyToPublish.list.loadError,
        backDashboard: t.readyToPublish.list.backDashboard,
        viewCta: t.readyToPublish.list.viewCta,
        decidedAt: t.readyToPublish.list.decidedAt,
        disclosureChip: t.readyToPublish.list.disclosureChip,
        approvedStatus: t.readyToPublish.status.approved,
      }}
    />
  );
}
