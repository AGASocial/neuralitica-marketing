import "server-only";

import type { BusinessProfileFields } from "@/lib/contracts/interview";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { isUniqueViolation } from "@/lib/interview/postgres-errors";

export type CompleteInterviewRpcResult = {
  version: number;
  alreadyCompleted: boolean;
};

type ProfileRow = {
  version: unknown;
};

/**
 * Atomic upsert Ficha viva + mark Entrevista completed (fail-closed RPC).
 * `client_id` / `source_interview_id` must be server-resolved only.
 */
export async function completeInterviewWithProfile(params: {
  clientId: string;
  sessionId: string;
  fields: BusinessProfileFields;
}): Promise<CompleteInterviewRpcResult> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "neuramark_complete_interview_with_profile",
    {
      p_client_id: params.clientId,
      p_session_id: params.sessionId,
      p_fields: params.fields,
    },
  );

  if (error) {
    if (isUniqueViolation(error)) {
      const recovered = await selectOwnProfileVersion(params.clientId);
      if (recovered != null) {
        return { version: recovered, alreadyCompleted: true };
      }
    }
    console.error("[profile] complete rpc failed", { code: error.code });
    throw new Error("Interview submit unavailable");
  }

  const parsed = parseRpcResult(data);
  if (!parsed) {
    console.error("[profile] complete rpc malformed result");
    throw new Error("Interview submit unavailable");
  }
  return parsed;
}

/**
 * Profile-first upsert (fail-closed two-step fallback when RPC unavailable).
 * Inserts version 1, or updates fields and bumps version on existing row.
 */
export async function upsertBusinessProfile(params: {
  clientId: string;
  sessionId: string;
  fields: BusinessProfileFields;
}): Promise<number> {
  const existing = await selectOwnProfileVersion(params.clientId);
  const supabase = createServerSupabaseClient();

  if (existing == null) {
    const { data, error } = await supabase
      .from("neuramark_business_profiles")
      .insert({
        client_id: params.clientId,
        source_interview_id: params.sessionId,
        fields: params.fields,
        version: 1,
      })
      .select("version")
      .maybeSingle();

    if (error && isUniqueViolation(error)) {
      const recovered = await selectOwnProfileVersion(params.clientId);
      if (recovered != null) {
        return recovered;
      }
    }

    if (error || !data) {
      console.error("[profile] insert failed", {
        ...(error?.code ? { code: error.code } : {}),
      });
      throw new Error("Interview submit unavailable");
    }

    return Number((data as ProfileRow).version);
  }

  const nextVersion = existing + 1;
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .update({
      fields: params.fields,
      source_interview_id: params.sessionId,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", params.clientId)
    .select("version")
    .maybeSingle();

  if (error || !data) {
    console.error("[profile] update failed", {
      ...(error?.code ? { code: error.code } : {}),
    });
    throw new Error("Interview submit unavailable");
  }

  return Number((data as ProfileRow).version);
}

/**
 * After successful profile write only: set session completed.
 * Call only when `mayMarkInterviewCompleted(true)`.
 */
export async function markInterviewCompleted(params: {
  clientId: string;
  sessionId: string;
}): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", params.clientId)
    .eq("id", params.sessionId)
    .in("status", ["draft", "completed"])
    .select("status")
    .maybeSingle();

  if (error) {
    console.error("[interview] mark completed failed", { code: error.code });
    throw new Error("Interview submit unavailable");
  }

  return data != null && String(data.status) === "completed";
}

export async function selectOwnProfileVersion(
  clientId: string,
): Promise<number | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .select("version")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    console.error("[profile] select failed", { code: error.code });
    throw new Error("Profile load unavailable");
  }

  if (!data) {
    return null;
  }
  const version = Number((data as ProfileRow).version);
  if (!Number.isInteger(version) || version < 1) {
    return null;
  }
  return version;
}

function parseRpcResult(data: unknown): CompleteInterviewRpcResult | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const row = data as Record<string, unknown>;
  const version = Number(row.version);
  if (!Number.isInteger(version) || version < 1) {
    return null;
  }
  return {
    version,
    alreadyCompleted: row.alreadyCompleted === true,
  };
}
