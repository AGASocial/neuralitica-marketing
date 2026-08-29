import { InterviewErrorState } from "@/components/interview/InterviewLoading";
import { InterviewWizard } from "@/components/interview/InterviewWizard";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { getOrCreateInterviewDraft } from "@/lib/interview/get-or-create-interview-draft";

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

export default async function InterviewPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  try {
    const draft = await getOrCreateInterviewDraft();

    return (
      <InterviewWizard
        draft={{
          currentStep: draft.currentStep,
          answers: draft.answers,
          status: draft.status,
        }}
        copy={t.interview}
        authErrors={{
          unauthenticated: t.auth.errors.unauthenticated,
          forbidden: t.auth.errors.forbidden,
        }}
      />
    );
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }

    return (
      <InterviewErrorState
        title={t.interview.title}
        message={t.interview.errors.internal}
      />
    );
  }
}
