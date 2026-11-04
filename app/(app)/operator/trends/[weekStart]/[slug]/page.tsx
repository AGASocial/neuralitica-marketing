import Link from "next/link";

import { TrendEntryForm } from "@/components/trend/TrendEntryForm";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";
import { loadPlaybookListForOperator } from "@/lib/playbook/load-playbook-list-for-operator";
import type { TrendEntryCore } from "@/lib/contracts/trend";
import { loadTrendSnapshotForOperator } from "@/lib/trend/load-trend-snapshot-for-operator";

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

function buildFormCopy(t: ReturnType<typeof getTranslations>) {
  return {
    createTitle: t.trend.form.createTitle,
    editTitle: t.trend.form.editTitle,
    subtitle: t.trend.form.subtitle,
    save: t.trend.form.save,
    create: t.trend.form.create,
    cancel: t.trend.form.cancel,
    saving: t.trend.form.saving,
    deactivating: t.trend.form.deactivating,
    deactivate: t.trend.form.deactivate,
    backWeek: t.trend.form.backWeek,
    toastCreateSuccess: t.trend.form.toastCreateSuccess,
    toastSaveSuccess: t.trend.form.toastSaveSuccess,
    toastDeactivateSuccess: t.trend.form.toastDeactivateSuccess,
    inactiveBanner: t.trend.form.inactiveBanner,
    fields: t.trend.form.fields,
    hookTypes: t.playbook.enums.hookTypes,
    rubros: t.playbook.enums.rubros,
    modalities: t.playbook.enums.modalities,
    list: t.trend.form.list,
    confirmDeactivate: t.trend.form.confirmDeactivate,
    errors: {
      ...t.trend.errors,
      slugRequired: t.trend.form.errors.slugRequired,
      slugFormat: t.trend.form.errors.slugFormat,
      formatosRequired: t.trend.form.errors.formatosRequired,
      unauthenticated: t.auth.errors.unauthenticated,
      forbidden: t.auth.errors.forbidden,
    },
  };
}

async function loadActivePlaybookOptions() {
  try {
    const result = await loadPlaybookListForOperator();
    if (!result.ok) {
      return [];
    }
    return result.formatos
      .filter((formato) => formato.active)
      .map((formato) => ({ slug: formato.slug, titulo: formato.titulo }));
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    return [];
  }
}

type TrendEditEntryPageProps = {
  params: Promise<{ weekStart: string; slug: string }>;
};

/**
 * Edit Táctica de tendencia (US-16.2).
 */
export default async function TrendEditEntryPage({ params }: TrendEditEntryPageProps) {
  const { weekStart, slug } = await params;
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let snapshotResult;
  try {
    snapshotResult = await loadTrendSnapshotForOperator(weekStart);
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    snapshotResult = {
      ok: false as const,
      error: {
        code: "NOT_FOUND" as const,
        messageKey: "trend.errors.weekNotFound" as const,
      },
    };
  }

  if (!snapshotResult.ok) {
    return (
      <div className="mx-auto max-w-[820px]">
        <h1 className="mb-4 font-display text-4xl text-fog">
          {t.trend.form.editTitle}
        </h1>
        <StatusAlert
          severity="error"
          text={t.trend.errors.weekNotFound}
          className="mb-4 w-full"
        />
        <Button asChild>
          <Link href="/operator/trends">{t.trend.week.backList}</Link>
        </Button>
      </div>
    );
  }

  const entry = snapshotResult.snapshot.entries.find(
    (item: TrendEntryCore) => item.slug === slug,
  );

  if (!entry) {
    return (
      <div className="mx-auto max-w-[820px]">
        <h1 className="mb-4 font-display text-4xl text-fog">
          {t.trend.form.editTitle}
        </h1>
        <StatusAlert
          severity="error"
          text={t.trend.errors.notFound}
          className="mb-4 w-full"
        />
        <Button asChild>
          <Link href={`/operator/trends/${weekStart}`}>{t.trend.form.backWeek}</Link>
        </Button>
      </div>
    );
  }

  const playbookOptions = await loadActivePlaybookOptions();

  return (
    <TrendEntryForm
      mode="edit"
      weekStart={weekStart}
      initial={entry}
      playbookOptions={playbookOptions}
      copy={buildFormCopy(t)}
    />
  );
}
