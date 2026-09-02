import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadE2EEnv } from "./env";

/** Matches `DEV_USER` in lib/auth/get-current-user.ts (AUTH_DEV_FALLBACK). */
export const E2E_CLIENT_ID = "00000000-0000-4000-8000-000000000001";

const SNAPSHOT_PATH = resolve(process.cwd(), "e2e/.interview-snapshot.json");

export const INTERVIEW_FIXTURE = {
  services: { items: ["E2E emergency plumbing"] },
  zone: { description: "E2E service area covering Austin and nearby ZIP codes" },
  tone: { description: "Warm, plain language, no slang" },
  offers: { items: ["Same-week visit for members"] },
  objections: { items: ["Price compared to big chains"] },
  style: { description: "Short sentences, local landmarks" },
} as const;

type Snapshot = {
  session: {
    status: string;
    current_step: string;
    answers: unknown;
  } | null;
  profile: {
    fields: unknown;
    version: number;
    source_interview_id: string;
  } | null;
};

function getServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  );
}

export function createE2ESupabase(): SupabaseClient {
  loadE2EEnv();
  const url = process.env.SUPABASE_URL;
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      "E2E requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Fails fast with the exact production gap that blocked step 7 submit:
 * persist of restrictions succeeds, but complete-interview has nowhere to write.
 */
export async function assertInterviewSubmitSchema(): Promise<void> {
  const supabase = createE2ESupabase();
  const { error: tableError } = await supabase
    .from("neuramark_business_profiles")
    .select("id")
    .limit(1);

  if (tableError) {
    throw new Error(
      `neuramark_business_profiles is missing or unreadable (${tableError.code ?? tableError.message}). Apply supabase/migrations/20260829120000_neuramark_business_profiles.sql — step 7 submit cannot create the living profile without it.`,
    );
  }

  const { error: rpcError } = await supabase.rpc(
    "neuramark_complete_interview_with_profile",
    {
      p_client_id: "00000000-0000-4000-8000-000000000000",
      p_session_id: "00000000-0000-4000-8000-000000000000",
      p_fields: {},
    },
  );

  if (rpcError?.code === "PGRST202" || /could not find the function/i.test(rpcError?.message ?? "")) {
    throw new Error(
      "RPC neuramark_complete_interview_with_profile is missing. Apply the business profiles migration before running interview E2E.",
    );
  }
}

export async function snapshotInterviewState(): Promise<void> {
  const supabase = createE2ESupabase();
  const { data: session, error: sessionError } = await supabase
    .from("neuramark_interview_sessions")
    .select("status, current_step, answers")
    .eq("client_id", E2E_CLIENT_ID)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Interview snapshot select failed: ${sessionError.message}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("neuramark_business_profiles")
    .select("fields, version, source_interview_id")
    .eq("client_id", E2E_CLIENT_ID)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(`Profile snapshot select failed: ${profileError.message}`);
  }

  const snapshot: Snapshot = {
    session: session
      ? {
          status: String(session.status),
          current_step: String(session.current_step),
          answers: session.answers,
        }
      : null,
    profile: profile
      ? {
          fields: profile.fields,
          version: Number(profile.version),
          source_interview_id: String(profile.source_interview_id),
        }
      : null,
  };

  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
}

export async function restoreInterviewState(): Promise<void> {
  if (!existsSync(SNAPSHOT_PATH)) {
    return;
  }

  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
  const supabase = createE2ESupabase();

  await resetInterviewForE2EUser();

  if (!snapshot.session) {
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("neuramark_interview_sessions")
    .insert({
      client_id: E2E_CLIENT_ID,
      status: snapshot.session.status,
      current_step: snapshot.session.current_step,
      answers: snapshot.session.answers,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted?.id) {
    throw new Error(
      `Interview snapshot restore failed: ${insertError?.message ?? "no row"}`,
    );
  }

  if (!snapshot.profile) {
    return;
  }

  const { error: profileError } = await supabase
    .from("neuramark_business_profiles")
    .insert({
      client_id: E2E_CLIENT_ID,
      source_interview_id: inserted.id,
      fields: snapshot.profile.fields,
      version: snapshot.profile.version,
    });

  if (profileError) {
    throw new Error(`Profile snapshot restore failed: ${profileError.message}`);
  }
}

export async function resetInterviewForE2EUser(): Promise<void> {
  const supabase = createE2ESupabase();
  const { error: profileError } = await supabase
    .from("neuramark_business_profiles")
    .delete()
    .eq("client_id", E2E_CLIENT_ID);

  if (profileError) {
    throw new Error(`E2E profile reset failed: ${profileError.message}`);
  }

  const { error: sessionError } = await supabase
    .from("neuramark_interview_sessions")
    .delete()
    .eq("client_id", E2E_CLIENT_ID);

  if (sessionError) {
    throw new Error(`E2E interview reset failed: ${sessionError.message}`);
  }
}

export async function seedInterviewAtRestrictions(options?: {
  includeRestrictions?: boolean;
}): Promise<void> {
  await resetInterviewForE2EUser();
  const supabase = createE2ESupabase();
  const answers = options?.includeRestrictions
    ? {
        ...INTERVIEW_FIXTURE,
        restrictions: { items: ["Never promise same-day arrival"] },
      }
    : { ...INTERVIEW_FIXTURE };

  const { error } = await supabase.from("neuramark_interview_sessions").insert({
    client_id: E2E_CLIENT_ID,
    status: "draft",
    current_step: "restrictions",
    answers,
  });

  if (error) {
    throw new Error(`E2E seed at restrictions failed: ${error.message}`);
  }
}

export async function seedCompletedProfile(): Promise<void> {
  await resetInterviewForE2EUser();
  const supabase = createE2ESupabase();
  const answers = {
    ...INTERVIEW_FIXTURE,
    restrictions: { items: ["Never promise same-day arrival"] },
  };

  const { data: session, error: sessionError } = await supabase
    .from("neuramark_interview_sessions")
    .insert({
      client_id: E2E_CLIENT_ID,
      status: "completed",
      current_step: "restrictions",
      answers,
    })
    .select("id")
    .maybeSingle();

  if (sessionError || !session?.id) {
    throw new Error(
      `E2E completed session seed failed: ${sessionError?.message ?? "no row"}`,
    );
  }

  const { error: profileError } = await supabase
    .from("neuramark_business_profiles")
    .insert({
      client_id: E2E_CLIENT_ID,
      source_interview_id: session.id,
      fields: answers,
      version: 1,
    });

  if (profileError) {
    throw new Error(`E2E profile seed failed: ${profileError.message}`);
  }
}

export async function getInterviewStatus(): Promise<{
  status: string | null;
  currentStep: string | null;
}> {
  const supabase = createE2ESupabase();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .select("status, current_step")
    .eq("client_id", E2E_CLIENT_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`E2E interview status read failed: ${error.message}`);
  }

  return {
    status: data ? String(data.status) : null,
    currentStep: data ? String(data.current_step) : null,
  };
}

export async function getProfileExists(): Promise<boolean> {
  const supabase = createE2ESupabase();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .select("id")
    .eq("client_id", E2E_CLIENT_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`E2E profile read failed: ${error.message}`);
  }

  return Boolean(data?.id);
}
