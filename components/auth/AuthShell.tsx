import type { ReactNode } from "react";
import { Suspense } from "react";

import { AuthLocaleSwitcher } from "@/components/auth/AuthLocaleSwitcher";
import { getTranslations } from "@/lib/i18n/get-translations";
import type { Locale } from "@/lib/i18n/locales";

type AuthShellProps = {
  locale: Locale;
  children: ReactNode;
};

export function AuthShell({ locale, children }: AuthShellProps) {
  const t = getTranslations(locale);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-deep px-4 py-10 text-fog">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--panel)_70%,transparent),_transparent_55%)]"
      />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-5">
        <div className="text-center">
          <div className="font-display text-3xl text-fog">{t.appName}</div>
          <p className="mt-1 text-sm text-dim">{t.auth.shellTagline}</p>
          <div className="mt-3 flex justify-center">
            <Suspense fallback={null}>
              <AuthLocaleSwitcher locale={locale} labels={t.auth.localeSwitcher} />
            </Suspense>
          </div>
        </div>

        <div className="rounded-2xl border border-edge bg-panel/80 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] sm:p-7">
          {children}
        </div>
      </div>
    </div>
  );
}
