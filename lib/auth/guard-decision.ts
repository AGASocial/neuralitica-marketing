import type { CurrentUser } from "./get-current-user-types";

export type GuardDecision =
  | { kind: "ok"; user: CurrentUser }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

/**
 * `active` before `role`. Missing client row (valid session, no user object)
 * is the same forbidden/pending class as inactive — not an oracle.
 */
export function resolveActiveGuard(input: {
  user: CurrentUser | null;
  hasValidSession: boolean;
}): GuardDecision {
  if (input.user?.active === true) {
    return { kind: "ok", user: input.user };
  }

  if (!input.hasValidSession) {
    return { kind: "unauthenticated" };
  }

  return { kind: "forbidden" };
}

/** Caller must already have an active user (`requireActive` first). */
export function resolveOperatorGuard(user: CurrentUser): GuardDecision {
  if (user.role === "operator") {
    return { kind: "ok", user };
  }

  return { kind: "forbidden" };
}
