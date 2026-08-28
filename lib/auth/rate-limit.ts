import "server-only";

import type { AuthAttemptAction } from "@/lib/contracts/auth";

import { hashEmail, hashIp } from "./hash";
import { createServerSupabaseClient } from "./supabase-server";

type RecordAttemptParams = {
  ip: string;
  action: AuthAttemptAction;
  email?: string;
};

export async function recordAuthAttempt(
  params: RecordAttemptParams,
): Promise<void> {
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
  }
}

async function countAttempts(params: {
  ipHash?: string;
  emailHash?: string;
  action: AuthAttemptAction;
  since: Date;
}): Promise<number> {
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
    return 0;
  }

  return count ?? 0;
}

/** Signup: max 5 attempts per IP per hour and 15 per IP per day. */
export async function isSignupRateLimited(ip: string): Promise<boolean> {
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

  return hourlyCount >= 5 || dailyCount >= 15;
}

/** Resend confirmation: max 3 attempts per email per hour. */
export async function isResendConfirmationRateLimited(
  email: string,
): Promise<boolean> {
  const emailHash = hashEmail(email);
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const count = await countAttempts({
    emailHash,
    action: "resend_confirmation",
    since,
  });

  return count >= 3;
}
