import "server-only";

import type { AuthAttemptAction } from "@/lib/contracts/auth";

import { hashEmail, hashIp } from "./hash";
import { createServerSupabaseClient } from "./supabase-server";

type RecordAttemptParams = {
  ip: string;
  action: AuthAttemptAction;
  email?: string;
};

/**
 * Persist one auth attempt. Returns false if the store cannot be written —
 * callers must fail closed (treat as rate-limited).
 */
export async function recordAuthAttempt(
  params: RecordAttemptParams,
): Promise<boolean> {
  try {
    const supabase = createServerSupabaseClient();

    const row: {
      ip_hash: string;
      action: AuthAttemptAction;
      email_hash?: string;
    } = {
      ip_hash: hashIp(params.ip),
      action: params.action,
    };

    if (params.email) {
      row.email_hash = hashEmail(params.email);
    }

    const { error } = await supabase.from("neuramark_auth_attempts").insert(row);

    if (error) {
      console.error("[auth] failed to record auth attempt", {
        action: params.action,
        code: error.code,
      });
      return false;
    }

    return true;
  } catch {
    console.error("[auth] failed to record auth attempt", {
      action: params.action,
    });
    return false;
  }
}

/** null means the count query failed — callers must fail closed. */
async function countAttempts(params: {
  ipHash?: string;
  emailHash?: string;
  action: AuthAttemptAction;
  since: Date;
}): Promise<number | null> {
  try {
    const supabase = createServerSupabaseClient();

    let query = supabase
      .from("neuramark_auth_attempts")
      .select("*", { count: "exact", head: true })
      .eq("action", params.action)
      .gte("attempted_at", params.since.toISOString());

    if (params.ipHash) {
      query = query.eq("ip_hash", params.ipHash);
    }

    if (params.emailHash) {
      query = query.eq("email_hash", params.emailHash);
    }

    const { count, error } = await query;

    if (error) {
      console.error("[auth] failed to count auth attempts", {
        action: params.action,
        code: error.code,
      });
      return null;
    }

    return count ?? 0;
  } catch {
    console.error("[auth] failed to count auth attempts", {
      action: params.action,
    });
    return null;
  }
}

/**
 * Signup: max 5 attempts per IP per hour and 15 per IP per day.
 * Residual TOCTOU: insert-then-count without a lock; concurrent bursts may
 * slip one extra attempt. Store errors fail closed (limited = true).
 */
export async function isSignupRateLimited(ip: string): Promise<boolean> {
  try {
    const ipHash = hashIp(ip);
    const now = Date.now();

    const [hourlyCount, dailyCount] = await Promise.all([
      countAttempts({
        ipHash,
        action: "signup",
        since: new Date(now - 60 * 60 * 1000),
      }),
      countAttempts({
        ipHash,
        action: "signup",
        since: new Date(now - 24 * 60 * 60 * 1000),
      }),
    ]);

    if (hourlyCount === null || dailyCount === null) {
      return true;
    }

    return hourlyCount >= 5 || dailyCount >= 15;
  } catch {
    console.error("[auth] signup rate limit check failed");
    return true;
  }
}

/**
 * Resend confirmation: max 3 per email per hour and 10 per IP per hour.
 * IP cap is defense-in-depth (not in the FE contract); over-limit still
 * returns generic RATE_LIMITED. Store errors fail closed.
 */
export async function isResendConfirmationRateLimited(
  email: string,
  ip: string,
): Promise<boolean> {
  try {
    const emailHash = hashEmail(email);
    const ipHash = hashIp(ip);
    const since = new Date(Date.now() - 60 * 60 * 1000);

    const [emailCount, ipCount] = await Promise.all([
      countAttempts({
        emailHash,
        action: "resend_confirmation",
        since,
      }),
      countAttempts({
        ipHash,
        action: "resend_confirmation",
        since,
      }),
    ]);

    if (emailCount === null || ipCount === null) {
      return true;
    }

    return emailCount >= 3 || ipCount >= 10;
  } catch {
    console.error("[auth] resend rate limit check failed");
    return true;
  }
}

const LOGIN_FAILED_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILED_MAX = 5;

/**
 * Login: max 5 `login_failed` per (email_hash, ip_hash) per 15 minutes.
 * Store/count errors fail closed (limited = true). No `login_success` rows.
 */
export async function isLoginRateLimited(
  email: string,
  ip: string,
): Promise<boolean> {
  try {
    const count = await countAttempts({
      emailHash: hashEmail(email),
      ipHash: hashIp(ip),
      action: "login_failed",
      since: new Date(Date.now() - LOGIN_FAILED_WINDOW_MS),
    });

    if (count === null) {
      return true;
    }

    return count >= LOGIN_FAILED_MAX;
  } catch {
    console.error("[auth] login rate limit check failed");
    return true;
  }
}

/**
 * Clear `login_failed` rows for this (email, IP) pair so the window resets.
 * Returns false on store error — callers must still succeed the login.
 */
export async function resetLoginFailedAttempts(
  email: string,
  ip: string,
): Promise<boolean> {
  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("neuramark_auth_attempts")
      .delete()
      .eq("action", "login_failed")
      .eq("email_hash", hashEmail(email))
      .eq("ip_hash", hashIp(ip));

    if (error) {
      console.error("[auth] failed to reset login_failed attempts", {
        code: error.code,
      });
      return false;
    }

    return true;
  } catch {
    console.error("[auth] failed to reset login_failed attempts");
    return false;
  }
}
