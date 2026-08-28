"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import { useState } from "react";

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>{title}</h1>
      </div>
      <Message severity="error" text={message} style={{ width: "100%" }} />
      <p style={{ margin: 0, fontSize: "0.875rem", textAlign: "center" }}>
        <Link href={`/reset-password?locale=${locale}`} style={{ color: "#4338ca" }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>{copy.setTitle}</h1>
          <p style={{ margin: 0, color: "#4b5563" }}>{copy.setSubtitle}</p>
        </div>

        {formError ? (
          <Message severity="error" text={formError} style={{ width: "100%" }} />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label htmlFor="reset-new-password">{copy.password}</label>
          <Password
            inputId="reset-new-password"
            value={fields.password}
            onChange={(event) => updateField("password", event.target.value)}
            invalid={Boolean(fieldErrors.password)}
            disabled={pending}
            toggleMask
            feedback={false}
            inputStyle={{ width: "100%" }}
            style={{ width: "100%" }}
            autoComplete="new-password"
          />
          <small style={{ color: "#6b7280" }}>{copy.passwordHint}</small>
          {fieldErrors.password ? (
            <small style={{ color: "#dc2626" }}>{fieldErrors.password}</small>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label htmlFor="reset-confirm-password">{copy.confirmPassword}</label>
          <Password
            inputId="reset-confirm-password"
            value={fields.confirmPassword}
            onChange={(event) => updateField("confirmPassword", event.target.value)}
            invalid={Boolean(fieldErrors.confirmPassword)}
            disabled={pending}
            toggleMask
            feedback={false}
            inputStyle={{ width: "100%" }}
            style={{ width: "100%" }}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword ? (
            <small style={{ color: "#dc2626" }}>{fieldErrors.confirmPassword}</small>
          ) : null}
        </div>

        <Button
          type="submit"
          label={pending ? copy.setSubmitPending : copy.setSubmit}
          loading={pending}
          disabled={pending}
        />
      </div>
    </form>
  );
}
