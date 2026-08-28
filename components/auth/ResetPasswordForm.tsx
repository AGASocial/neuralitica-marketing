"use client";

import Link from "next/link";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { useState } from "react";

import { CheckEmailView } from "@/components/auth/CheckEmailView";
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
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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
        <p style={{ margin: 0, fontSize: "0.875rem", textAlign: "center" }}>
          <Link href={`/login?locale=${locale}`} style={{ color: "#4338ca" }}>
            {copy.loginLink}
          </Link>
        </p>
      </div>
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
          <label htmlFor="reset-email">{copy.email}</label>
          <InputText
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => updateEmail(event.target.value)}
            invalid={Boolean(fieldErrors.email)}
            disabled={pending}
            autoComplete="email"
            autoFocus
          />
          {fieldErrors.email ? (
            <small style={{ color: "#dc2626" }}>{fieldErrors.email}</small>
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
