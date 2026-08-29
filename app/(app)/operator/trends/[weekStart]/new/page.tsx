import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import { TrendEntryForm } from "@/components/trend/TrendEntryForm";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { loadPlaybookListForOperator } from "@/lib/playbook/load-playbook-list-for-operator";
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

type TrendNewEntryPageProps = {
  params: Promise<{ weekStart: string }>;
};

/**
 * Add Táctica de tendencia to a published week (US-16.2).
 */
export default async function TrendNewEntryPage({ params }: TrendNewEntryPageProps) {
  const { weekStart } = await params;
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
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
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 1rem", fontSize: "2rem" }}>
          {t.trend.form.createTitle}
        </h1>
        <Message
          severity="error"
          text={t.trend.errors.weekNotFound}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
        <Link href="/operator/trends" style={{ textDecoration: "none" }}>
          <Button type="button" label={t.trend.week.backList} />
        </Link>
      </div>
    );
  }

  const playbookOptions = await loadActivePlaybookOptions();

  return (
    <TrendEntryForm
      mode="create"
      weekStart={weekStart}
      playbookOptions={playbookOptions}
      copy={buildFormCopy(t)}
    />
  );
}
