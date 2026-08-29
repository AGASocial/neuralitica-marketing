import type { ZodError, ZodIssue } from "zod";

import {
  AVATAR_CONSENT_DISCLOSURE_V1,
  type GrantAvatarConsentInput,
} from "@/lib/contracts/avatar-consent";

/**
 * Identity / privilege / timestamp / Preferencias keys — reject as
 * FORBIDDEN_FIELDS before Zod on grant. Never used in WHERE / never written.
 * Note: consentVersion (camelCase) is the allowed echo field — not listed here.
 */
const FORBIDDEN_GRANT_KEYS = new Set(
  [
    "client_id",
    "clientId",
    "id",
    "as_client_id",
    "asClientId",
    "role",
    "active",
    "auth_user_id",
    "authUserId",
    "consented_at",
    "consentedAt",
    "consent_version",
    "revoked_at",
    "revokedAt",
    "allowedModes",
    "allowed_modes",
    "facelessStyle",
    "faceless_style",
    "genericAvatarId",
    "generic_avatar_id",
  ].map((key) => key.toLowerCase()),
);

/** Privilege / identity / timestamp / wrong-surface keys: reject before Zod. */
export function findForbiddenGrantAvatarConsentKeys(
  input: unknown,
): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  return Object.keys(input).filter((key) => {
    const lower = key.toLowerCase();
    if (FORBIDDEN_GRANT_KEYS.has(lower)) {
      return true;
    }
    // consent* except the allowed echo field consentVersion
    if (lower.startsWith("consent") && lower !== "consentversion") {
      return true;
    }
    return false;
  });
}

export function toIsoTimestamp(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Classify grant Zod failures into CONTRACT error codes when possible.
 */
export function classifyGrantAvatarConsentParseFailure(
  input: unknown,
  error: ZodError,
):
  | { kind: "affirmation" }
  | { kind: "version_mismatch" }
  | { kind: "validation"; fields: Record<string, string[]> } {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const body = input as Record<string, unknown>;
    if (
      "consentVersion" in body &&
      body.consentVersion !== AVATAR_CONSENT_DISCLOSURE_V1
    ) {
      return { kind: "version_mismatch" };
    }
    if ("affirmed" in body && body.affirmed !== true) {
      return { kind: "affirmation" };
    }
    if (!("affirmed" in body)) {
      return { kind: "affirmation" };
    }
  }

  return {
    kind: "validation",
    fields: zodConsentErrorToFieldErrors(error),
  };
}

export function isGrantAvatarConsentInput(
  value: unknown,
): value is GrantAvatarConsentInput {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as GrantAvatarConsentInput).affirmed === true &&
    (value as GrantAvatarConsentInput).consentVersion ===
      AVATAR_CONSENT_DISCLOSURE_V1
  );
}

export function zodConsentErrorToFieldErrors(
  error: ZodError,
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      const keys = unrecognizedKeys(issue);
      for (const key of keys) {
        const path = normalizeFieldPath([...issue.path, key]);
        addField(fields, path, "unrecognized_key");
      }
      continue;
    }

    const path = normalizeFieldPath(issue.path);
    addField(fields, path, zodIssueToFieldCode(issue));
  }

  return fields;
}

function addField(
  fields: Record<string, string[]>,
  path: string,
  code: string,
): void {
  if (!path) {
    return;
  }
  fields[path] = [...(fields[path] ?? []), code];
}

function normalizeFieldPath(
  path: readonly (string | number | symbol)[],
): string {
  return path
    .filter(
      (segment): segment is string | number => typeof segment !== "symbol",
    )
    .map(String)
    .join(".");
}

function unrecognizedKeys(issue: ZodIssue): string[] {
  if (issue.code === "unrecognized_keys" && "keys" in issue) {
    return issue.keys;
  }
  return [];
}

function zodIssueToFieldCode(issue: ZodIssue): string {
  switch (issue.code) {
    case "too_small":
      return "too_small";
    case "too_big":
      return "too_big";
    case "invalid_type":
      if ("received" in issue && issue.received === "undefined") {
        return "required";
      }
      return "invalid_type";
    case "invalid_literal":
      return "invalid_type";
    case "unrecognized_keys":
      return "unrecognized_key";
    case "invalid_enum_value":
      return "invalid_type";
    case "custom":
      return issue.message.includes("required") ? "required" : "invalid_type";
    default:
      return issue.code;
  }
}
