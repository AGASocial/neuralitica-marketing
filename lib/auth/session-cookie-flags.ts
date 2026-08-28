/** Idle session cookie lifetime — 7 days (US-14.5). */
export const SESSION_IDLE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type SessionCookieSetOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
  expires?: Date;
};

type IncomingCookieFlags = {
  maxAge?: number;
  expires?: Date | string | number;
};

function toDate(expires: Date | string | number): Date {
  return expires instanceof Date ? expires : new Date(expires);
}

/**
 * Contract cookie flags. Host-only (no Domain). `Secure` in production.
 * Idle `maxAge` / `expires` clamped to ≤ 7 days. `maxAge: 0` / delete unchanged.
 */
export function applySessionCookieFlags(
  incoming?: IncomingCookieFlags,
): SessionCookieSetOptions {
  const options: SessionCookieSetOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  const incomingMaxAge = incoming?.maxAge;

  if (incomingMaxAge === 0) {
    options.maxAge = 0;
    if (incoming?.expires !== undefined) {
      options.expires = toDate(incoming.expires);
    }
    return options;
  }

  if (typeof incomingMaxAge === "number" && incomingMaxAge > 0) {
    options.maxAge = Math.min(incomingMaxAge, SESSION_IDLE_MAX_AGE_SECONDS);
  } else {
    options.maxAge = SESSION_IDLE_MAX_AGE_SECONDS;
  }

  if (incoming?.expires !== undefined) {
    const expires = toDate(incoming.expires);
    const maxExpires = new Date(Date.now() + SESSION_IDLE_MAX_AGE_SECONDS * 1000);
    options.expires = expires.getTime() > maxExpires.getTime() ? maxExpires : expires;
  }

  return options;
}
