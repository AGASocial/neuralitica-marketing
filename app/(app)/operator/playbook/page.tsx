import { PlaybookListView } from "@/components/playbook/PlaybookListView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { loadPlaybookListForOperator } from "@/lib/playbook/load-playbook-list-for-operator";

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
 * Operator Playbook de formatos list (US-16.1).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 */
export default async function PlaybookListPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let result = await loadPlaybookListForOperator().catch((error: unknown) => {
    if (isNextNavigationError(error)) {
      throw error;
    }
    return { ok: false as const, loadFailed: true as const };
  });

  return (
    <PlaybookListView
      result={result}
      locale={locale}
      copy={{
        title: t.playbook.list.title,
        subtitle: t.playbook.list.subtitle,
        create: t.playbook.list.create,
        empty: t.playbook.list.empty,
        loadError: t.playbook.list.loadError,
        backDashboard: t.playbook.list.backDashboard,
        columns: t.playbook.list.columns,
        status: t.playbook.list.status,
        edit: t.playbook.list.edit,
      }}
    />
  );
}
