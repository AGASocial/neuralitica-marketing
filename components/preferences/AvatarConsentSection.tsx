"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Message } from "primereact/message";
import { Toast } from "primereact/toast";

import type {
  AvatarConsentForClientResult,
  GrantAvatarConsentErrorCode,
  RevokeAvatarConsentErrorCode,
} from "@/lib/contracts/avatar-consent";
import { grantAvatarConsent } from "@/lib/visual-preferences/grant-avatar-consent";
import { revokeAvatarConsent } from "@/lib/visual-preferences/revoke-avatar-consent";

export type AvatarConsentCopy = {
  title: string;
  disclosureV1: string[];
  affirmationLabel: string;
  grant: string;
  revoke: string;
  granting: string;
  revoking: string;
  consentedAt: string;
  versionLabel: string;
  staleAllowlistWarning: string;
  confirmRevoke: {
    header: string;
    message: string;
    accept: string;
    reject: string;
  };
  toastGrantSuccess: string;
  toastRevokeSuccess: string;
  toastAlreadyActive: string;
  inactiveReason: {
    none: string;
    revoked: string;
    version_mismatch: string;
    load_failed: string;
  };
  errors: {
    validation: string;
    forbiddenFields: string;
    versionMismatch: string;
    affirmationRequired: string;
    alreadyActive: string;
    notActive: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

type AvatarConsentSectionProps = {
  consent: AvatarConsentForClientResult;
  locale: string;
  copy: AvatarConsentCopy;
  allowlistHasOwnAvatar: boolean;
  preferencesPending?: boolean;
};

function formatTimestamp(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function grantMessageForCode(
  code: GrantAvatarConsentErrorCode,
  messageKey: string | undefined,
  copy: AvatarConsentCopy,
): string {
  if (
    code === "CONSENT_VERSION_MISMATCH" ||
    messageKey === "preferences.consent.errors.versionMismatch"
  ) {
    return copy.errors.versionMismatch;
  }
  if (code === "AFFIRMATION_REQUIRED") {
    return copy.errors.affirmationRequired;
  }
  if (code === "ALREADY_ACTIVE") {
    return copy.errors.alreadyActive;
  }
  switch (code) {
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

function revokeMessageForCode(
  code: RevokeAvatarConsentErrorCode,
  messageKey: string | undefined,
  copy: AvatarConsentCopy,
): string {
  if (
    code === "NOT_ACTIVE" ||
    messageKey === "preferences.consent.errors.notActive"
  ) {
    return copy.errors.notActive;
  }
  switch (code) {
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

/**
 * Consentimiento de avatar controls (US-3.2).
 * Embedded on Preferencias — disclosure, grant, revoke; no recording UX.
 */
export function AvatarConsentSection({
  consent,
  locale,
  copy,
  allowlistHasOwnAvatar,
  preferencesPending = false,
}: AvatarConsentSectionProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);
  const [affirmed, setAffirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const controlsDisabled = pending || preferencesPending;
  const showStaleAllowlistWarning =
    !consent.active && allowlistHasOwnAvatar;

  const inactiveReason =
    !consent.active && consent.reason
      ? copy.inactiveReason[consent.reason]
      : null;

  function clearFeedback() {
    setBanner(null);
  }

  async function handleGrant() {
    if (controlsDisabled || consent.active) {
      return;
    }
    if (!affirmed) {
      setBanner(copy.errors.affirmationRequired);
      return;
    }

    setPending(true);
    clearFeedback();

    try {
      const result = await grantAvatarConsent({
        affirmed: true,
        consentVersion: consent.currentConsentVersion,
      });

      if (result.ok) {
        setAffirmed(false);
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastGrantSuccess,
          life: 5000,
        });
        router.refresh();
        return;
      }

      if (result.error.code === "ALREADY_ACTIVE") {
        toastRef.current?.show({
          severity: "info",
          summary: copy.toastAlreadyActive,
          life: 5000,
        });
        router.refresh();
        return;
      }

      setBanner(
        grantMessageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  async function performRevoke() {
    if (controlsDisabled || !consent.active) {
      return;
    }

    setPending(true);
    clearFeedback();

    try {
      const result = await revokeAvatarConsent();

      if (result.ok) {
        setAffirmed(false);
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastRevokeSuccess,
          life: 5000,
        });
        router.refresh();
        return;
      }

      setBanner(
        revokeMessageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  function requestRevoke() {
    if (controlsDisabled || !consent.active) {
      return;
    }

    confirmDialog({
      header: copy.confirmRevoke.header,
      message: copy.confirmRevoke.message,
      acceptLabel: copy.confirmRevoke.accept,
      rejectLabel: copy.confirmRevoke.reject,
      acceptClassName: "p-button-danger",
      accept: () => void performRevoke(),
    });
  }

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "1rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <ConfirmDialog />
      <Toast ref={toastRef} position="top-right" />

      <div>
        <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>
          {copy.title}
        </h2>
        <p
          style={{
            margin: 0,
            color: "#6b7280",
            fontSize: "0.875rem",
          }}
        >
          {copy.versionLabel.replace(
            "{version}",
            consent.currentConsentVersion,
          )}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          color: "#374151",
          fontSize: "0.9375rem",
          lineHeight: 1.55,
        }}
      >
        {copy.disclosureV1.map((paragraph) => (
          <p key={paragraph.slice(0, 48)} style={{ margin: 0 }}>
            {paragraph}
          </p>
        ))}
      </div>

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%" }} />
      ) : null}

      {inactiveReason && !consent.active ? (
        <Message severity="info" text={inactiveReason} style={{ width: "100%" }} />
      ) : null}

      {consent.active ? (
        <Message
          severity="success"
          text={copy.consentedAt.replace(
            "{date}",
            formatTimestamp(consent.consentedAt, locale),
          )}
          style={{ width: "100%" }}
        />
      ) : null}

      {showStaleAllowlistWarning ? (
        <Message
          severity="warn"
          text={copy.staleAllowlistWarning}
          style={{ width: "100%" }}
        />
      ) : null}

      {!consent.active ? (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-start",
          }}
        >
          <Checkbox
            inputId="avatar-consent-affirmed"
            checked={affirmed}
            disabled={controlsDisabled}
            onChange={(e) => {
              clearFeedback();
              setAffirmed(Boolean(e.checked));
            }}
          />
          <label
            htmlFor="avatar-consent-affirmed"
            style={{
              flex: 1,
              cursor: controlsDisabled ? "default" : "pointer",
              lineHeight: 1.45,
            }}
          >
            {copy.affirmationLabel}
          </label>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {!consent.active ? (
          <Button
            type="button"
            label={pending ? copy.granting : copy.grant}
            onClick={() => void handleGrant()}
            disabled={controlsDisabled || !affirmed}
            loading={pending}
          />
        ) : (
          <Button
            type="button"
            label={pending ? copy.revoking : copy.revoke}
            severity="danger"
            outlined
            onClick={requestRevoke}
            disabled={controlsDisabled}
            loading={pending}
          />
        )}
      </div>
    </section>
  );
}
