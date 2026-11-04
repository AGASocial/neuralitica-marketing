"use client";

import Link from "next/link";
import { useState } from "react";

import { CheckEmailView } from "@/components/auth/CheckEmailView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { PasswordInput } from "@/components/ui/password-input";
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
  showPassword: string;
  hidePassword: string;
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
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="mb-1.5 font-display text-3xl text-fog">{copy.title}</h1>
          <p className="text-sm text-dim">{copy.subtitle}</p>
        </div>

        {formError ? (
          <StatusAlert severity="error" text={formError} className="w-full" />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-display-name" className="text-fog">
            {copy.displayName}
          </Label>
          <Input
            id="signup-display-name"
            value={fields.displayName}
            onChange={(event) => updateField("displayName", event.target.value)}
            aria-invalid={Boolean(fieldErrors.displayName)}
            disabled={pending}
            autoComplete="name"
          />
          {fieldErrors.displayName ? (
            <small className="text-rose">{fieldErrors.displayName}</small>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-email" className="text-fog">
            {copy.email}
          </Label>
          <Input
            id="signup-email"
            type="email"
            value={fields.email}
            onChange={(event) => updateField("email", event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            disabled={pending}
            autoComplete="email"
          />
          {fieldErrors.email ? (
            <small className="text-rose">{fieldErrors.email}</small>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-password" className="text-fog">
            {copy.password}
          </Label>
          <PasswordInput
            id="signup-password"
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
          <Label htmlFor="signup-confirm-password" className="text-fog">
            {copy.confirmPassword}
          </Label>
          <PasswordInput
            id="signup-confirm-password"
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
          {pending ? copy.submitPending : copy.submit}
        </Button>

        <p className="text-center text-sm">
          <Link
            href={`/login?locale=${locale}`}
            className="text-butter underline-offset-4 hover:underline"
          >
            {copy.loginLink}
          </Link>
        </p>
      </div>
    </form>
  );
}
