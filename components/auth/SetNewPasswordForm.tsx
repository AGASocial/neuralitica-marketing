"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { setNewPassword } from "@/lib/auth/actions/set-new-password";
import type { AuthErrorEnvelope, SetNewPasswordInput } from "@/lib/contracts/auth";
import type { Locale } from "@/lib/i18n/locales";

type SetNewPasswordCopy = {
  setTitle: string;
  setSubtitle: string;
  password: string;
  confirmPassword: string;
  setSubmit: string;
  setSubmitPending: string;
  passwordHint: string;
  confirmPasswordMismatch: string;
  requiredField: string;
  invalidToken: string;
  retry: string;
  showPassword: string;
  hidePassword: string;
  fieldErrors: {
    password: {
      too_small: string;
    };
  };
};

type AuthErrorsCopy = {
  validation: string;
  forbiddenFields: string;
  passwordPolicy: string;
  internal: string;
};

type PasswordPolicyCopy = {
  TOO_SHORT: string;
  TOO_LONG: string;
  COMMON_PASSWORD: string;
};

type SetNewPasswordFormProps = {
  locale: Locale;
  recoveryReady: boolean;
  copy: SetNewPasswordCopy;
  errorsCopy: AuthErrorsCopy;
  passwordPolicyCopy: PasswordPolicyCopy;
};

type FormFields = {
  password: string;
  confirmPassword: string;
};

type FieldErrors = Partial<Record<keyof FormFields, string>>;

function resolveSetPasswordErrorMessage(
  error: AuthErrorEnvelope["error"],
  errorsCopy: AuthErrorsCopy,
  passwordPolicyCopy: PasswordPolicyCopy,
  copy: SetNewPasswordCopy,
): string {
  if (error.code === "RECOVERY_INVALID") {
    return copy.invalidToken;
  }

  if (error.code === "PASSWORD_POLICY" && error.passwordPolicy) {
    return passwordPolicyCopy[error.passwordPolicy];
  }

  const messageByKey: Record<string, string> = {
    "auth.reset.invalidToken": copy.invalidToken,
    "auth.errors.validation": errorsCopy.validation,
    "auth.errors.forbiddenFields": errorsCopy.forbiddenFields,
    "auth.errors.passwordPolicy": errorsCopy.passwordPolicy,
    "auth.errors.internal": errorsCopy.internal,
  };

  return messageByKey[error.messageKey] ?? errorsCopy.internal;
}

function InvalidResetLink({
  locale,
  title,
  message,
  retryLabel,
}: {
  locale: Locale;
  title: string;
  message: string;
  retryLabel: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1.5 font-display text-3xl text-fog">{title}</h1>
      </div>
      <StatusAlert severity="error" text={message} className="w-full" />
      <p className="text-center text-sm">
        <Link
          href={`/reset-password?locale=${locale}`}
          className="text-butter underline-offset-4 hover:underline"
        >
          {retryLabel}
        </Link>
      </p>
    </div>
  );
}

export function SetNewPasswordForm({
  locale,
  recoveryReady,
  copy,
  errorsCopy,
  passwordPolicyCopy,
}: SetNewPasswordFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<FormFields>({
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [recoveryInvalid, setRecoveryInvalid] = useState(false);

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
  }

  function validateClient(): FieldErrors {
    const next: FieldErrors = {};

    if (!fields.password) {
      next.password = copy.requiredField;
    }

    if (!fields.confirmPassword) {
      next.confirmPassword = copy.requiredField;
    } else if (fields.password !== fields.confirmPassword) {
      next.confirmPassword = copy.confirmPasswordMismatch;
    }

    return next;
  }

  function clearPasswords() {
    setFields({ password: "", confirmPassword: "" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setFieldErrors({});
    setPending(true);

    const payload: SetNewPasswordInput = {
      password: fields.password,
    };

    try {
      const result = await setNewPassword(payload);

      if (result.ok) {
        clearPasswords();
        router.push(result.redirectTo);
        return;
      }

      if (result.error.code === "RECOVERY_INVALID") {
        setRecoveryInvalid(true);
        return;
      }

      setFormError(
        resolveSetPasswordErrorMessage(
          result.error,
          errorsCopy,
          passwordPolicyCopy,
          copy,
        ),
      );

      if (result.error.fields?.password?.includes("too_small")) {
        setFieldErrors({
          password: copy.fieldErrors.password.too_small,
        });
      }
    } catch {
      setFormError(errorsCopy.internal);
    } finally {
      clearPasswords();
      setPending(false);
    }
  }

  if (!recoveryReady || recoveryInvalid) {
    return (
      <InvalidResetLink
        locale={locale}
        title={copy.setTitle}
        message={copy.invalidToken}
        retryLabel={copy.retry}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="mb-1.5 font-display text-3xl text-fog">{copy.setTitle}</h1>
          <p className="text-sm text-dim">{copy.setSubtitle}</p>
        </div>

        {formError ? (
          <StatusAlert severity="error" text={formError} className="w-full" />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-new-password" className="text-fog">
            {copy.password}
          </Label>
          <PasswordInput
            id="reset-new-password"
            value={fields.password}
            onChange={(event) => updateField("password", event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            disabled={pending}
            showLabel={copy.showPassword}
            hideLabel={copy.hidePassword}
            autoComplete="new-password"
          />
          <small className="text-dim">{copy.passwordHint}</small>
          {fieldErrors.password ? (
            <small className="text-rose">{fieldErrors.password}</small>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-confirm-password" className="text-fog">
            {copy.confirmPassword}
          </Label>
          <PasswordInput
            id="reset-confirm-password"
            value={fields.confirmPassword}
            onChange={(event) => updateField("confirmPassword", event.target.value)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            disabled={pending}
            showLabel={copy.showPassword}
            hideLabel={copy.hidePassword}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword ? (
            <small className="text-rose">{fieldErrors.confirmPassword}</small>
          ) : null}
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Spinner className="size-4 text-current" /> : null}
          {pending ? copy.setSubmitPending : copy.setSubmit}
        </Button>
      </div>
    </form>
  );
}
