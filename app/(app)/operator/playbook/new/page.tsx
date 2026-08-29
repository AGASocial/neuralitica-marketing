import { PlaybookForm } from "@/components/playbook/PlaybookForm";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

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

/**
 * Create Formato de Reel (US-16.1).
 */
export default async function PlaybookCreatePage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <PlaybookForm mode="create" copy={buildFormCopy(t)} />;
}
