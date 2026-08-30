import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  mapVideoJobRow,
  VIDEO_JOB_SELECT_COLUMNS,
  VIDEO_JOBS_TABLE,
  type VideoJobRow,
} from "./video-job-row";

export async function loadVideoJobById(params: {
  jobId: string;
  clientId: string;
}): Promise<VideoJobRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select(VIDEO_JOB_SELECT_COLUMNS)
    .eq("id", params.jobId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapVideoJobRow(data as Record<string, unknown>);
}

/** Tenant-scoped load — foreign id returns null (404 at boundary). */
export async function loadVideoJobScoped(params: {
  jobId: string;
  clientId: string;
}): Promise<VideoJobRow | null> {
  return loadVideoJobById(params);
}

export async function loadVideoJobByIdUnscoped(
  jobId: string,
): Promise<VideoJobRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select(VIDEO_JOB_SELECT_COLUMNS)
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapVideoJobRow(data as Record<string, unknown>);
}
