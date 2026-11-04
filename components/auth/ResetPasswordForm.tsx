"use client";

import Link from "next/link";
import { useState } from "react";

import { CheckEmailView } from "@/components/auth/CheckEmailView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { requestPasswordReset } from "@/lib/auth/actions/request-password-reset";
import type {
  AuthErrorEnvelope,
  RequestPasswordResetInput,
} from "@/lib/contracts/auth";
import type { Locale } from "@/lib/i18n/locales";

type ResetPasswordCopy = {
  title: string;
  subtitle: string;
  email: string;
  submit: string;
  submitPending: string;
  checkEmailTitle: string;
  checkEmail: string;
  loginLink: string;
  requiredField: string;
  invalidEmail: string;
  resend: string;
  resendPending: string;
  resendSuccess: string;
  fieldErrors: {
    email: {
      invalid_format: string;
    };
  };
};

type AuthErrorsCopy = {
  validation: string;
  forbiddenFields: string;
  internal: string;
};

type ResetPasswordFormProps = {
  locale: Locale;
  copy: ResetPasswordCopy;
  errorsCopy: AuthErrorsCopy;
};

type FieldErrors = Partial<Record<"email", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveResetErrorMessage(
  error: AuthErrorEnvelope["error"],
  errorsCopy: AuthErrorsCopy,
): string {
  const messageByKey: Record<string, string> = {
    "auth.errors.validation": errorsCopy.validation,
    "auth.errors.forbiddenFields": errorsCopy.forbiddenFields,
    "auth.errors.internal": errorsCopy.internal,
  };

  return messageByKey[error.messageKey] ?? errorsCopy.internal;
}

export function ResetPasswordForm({
  locale,
  copy,
  errorsCopy,
}: ResetPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  function updateEmail(value: string) {
    setEmail(value);
    setFieldErrors((current) => {
      if (!current.email) {
        return current;
      }

      const next = { ...current };
      delete next.email;
      return next;
    });
    setFormError(null);
  }

  function validateClient(): FieldErrors {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      next.email = copy.requiredField;
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      next.email = copy.invalidEmail;
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

    const payload: RequestPasswordResetInput = {
      email: email.trim(),
    };

    try {
      const result = await requestPasswordReset(payload);

      if (result.ok || result.error.code === "RATE_LIMITED") {
        setSubmittedEmail(payload.email);
        return;
      }

      setFormError(resolveResetErrorMessage(result.error, errorsCopy));

      if (result.error.fields) {
        const next: FieldErrors = {};
        if (result.error.fields.email?.includes("invalid_format")) {
          next.email = copy.fieldErrors.email.invalid_format;
        }
        setFieldErrors(next);
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
      const result = await requestPasswordReset({ email: submittedEmail });

      if (result.ok || result.error.code === "RATE_LIMITED") {
        setResendSuccess(true);
        return;
      }

      setResendError(resolveResetErrorMessage(result.error, errorsCopy));
    } catch {
      setResendError(errorsCopy.internal);
    } finally {
      setResendPending(false);
    }
  }

  if (submittedEmail) {
    return (
      <div className="flex flex-col gap-5">
        <CheckEmailView
          title={copy.checkEmailTitle}
          body={copy.checkEmail}
          resendLabel={copy.resend}
          resendPendingLabel={copy.resendPending}
          resendSuccessMessage={copy.resendSuccess}
          onResend={handleResend}
          resendPending={resendPending}
          resendError={resendError}
          resendSuccess={resendSuccess}
        />
        <p className="text-center text-sm">
          <Link
            href={`/login?locale=${locale}`}
            className="text-butter underline-offset-4 hover:underline"
          >
            {copy.loginLink}
          </Link>
        </p>
      </div>
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
          <Label htmlFor="reset-email" className="text-fog">
            {copy.email}
          </Label>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => updateEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            disabled={pending}
            autoComplete="email"
            autoFocus
          />
          {fieldErrors.email ? (
            <small className="text-rose">{fieldErrors.email}</small>
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
