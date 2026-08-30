import { LivingProfileView } from "@/components/profile/LivingProfileView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { InterviewStepKey } from "@/lib/contracts/interview";
import type { BusinessProfileForClientResult } from "@/lib/contracts/profile";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { getBusinessProfileForClient } from "@/lib/profile/get-business-profile-for-client";

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

type StepFieldCopy = {
  question: string;
  helper: string;
  placeholder: string;
};

/**
 * Living profile / Ficha viva — view + edit (US-2.1 / US-2.2).
 * Auth via `(app)` layout `requireActive("page")`. Cache: no-store in next.config.
 * Identity: getBusinessProfileForClient() arity 0 only — no client/profile id params.
 * Mutation: updateBusinessProfile(fields) Server Action (no tenant args).
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let result: BusinessProfileForClientResult = {
    exists: false,
    loadFailed: true,
  };

  try {
    result = await getBusinessProfileForClient();
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    result = { exists: false, loadFailed: true };
  }

  function stepCopy(key: InterviewStepKey): StepFieldCopy {
    const step = t.interview.steps[key];
    return {
      question: step.question,
      helper: step.helper,
      placeholder: step.placeholder,
    };
  }

  const steps: Record<InterviewStepKey, StepFieldCopy> = {
    services: stepCopy("services"),
    zone: stepCopy("zone"),
    tone: stepCopy("tone"),
    offers: stepCopy("offers"),
    objections: stepCopy("objections"),
    style: stepCopy("style"),
    restrictions: stepCopy("restrictions"),
  };

  return (
    <LivingProfileView
      result={result}
      locale={locale}
      brandingCopy={t.profile.branding}
      copy={{
        title: t.profile.title,
        updatedAt: t.profile.updatedAt,
        emptySection: t.profile.emptySection,
        sections: t.profile.sections,
        edit: t.profile.edit,
        save: t.profile.save,
        cancel: t.profile.cancel,
        saving: t.profile.saving,
        toastSuccess: t.profile.toastSuccess,
        addItem: t.profile.addItem,
        removeItem: t.profile.removeItem,
        itemPlaceholder: t.profile.itemPlaceholder,
        chipsHintRequired: t.profile.chipsHintRequired,
        chipsHintOptional: t.profile.chipsHintOptional,
        steps,
        errors: {
          ...t.profile.errors,
          unauthenticated: t.auth.errors.unauthenticated,
          forbidden: t.auth.errors.forbidden,
        },
        empty: t.profile.empty,
        error: t.profile.error,
      }}
    />
  );
}
