import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  ASSEMBLY_JOB_SELECT_COLUMNS,
  ASSEMBLY_JOBS_TABLE,
  mapAssemblyJobRow,
  type AssemblyJobRow,
} from "./assembly-job-row";

export async function loadAssemblyJobScoped(params: {
  jobId: string;
  clientId: string;
}): Promise<AssemblyJobRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select(ASSEMBLY_JOB_SELECT_COLUMNS)
    .eq("id", params.jobId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapAssemblyJobRow(data as Record<string, unknown>);
}

export async function loadAssemblyJobByIdUnscoped(
  assemblyJobId: string,
): Promise<AssemblyJobRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select(ASSEMBLY_JOB_SELECT_COLUMNS)
    .eq("id", assemblyJobId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapAssemblyJobRow(data as Record<string, unknown>);
}
