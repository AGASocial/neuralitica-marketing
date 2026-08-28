/**
 * Auth contract types and Zod schemas (US-14.1 signup, US-14.2 login, US-14.3 logout, US-14.4 reset).
 * FE imports types only; password policy and next-path sanitizer stay server-side.
 */
import { z } from "zod";

import { supportedLocaleSchema } from "./providers";

/** DB enum neuramark_client_role — not accepted on any auth request */
export const clientRoleSchema = z.enum(["client", "operator"]);
export type ClientRole = z.infer<typeof clientRoleSchema>;

/** DB enum neuramark_auth_action — server-only writes. No `login_success` (US-14.2). No `logout` (US-14.3). No set-password action (US-14.4). */
export const authAttemptActionSchema = z.enum([
  "signup",
  "resend_confirmation",
  "login_failed",
  "password_reset_request",
]);
export type AuthAttemptAction = z.infer<typeof authAttemptActionSchema>;

/** Machine-readable error codes returned to the client */
export const authErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "PASSWORD_POLICY",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "RECOVERY_INVALID",
  "UNAUTHENTICATED",
  "FORBIDDEN",
]);
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;

/** Password policy rejection detail (field-level, does not leak account existence) */
export const passwordPolicyViolationSchema = z.enum([
  "TOO_SHORT",
  "TOO_LONG",
  "COMMON_PASSWORD",
]);
export type PasswordPolicyViolation = z.infer<
  typeof passwordPolicyViolationSchema
>;

/** Forbidden if present on the wire: role, active, auth_user_id, client_id, confirmPassword */
export const signUpInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .email()
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
    displayName: z.string().trim().min(1).max(120),
    preferredLocale: supportedLocaleSchema.optional(),
  })
  .strict();
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const resendConfirmationInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .email()
      .transform((v) => v.toLowerCase()),
  })
  .strict();
export type ResendConfirmationInput = z.infer<
  typeof resendConfirmationInputSchema
>;

/** Enumeration-safe success — new signup, duplicate email, and resend all use this shape */
export const authGenericSuccessSchema = z.object({
  ok: z.literal(true),
});
export type AuthGenericSuccess = z.infer<typeof authGenericSuccessSchema>;

export const signUpSuccessSchema = authGenericSuccessSchema;
export type SignUpSuccess = z.infer<typeof signUpSuccessSchema>;

export const resendConfirmationSuccessSchema = authGenericSuccessSchema;
export type ResendConfirmationSuccess = z.infer<
  typeof resendConfirmationSuccessSchema
>;

export const authFieldErrorsSchema = z.record(z.string(), z.array(z.string()));

export const authErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: authErrorCodeSchema,
    /** i18n keys under auth.errors.* / auth.login.* / auth.reset.* — FE maps to EN/ES copy */
    messageKey: z.string(),
    fields: authFieldErrorsSchema.optional(),
    passwordPolicy: passwordPolicyViolationSchema.optional(),
  }),
});
export type AuthErrorEnvelope = z.infer<typeof authErrorEnvelopeSchema>;

export const signUpResultSchema = z.discriminatedUnion("ok", [
  signUpSuccessSchema,
  authErrorEnvelopeSchema,
]);
export type SignUpResult = z.infer<typeof signUpResultSchema>;

export const resendConfirmationResultSchema = z.discriminatedUnion("ok", [
  resendConfirmationSuccessSchema,
  authErrorEnvelopeSchema,
]);
export type ResendConfirmationResult = z.infer<
  typeof resendConfirmationResultSchema
>;

/** Optional `next` is a candidate only; server sanitizes after successful active login. */
export const logInInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .email()
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
    next: z.string().max(2048).optional(),
  })
  .strict();
export type LogInInput = z.infer<typeof logInInputSchema>;

/**
 * Opaque landing path. FE must navigate here as-is.
 * `/pending` when inactive or missing client row; otherwise sanitized `next` or `/dashboard`.
 * Cookie is not part of this JSON body.
 */
export const logInSuccessSchema = z.object({
  ok: z.literal(true),
  redirectTo: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => value.startsWith("/") && !value.startsWith("//")),
  email: z.string().min(1).max(320),
  displayName: z.string().min(1).max(120),
});
export type LogInSuccess = z.infer<typeof logInSuccessSchema>;

export const logInResultSchema = z.discriminatedUnion("ok", [
  logInSuccessSchema,
  authErrorEnvelopeSchema,
]);
export type LogInResult = z.infer<typeof logInResultSchema>;

/** Forbidden if present: role, active, auth_user_id, client_id (same privilege keys as resend). */
export const requestPasswordResetInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1)
      .max(320)
      .email()
      .transform((v) => v.toLowerCase()),
  })
  .strict();
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetInputSchema
>;

export const requestPasswordResetSuccessSchema = authGenericSuccessSchema;
export type RequestPasswordResetSuccess = z.infer<
  typeof requestPasswordResetSuccessSchema
>;

export const requestPasswordResetResultSchema = z.discriminatedUnion("ok", [
  requestPasswordResetSuccessSchema,
  authErrorEnvelopeSchema,
]);
export type RequestPasswordResetResult = z.infer<
  typeof requestPasswordResetResultSchema
>;

/**
 * New password only. `confirmPassword` / `confirm_password` are forbidden on the
 * wire (client match is UX only). Privilege keys (role, active, …) also forbidden.
 */
export const setNewPasswordInputSchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();
export type SetNewPasswordInput = z.infer<typeof setNewPasswordInputSchema>;

/**
 * Opaque login path after global sign-out. FE must navigate here as-is.
 * Cookie is not part of this JSON body (and must not remain after success).
 */
export const setNewPasswordSuccessSchema = z.object({
  ok: z.literal(true),
  redirectTo: z.literal("/login?reset=1"),
});
export type SetNewPasswordSuccess = z.infer<typeof setNewPasswordSuccessSchema>;

export const setNewPasswordResultSchema = z.discriminatedUnion("ok", [
  setNewPasswordSuccessSchema,
  authErrorEnvelopeSchema,
]);
export type SetNewPasswordResult = z.infer<typeof setNewPasswordResultSchema>;

/**
 * Empty body only. Privilege keys (role, active, auth_user_id, client_id) are
 * rejected before Zod. Omitted / undefined is treated as `{}` at the action.
 */
export const logOutInputSchema = z.object({}).strict();
export type LogOutInput = z.infer<typeof logOutInputSchema>;

/**
 * Opaque login path after local sign-out. FE must navigate here as-is.
 * No `next` of the page they left. No `?loggedOut=1`. Cookie is not in this body.
 */
export const logOutSuccessSchema = z.object({
  ok: z.literal(true),
  redirectTo: z.literal("/login"),
});
export type LogOutSuccess = z.infer<typeof logOutSuccessSchema>;

export const logOutResultSchema = z.discriminatedUnion("ok", [
  logOutSuccessSchema,
  authErrorEnvelopeSchema,
]);
export type LogOutResult = z.infer<typeof logOutResultSchema>;
