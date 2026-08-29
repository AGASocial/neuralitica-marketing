import { ProfileStubView } from "@/components/profile/ProfileStubView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { getProfileStubSummary } from "@/lib/profile/get-profile-stub-summary";

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
 * Stub Living profile / Ficha viva (US-1.3). Full field grid is US-2.1 in place.
 * Auth via `(app)` layout `requireActive("page")`. Cache: no-store in next.config.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let profileReady = false;

  try {
    const summary = await getProfileStubSummary();
    profileReady = summary?.exists === true;
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    profileReady = false;
  }

  return (
    <ProfileStubView
      copy={{
        title: t.profile.stub.title,
        body: t.profile.stub.body,
        emptyBody: t.profile.stub.emptyBody,
        ctaInterview: t.profile.stub.ctaInterview,
        ctaDashboard: t.profile.stub.ctaDashboard,
      }}
      profileReady={profileReady}
    />
  );
}
