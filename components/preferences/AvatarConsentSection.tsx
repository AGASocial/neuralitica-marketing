"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

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
  const [affirmed, setAffirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);

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
        toast.success(copy.toastGrantSuccess, { duration: 5000 });
        router.refresh();
        return;
      }

      if (result.error.code === "ALREADY_ACTIVE") {
        toast.info(copy.toastAlreadyActive, { duration: 5000 });
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
        toast.success(copy.toastRevokeSuccess, { duration: 5000 });
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

    setConfirmRevokeOpen(true);
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-edge bg-panel px-5 py-4">
      <ConfirmDialog
        open={confirmRevokeOpen}
        onOpenChange={setConfirmRevokeOpen}
        header={copy.confirmRevoke.header}
        message={copy.confirmRevoke.message}
        acceptLabel={copy.confirmRevoke.accept}
        rejectLabel={copy.confirmRevoke.reject}
        destructive
        onAccept={() => void performRevoke()}
      />

      <div>
        <h2 className="mb-1.5 font-display text-xl text-fog">{copy.title}</h2>
        <p className="text-sm text-dim">
          {copy.versionLabel.replace("{version}", consent.currentConsentVersion)}
        </p>
      </div>

      <div className="flex flex-col gap-3 text-[0.9375rem] leading-[1.55] text-fog">
        {copy.disclosureV1.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </div>

      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full" />
      ) : null}

      {inactiveReason && !consent.active ? (
        <StatusAlert severity="info" text={inactiveReason} className="w-full" />
      ) : null}

      {consent.active ? (
        <StatusAlert
          severity="success"
          text={copy.consentedAt.replace(
            "{date}",
            formatTimestamp(consent.consentedAt, locale),
          )}
          className="w-full"
        />
      ) : null}

      {showStaleAllowlistWarning ? (
        <StatusAlert
          severity="warn"
          text={copy.staleAllowlistWarning}
          className="w-full"
        />
      ) : null}

      {!consent.active ? (
        <div className="flex items-start gap-3">
          <Checkbox
            id="avatar-consent-affirmed"
            checked={affirmed}
            disabled={controlsDisabled}
            onCheckedChange={(value) => {
              clearFeedback();
              setAffirmed(value === true);
            }}
            className="mt-1"
          />
          <Label
            htmlFor="avatar-consent-affirmed"
            className={
              controlsDisabled
                ? "flex-1 cursor-default leading-[1.45] text-fog"
                : "flex-1 cursor-pointer leading-[1.45] text-fog"
            }
          >
            {copy.affirmationLabel}
          </Label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!consent.active ? (
          <Button
            type="button"
            onClick={() => void handleGrant()}
            disabled={controlsDisabled || !affirmed}
          >
            {pending ? <Spinner className="size-4 text-current" /> : null}
            {pending ? copy.granting : copy.grant}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="border-rose/60 text-rose hover:bg-rose/10 hover:text-rose"
            onClick={requestRevoke}
            disabled={controlsDisabled}
          >
            {pending ? <Spinner className="size-4 text-current" /> : null}
            {pending ? copy.revoking : copy.revoke}
          </Button>
        )}
      </div>
    </section>
  );
}
