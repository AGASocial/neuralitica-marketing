import "server-only";

import { headers } from "next/headers";

import type { AuthErrorEnvelope } from "@/lib/contracts/auth";
import { forbiddenError, unauthenticatedError } from "@/lib/auth/errors";
import {
  getCurrentUser,
  getSessionAuthUser,
  type CurrentUser,
} from "@/lib/auth/get-current-user";
import { resolveActiveGuard, resolveOperatorGuard } from "@/lib/auth/guard-decision";
import { buildLoginLocation } from "@/lib/auth/login-redirect";
import { LOCALE_HEADER, PATHNAME_HEADER } from "@/lib/auth/public-routes";

/**
 * Lazy-load next/navigation — its module init calls React.createContext, which
 * is undefined under Fly worker NODE_OPTIONS `--conditions=react-server`.
 * Handler/worker paths must never top-level-import navigation.
 */
async function redirectPage(url: string): Promise<never> {
  const { redirect } = await import("next/navigation");
  redirect(url);
  throw new Error("redirect_unreachable");
}

export type GuardMode = "page" | "handler";

export class AuthGuardError extends Error {
  readonly status: 401 | 403;
  readonly envelope: AuthErrorEnvelope;

  constructor(status: 401 | 403, envelope: AuthErrorEnvelope) {
    super(envelope.error.messageKey);
    this.name = "AuthGuardError";
    this.status = status;
    this.envelope = envelope;
  }
}

export function isAuthGuardError(error: unknown): error is AuthGuardError {
  return error instanceof AuthGuardError;
}

export function authGuardResponse(error: AuthGuardError): Response {
  return Response.json(error.envelope, { status: error.status });
}

function throwPageForbidden(): never {
  const digest = "NEXT_HTTP_ERROR_FALLBACK;403";
  const error = new Error(digest) as Error & { digest: string };
  error.digest = digest;
  throw error;
}

async function readGuardLocation(): Promise<{
  pathname: string;
  locale: string | null;
}> {
  const headerList = await headers();
  const pathname = headerList.get(PATHNAME_HEADER) ?? "/dashboard";
  const locale = headerList.get(LOCALE_HEADER);
  return { pathname, locale };
}

async function failUnauthenticated(
  mode: GuardMode,
  loginLocation: string,
): Promise<never> {
  if (mode === "page") {
    await redirectPage(loginLocation);
  }

  throw new AuthGuardError(401, unauthenticatedError());
}

async function failForbidden(mode: GuardMode): Promise<never> {
  if (mode === "page") {
    await redirectPage("/pending");
  }

  throw new AuthGuardError(403, forbiddenError());
}

function failOperatorForbidden(mode: GuardMode): never {
  if (mode === "page") {
    throwPageForbidden();
  }

  throw new AuthGuardError(403, forbiddenError());
}

/**
 * Product gate. Pages redirect; handlers throw `AuthGuardError` (401/403)
 * with no side effects. Call before any spend / mutation.
 */
export async function requireActive(mode: GuardMode): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const authUser = user ? true : Boolean(await getSessionAuthUser());
  const decision = resolveActiveGuard({
    user,
    hasValidSession: authUser,
  });

  if (decision.kind === "ok") {
    return decision.user;
  }

  if (decision.kind === "unauthenticated") {
    const { pathname, locale } = await readGuardLocation();
    return await failUnauthenticated(
      mode,
      buildLoginLocation({ next: pathname, locale }),
    );
  }

  return await failForbidden(mode);
}

/**
 * Operator gate. Always runs `requireActive` first (`active` before `role`).
 * Inactive operator has no access. Role is never read from the request.
 */
export async function requireOperator(mode: GuardMode): Promise<CurrentUser> {
  const user = await requireActive(mode);
  const decision = resolveOperatorGuard(user);

  if (decision.kind === "ok") {
    return decision.user;
  }

  failOperatorForbidden(mode);
}

/**
 * Pending page only. At most email + displayName into the view.
 * Unauthenticated → `/login` without `next`. Active → `/dashboard`.
 */
export async function loadPendingIdentity(): Promise<{
  email: string;
  displayName: string;
}> {
  const authUser = await getSessionAuthUser();
  if (!authUser) {
    const { locale } = await readGuardLocation();
    return await redirectPage(buildLoginLocation({ next: null, locale }));
  }

  const user = await getCurrentUser();
  if (user?.active === true) {
    return await redirectPage("/dashboard");
  }

  if (user) {
    return { email: user.email, displayName: user.displayName };
  }

  const email = authUser.email;
  const displayName =
    authUser.displayName.length > 0 ? authUser.displayName : email;

  return {
    email,
    displayName: displayName.length > 0 ? displayName : email,
  };
}
