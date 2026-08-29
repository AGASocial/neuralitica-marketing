import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import { PlaybookForm } from "@/components/playbook/PlaybookForm";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PlaybookFormatoForOperatorResult } from "@/lib/contracts/playbook";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { loadPlaybookFormatoForOperator } from "@/lib/playbook/load-playbook-formato-for-operator";

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
    createTitle: t.playbook.form.createTitle,
    editTitle: t.playbook.form.editTitle,
    subtitle: t.playbook.form.subtitle,
    save: t.playbook.form.save,
    create: t.playbook.form.create,
    cancel: t.playbook.form.cancel,
    saving: t.playbook.form.saving,
    archiving: t.playbook.form.archiving,
    archive: t.playbook.form.archive,
    backList: t.playbook.form.backList,
    toastCreateSuccess: t.playbook.form.toastCreateSuccess,
    toastSaveSuccess: t.playbook.form.toastSaveSuccess,
    toastArchiveSuccess: t.playbook.form.toastArchiveSuccess,
    versionLabel: t.playbook.form.versionLabel,
    archivedBanner: t.playbook.form.archivedBanner,
    versionConflict: t.playbook.form.versionConflict,
    reload: t.playbook.form.reload,
    fields: t.playbook.form.fields,
    hookTypes: t.playbook.enums.hookTypes,
    ctaTipos: t.playbook.enums.ctaTipos,
    rubros: t.playbook.enums.rubros,
    modalities: t.playbook.enums.modalities,
    list: t.playbook.form.list,
    confirmArchive: t.playbook.form.confirmArchive,
    errors: {
      ...t.playbook.errors,
      unauthenticated: t.auth.errors.unauthenticated,
      forbidden: t.auth.errors.forbidden,
    },
  };
}

type PlaybookEditPageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Edit Formato de Reel (US-16.1).
 */
export default async function PlaybookEditPage({ params }: PlaybookEditPageProps) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let result: PlaybookFormatoForOperatorResult;

  try {
    result = await loadPlaybookFormatoForOperator(slug);
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    result = {
      ok: false,
      error: {
        code: "NOT_FOUND",
        messageKey: "playbook.errors.notFound",
      },
    };
  }

  if (!result.ok) {
    return (
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 1rem", fontSize: "2rem" }}>
          {t.playbook.form.editTitle}
        </h1>
        <Message
          severity="error"
          text={t.playbook.errors.notFound}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
        <Link href="/operator/playbook" style={{ textDecoration: "none" }}>
          <Button type="button" label={t.playbook.form.backList} />
        </Link>
      </div>
    );
  }

  return (
    <PlaybookForm
      mode="edit"
      initial={result.formato}
      locale={locale}
      copy={buildFormCopy(t)}
    />
  );
}
