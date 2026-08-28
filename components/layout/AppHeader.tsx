import { LogoutButton } from "@/components/auth/LogoutButton";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";

type AppHeaderProps = {
  locale: "en" | "es";
  user: CurrentUser;
};

export function AppHeader({ locale, user }: AppHeaderProps) {
  const t = getTranslations(locale);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "1rem 1.5rem",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "1.125rem" }}>{t.appName}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          fontSize: "0.95rem",
          color: "#4b5563",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        <span>
          {t.header.signedInAs}{" "}
          <strong style={{ color: "#111827" }}>
            {user.displayName} ({user.email})
          </strong>
        </span>
        <LogoutButton
          appearance="header"
          copy={{
            label: t.header.logout,
            pendingLabel: t.header.logoutPending,
            confirmHeader: t.header.confirmHeader,
            confirmMessage: t.header.confirmMessage,
            confirmAccept: t.header.confirmAccept,
            confirmReject: t.header.confirmReject,
            stayError: t.auth.errors.forbiddenFields,
          }}
        />
      </div>
    </header>
  );
}
