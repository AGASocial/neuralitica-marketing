"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
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
  showPassword: string;
  hidePassword: string;
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
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="mb-1.5 font-display text-3xl text-fog">{copy.title}</h1>
          <p className="text-sm text-dim">{copy.subtitle}</p>
        </div>

        {banner === "confirmed" ? (
          <StatusAlert severity="success" text={copy.confirmed} className="w-full" />
        ) : null}

        {banner === "confirmationFailed" ? (
          <StatusAlert
            severity="error"
            text={copy.confirmationFailed}
            className="w-full"
          />
        ) : null}

        {banner === "resetSuccess" ? (
          <StatusAlert severity="success" text={copy.resetSuccess} className="w-full" />
        ) : null}

        {formError ? (
          <StatusAlert severity="error" text={formError} className="w-full" />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email" className="text-fog">
            {copy.email}
          </Label>
          <Input
            id="login-email"
            type="email"
            value={fields.email}
            onChange={(event) => updateField("email", event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            disabled={pending}
            autoComplete="email"
            autoFocus
          />
          {fieldErrors.email ? (
            <small className="text-rose">{fieldErrors.email}</small>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password" className="text-fog">
            {copy.password}
          </Label>
          <PasswordInput
            id="login-password"
            value={fields.password}
            onChange={(event) => updateField("password", event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            disabled={pending}
            showLabel={copy.showPassword}
            hideLabel={copy.hidePassword}
            autoComplete="current-password"
          />
          {fieldErrors.password ? (
            <small className="text-rose">{fieldErrors.password}</small>
          ) : null}
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Spinner className="size-4 text-current" /> : null}
          {pending ? copy.submitPending : copy.submit}
        </Button>

        <p className="text-center text-sm">
          <Link
            href={`/signup?locale=${locale}`}
            className="text-butter underline-offset-4 hover:underline"
          >
            {copy.signupLink}
          </Link>
        </p>

        <p className="text-center text-sm">
          <Link
            href={`/reset-password?locale=${locale}`}
            className="text-butter underline-offset-4 hover:underline"
          >
            {copy.resetLink}
          </Link>
        </p>
      </div>
    </form>
  );
}
