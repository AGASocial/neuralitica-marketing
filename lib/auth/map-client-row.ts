import type { CurrentUser, UserRole } from "./get-current-user-types";

export type ClientIdentityRow = {
  id: unknown;
  email: unknown;
  display_name: unknown;
  preferred_locale: unknown;
  role: unknown;
  active: unknown;
};

function mapRole(value: unknown): UserRole {
  return value === "operator" ? "operator" : "client";
}

function mapLocale(value: unknown): "en" | "es" {
  return value === "es" ? "es" : "en";
}

/**
 * Map a `neuramark_clients` row to `CurrentUser`.
 * Missing id/email → null (do not invent identity).
 */
export function mapClientRowToCurrentUser(
  row: ClientIdentityRow | null,
): CurrentUser | null {
  if (!row) {
    return null;
  }

  if (typeof row.id !== "string" || row.id.length === 0) {
    return null;
  }

  if (typeof row.email !== "string" || row.email.length === 0) {
    return null;
  }

  const displayName =
    typeof row.display_name === "string" && row.display_name.length > 0
      ? row.display_name
      : row.email;

  return {
    id: row.id,
    email: row.email,
    displayName,
    preferredLocale: mapLocale(row.preferred_locale),
    role: mapRole(row.role),
    active: row.active === true,
  };
}
