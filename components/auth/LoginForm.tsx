"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import { useState } from "react";

import { logIn } from "@/lib/auth/actions/log-in";
import type { AuthErrorEnvelope, LogInInput } from "@/lib/contracts/auth";
import type { Locale } from "@/lib/i18n/locales";

type LoginCopy = {
  title: string;
  subtitle: string;
  email: string;
  password: string;
  submit: string;
  submitPending: string;
  genericFailure: string;
  confirmed: string;
  confirmationFailed: string;
  resetSuccess: string;
  signupLink: string;
  resetLink: string;
  requiredField: string;
  invalidEmail: string;
  fieldErrors: {
    email: {
      invalid_format: string;
    };
    password: {
      too_small: string;
    };
  };
};

type AuthErrorsCopy = {
  validation: string;
  forbiddenFields: string;
  internal: string;
};

type LoginFormProps = {
  locale: Locale;
  copy: LoginCopy;
  errorsCopy: AuthErrorsCopy;
  next?: string;
  banner?: "confirmed" | "confirmationFailed" | "resetSuccess";
};

type FormFields = {
  email: string;
  password: string;
};

type FieldErrors = Partial<Record<keyof FormFields, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withLocale(path: string, locale: Locale): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}locale=${encodeURIComponent(locale)}`;
}

function resolveLoginErrorMessage(
  error: AuthErrorEnvelope["error"],
  copy: LoginCopy,
  errorsCopy: AuthErrorsCopy,
): string {
  if (error.code === "INVALID_CREDENTIALS" || error.code === "RATE_LIMITED") {
    return copy.genericFailure;
  }

  const messageByKey: Record<string, string> = {
    "auth.login.genericFailure": copy.genericFailure,
    "auth.errors.validation": errorsCopy.validation,
    "auth.errors.forbiddenFields": errorsCopy.forbiddenFields,
    "auth.errors.internal": errorsCopy.internal,
  };

  return messageByKey[error.messageKey] ?? errorsCopy.internal;
}

function mapServerFieldErrors(
  fields: Record<string, string[]>,
  copy: LoginCopy,
): FieldErrors {
  const next: FieldErrors = {};

  if (fields.email?.includes("invalid_format")) {
    next.email = copy.fieldErrors.email.invalid_format;
  }

  if (fields.password?.includes("too_small")) {
    next.password = copy.fieldErrors.password.too_small;
  }

  return next;
}

export function LoginForm({
  locale,
  copy,
  errorsCopy,
  next,
  banner,
}: LoginFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<FormFields>({
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
    setFormError(null);
  }

  function validateClient(): FieldErrors {
    const nextErrors: FieldErrors = {};
    const trimmedEmail = fields.email.trim();

    if (!trimmedEmail) {
      nextErrors.email = copy.requiredField;
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      nextErrors.email = copy.invalidEmail;
    }

    if (!fields.password) {
      nextErrors.password = copy.requiredField;
    }

    return nextErrors;
  }

  function clearPassword() {
    setFields((current) => ({ ...current, password: "" }));
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

    const payload: LogInInput = {
      email: fields.email.trim(),
      password: fields.password,
    };
    if (next) {
      payload.next = next;
    }

    try {
      const result = await logIn(payload);

      if (result.ok) {
        router.push(withLocale(result.redirectTo, locale));
        return;
      }

      setFormError(resolveLoginErrorMessage(result.error, copy, errorsCopy));

      if (result.error.fields) {
        setFieldErrors((current) => ({
          ...current,
          ...mapServerFieldErrors(result.error.fields!, copy),
        }));
      }
    } catch {
      setFormError(errorsCopy.internal);
    } finally {
      clearPassword();
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>{copy.title}</h1>
          <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
        </div>

        {banner === "confirmed" ? (
          <Message severity="success" text={copy.confirmed} style={{ width: "100%" }} />
        ) : null}

        {banner === "confirmationFailed" ? (
          <Message
            severity="error"
            text={copy.confirmationFailed}
            style={{ width: "100%" }}
          />
        ) : null}

        {banner === "resetSuccess" ? (
          <Message
            severity="success"
            text={copy.resetSuccess}
            style={{ width: "100%" }}
          />
        ) : null}

        {formError ? (
          <Message severity="error" text={formError} style={{ width: "100%" }} />
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label htmlFor="login-email">{copy.email}</label>
          <InputText
            id="login-email"
            type="email"
            value={fields.email}
            onChange={(event) => updateField("email", event.target.value)}
            invalid={Boolean(fieldErrors.email)}
            disabled={pending}
            autoComplete="email"
            autoFocus
          />
          {fieldErrors.email ? (
            <small style={{ color: "#dc2626" }}>{fieldErrors.email}</small>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label htmlFor="login-password">{copy.password}</label>
          <Password
            inputId="login-password"
            value={fields.password}
            onChange={(event) => updateField("password", event.target.value)}
            invalid={Boolean(fieldErrors.password)}
            disabled={pending}
            toggleMask
            feedback={false}
            inputStyle={{ width: "100%" }}
            style={{ width: "100%" }}
            autoComplete="current-password"
          />
          {fieldErrors.password ? (
            <small style={{ color: "#dc2626" }}>{fieldErrors.password}</small>
          ) : null}
        </div>

        <Button
          type="submit"
          label={pending ? copy.submitPending : copy.submit}
          loading={pending}
          disabled={pending}
        />

        <p style={{ margin: 0, fontSize: "0.875rem", textAlign: "center" }}>
          <Link href={`/signup?locale=${locale}`} style={{ color: "#4338ca" }}>
            {copy.signupLink}
          </Link>
        </p>

        <p style={{ margin: 0, fontSize: "0.875rem", textAlign: "center" }}>
          <Link href={`/reset-password?locale=${locale}`} style={{ color: "#4338ca" }}>
            {copy.resetLink}
          </Link>
        </p>
      </div>
    </form>
  );
}
