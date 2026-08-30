import { ApprovalsListView } from "@/components/approvals/ApprovalsListView";
import { listPendingApprovals } from "@/lib/approvals/actions/list-pending-approvals";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ApprovalListItemDto } from "@/lib/contracts/approval";
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
 * Cliente pending approvals list (US-11.1 Phase A).
 * Auth via `(app)` + approvals layout `requireActive("page")`.
 * Data: `listPendingApprovals` Server Action (batch-ensure owned by BE).
 */
export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let items: ApprovalListItemDto[] = [];
  let loadFailed = false;

  try {
    const result = await listPendingApprovals();
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
    <ApprovalsListView
      items={items}
      loadFailed={loadFailed}
      locale={locale}
      copy={{
        title: t.approvals.list.title,
        subtitle: t.approvals.list.subtitle,
        empty: t.approvals.list.empty,
        loadError: t.approvals.list.loadError,
        backDashboard: t.approvals.list.backDashboard,
        reviewCta: t.approvals.list.reviewCta,
        createdAt: t.approvals.list.createdAt,
        disclosureChip: t.approvals.list.disclosureChip,
        overridesChip: t.approvals.list.overridesChip,
        pendingStatus: t.approvals.detail.status.pending_client,
      }}
    />
  );
}
