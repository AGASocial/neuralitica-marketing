import {
  LogoutButton,
  type LogoutButtonCopy,
} from "@/components/auth/LogoutButton";

type PendingActivationViewProps = {
  title: string;
  body: string;
  emailLabel: string;
  email?: string;
  displayName?: string;
  logoutHint: string;
  logoutCopy: LogoutButtonCopy;
};

export function PendingActivationView({
  title,
  body,
  emailLabel,
  email,
  displayName,
  logoutHint,
  logoutCopy,
}: PendingActivationViewProps) {
  const showIdentity = Boolean(email || displayName);
  const showDisplayName = Boolean(
    displayName && displayName !== email,
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mb-2 font-display text-3xl text-fog">{title}</h1>
        <p className="leading-relaxed text-dim">{body}</p>
      </div>

      {showIdentity ? (
        <div className="flex flex-col gap-1 rounded-lg border border-edge bg-deep/60 px-4 py-3 text-[0.95rem]">
          {showDisplayName ? (
            <strong className="text-fog">{displayName}</strong>
          ) : null}
          {email ? (
            <div>
              <span className="text-dim">{emailLabel}: </span>
              <strong className="text-fog">{email}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-dim">{logoutHint}</p>

      <LogoutButton appearance="pending" copy={logoutCopy} />
    </div>
  );
}
