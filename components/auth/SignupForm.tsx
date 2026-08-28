"use client";

import Link from "next/link";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import { useState } from "react";

import { CheckEmailView } from "@/components/auth/CheckEmailView";
import { resendConfirmationEmail } from "@/lib/auth/actions/resend-confirmation";
import { signUp } from "@/lib/auth/actions/sign-up";
import type { AuthErrorEnvelope, SignUpInput } from "@/lib/contracts/auth";
import type { Locale } from "@/lib/i18n/locales";

type SignupCopy = {
  title: string;
  subtitle: string;
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  submit: string;
  submitPending: string;
  passwordHint: string;
  success: string;
  checkEmailTitle: string;
  loginLink: string;
  confirmPasswordMismatch: string;
  requiredField: string;
  invalidEmail: string;
  resend: string;
  resendPending: string;
  resendSuccess: string;
  fieldErrors: {
    email: {
      invalid_format: string;
    };
    displayName: {
      too_small: string;
    };
  };
};

type AuthErrorsCopy = {
  validation: string;
  forbiddenFields: string;
  passwordPolicy: string;
  rateLimited: string;
  internal: string;
};

type PasswordPolicyCopy = {
  TOO_SHORT: string;
  TOO_LONG: string;
  COMMON_PASSWORD: string;
};

type SignupFormProps = {
  locale: Locale;
  copy: SignupCopy;
  errorsCopy: AuthErrorsCopy;
  passwordPolicyCopy: PasswordPolicyCopy;
};

type FormFields = {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
};

type FieldErrors = Partial<Record<keyof FormFields, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveAuthErrorMessage(
  error: AuthErrorEnvelope["error"],
  errorsCopy: AuthErrorsCopy,
  passwordPolicyCopy: PasswordPolicyCopy,
  copy: SignupCopy,
): string {
  if (error.code === "PASSWORD_POLICY" && error.passwordPolicy) {
    return passwordPolicyCopy[error.passwordPolicy];
  }

  const messageByKey: Record<string, string> = {
    "auth.errors.validation": errorsCopy.validation,
    "auth.errors.forbiddenFields": errorsCopy.forbiddenFields,
    "auth.errors.passwordPolicy": errorsCopy.passwordPolicy,
    "auth.errors.rateLimited": errorsCopy.rateLimited,
    "auth.errors.internal": errorsCopy.internal,
  };

  return messageByKey[error.messageKey] ?? errorsCopy.internal;
}

function mapServerFieldErrors(
  fields: Record<string, string[]>,
  copy: SignupCopy,
): FieldErrors {
  const next: FieldErrors = {};

  if (fields.email?.includes("invalid_format")) {
    next.email = copy.fieldErrors.email.invalid_format;
  }

  if (fields.displayName?.includes("too_small")) {
    next.displayName = copy.fieldErrors.displayName.too_small;
  }

  return next;
}

export function SignupForm({
  locale,
  copy,
  errorsCopy,
  passwordPolicyCopy,
}: SignupFormProps) {
  const [fields, setFields] = useState<FormFields>({
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

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
    const trimmedEmail = fields.email.trim();
    const trimmedDisplayName = fields.displayName.trim();

    if (!trimmedEmail) {
      next.email = copy.requiredField;
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      next.email = copy.invalidEmail;
    }

    if (!trimmedDisplayName) {
      next.displayName = copy.requiredField;
    }

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

    const payload: SignUpInput = {
      email: fields.email.trim(),
      password: fields.password,
      displayName: fields.displayName.trim(),
      preferredLocale: locale,
    };

    try {
      const result = await signUp(payload);

      if (result.ok) {
        setSubmittedEmail(payload.email);
        return;
      }

      setFormError(
        resolveAuthErrorMessage(result.error, errorsCopy, passwordPolicyCopy, copy),
      );

      if (result.error.fields) {
        setFieldErrors((current) => ({
          ...current,
          ...mapServerFieldErrors(result.error.fields!, copy),
        }));
      }
    } catch {
      setFormError(errorsCopy.internal);
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    if (!submittedEmail) {
      return;
    }

    setResendError(null);
    setResendSuccess(false);
    setResendPending(true);

    try {
      const result = await resendConfirmationEmail({ email: submittedEmail });

      if (result.ok) {
        setResendSuccess(true);
      } else {
        setResendError(
          resolveAuthErrorMessage(result.error, errorsCopy, passwordPolicyCopy, copy),
        );
      }
    } catch {
      setResendError(errorsCopy.internal);
    } finally {
      setResendPending(false);
    }
  }

  if (submittedEmail) {
    return (
      <CheckEmailView
        title={copy.checkEmailTitle}
        body={copy.success}
        resendLabel={copy.resend}
        resendPendingLabel={copy.resendPending}
        resendSuccessMessage={copy.resendSuccess}
        onResend={handleResend}
        resendPending={resendPending}
        resendError={resendError}
        resendSuccess={resendSuccess}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>{copy.title}</h1>
          <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
        </div>

        {formError ? (
          <Message severity="error" text={formError} style={{ width: "100%" }} />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label htmlFor="signup-display-name">{copy.displayName}</label>
          <InputText
            id="signup-display-name"
            value={fields.displayName}
            onChange={(event) => updateField("displayName", event.target.value)}
            invalid={Boolean(fieldErrors.displayName)}
            disabled={pending}
            autoComplete="name"
          />
          {fieldErrors.displayName ? (
            <small style={{ color: "#dc2626" }}>{fieldErrors.displayName}</small>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label htmlFor="signup-email">{copy.email}</label>
          <InputText
            id="signup-email"
            type="email"
            value={fields.email}
            onChange={(event) => updateField("email", event.target.value)}
            invalid={Boolean(fieldErrors.email)}
            disabled={pending}
            autoComplete="email"
          />
          {fieldErrors.email ? (
            <small style={{ color: "#dc2626" }}>{fieldErrors.email}</small>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label htmlFor="signup-password">{copy.password}</label>
          <Password
            inputId="signup-password"
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
          <label htmlFor="signup-confirm-password">{copy.confirmPassword}</label>
          <Password
            inputId="signup-confirm-password"
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
          label={pending ? copy.submitPending : copy.submit}
          loading={pending}
          disabled={pending}
        />

        <p style={{ margin: 0, fontSize: "0.875rem", textAlign: "center" }}>
          <Link href={`/login?locale=${locale}`} style={{ color: "#4338ca" }}>
            {copy.loginLink}
          </Link>
        </p>
      </div>
    </form>
  );
}
