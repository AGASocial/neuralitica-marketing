import { MyVideosHubView } from "@/components/ready-to-publish/MyVideosHubView";
import { listMyVideosHubForClientUser } from "@/lib/approvals/list-my-videos-hub";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ApprovedListItemDto } from "@/lib/contracts/approval";
import type {
  MyVideosInProductionItem,
  MyVideosPendingItem,
} from "@/lib/approvals/list-my-videos-hub";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

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
 * Owner “Mis videos” hub: in production, waiting for OK, ready to publish.
 */
export default async function ReadyToPublishPage() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const hub = t.readyToPublish.hub;

  let inProduction: MyVideosInProductionItem[] = [];
  let pending: MyVideosPendingItem[] = [];
  let approved: ApprovedListItemDto[] = [];
  let loadFailed = false;

  try {
    if (!user) {
      loadFailed = true;
    } else {
      const result = await listMyVideosHubForClientUser({ user });
      if (result.ok) {
        inProduction = result.inProduction;
        pending = result.pending;
        approved = result.approved;
      } else {
        loadFailed = true;
      }
    }
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    loadFailed = true;
  }

  return (
    <MyVideosHubView
      inProduction={inProduction}
      pending={pending}
      approved={approved}
      loadFailed={loadFailed}
      locale={locale}
      copy={{
        title: hub.title,
        subtitle: hub.subtitle,
        empty: hub.empty,
        loadError: t.readyToPublish.list.loadError,
        backDashboard: t.readyToPublish.list.backDashboard,
        viewCta: t.readyToPublish.list.viewCta,
        decidedAt: t.readyToPublish.list.decidedAt,
        disclosureChip: t.readyToPublish.list.disclosureChip,
        approvedStatus: t.readyToPublish.status.approved,
        sectionInProduction: hub.sectionInProduction,
        sectionPending: hub.sectionPending,
        sectionReady: hub.sectionReady,
        emptyInProduction: hub.emptyInProduction,
        emptyPending: hub.emptyPending,
        emptyReady: hub.emptyReady,
        approveCta: hub.approveCta,
        changeCta: hub.changeCta,
        inProductionStatus: hub.inProductionStatus,
        pendingStatus: hub.pendingStatus,
        progressHint: hub.progressHint,
        untitled: hub.untitled,
        formatLabels: {
          own_avatar: t.preferences.modes.own_avatar.label,
          generic_avatar: t.preferences.modes.generic_avatar.label,
          faceless: t.preferences.modes.faceless.label,
        },
      }}
    />
  );
}
