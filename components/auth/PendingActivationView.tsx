type PendingActivationViewProps = {
  title: string;
  body: string;
  emailLabel: string;
  email?: string;
  displayName?: string;
  logoutLabel: string;
};

export function PendingActivationView({
  title,
  body,
  emailLabel,
  email,
  displayName,
  logoutLabel,
}: PendingActivationViewProps) {
  const showIdentity = Boolean(email || displayName);
  const showDisplayName = Boolean(
    displayName && displayName !== email,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>{title}</h1>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.5 }}>{body}</p>
      </div>

      {showIdentity ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            fontSize: "0.95rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          {showDisplayName ? (
            <strong style={{ color: "#111827" }}>{displayName}</strong>
          ) : null}
          {email ? (
            <div>
              <span style={{ color: "#6b7280" }}>{emailLabel}: </span>
              <strong style={{ color: "#111827" }}>{email}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
        {logoutLabel}
      </p>
    </div>
  );
}
