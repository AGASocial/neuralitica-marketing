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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background:
          "linear-gradient(160deg, #eef2ff 0%, var(--page-bg) 45%, #f8fafc 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: "1.35rem",
              color: "#312e81",
              marginBottom: "0.35rem",
            }}
          >
            {t.appName}
          </div>
          <Suspense fallback={null}>
            <AuthLocaleSwitcher locale={locale} labels={t.auth.localeSwitcher} />
          </Suspense>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 30px rgba(49, 46, 129, 0.08)",
            padding: "1.75rem",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
