import "server-only";

import type { OperatorAssemblyJobsByReelMap } from "@/lib/contracts/assembly-job";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  ASSEMBLY_JOB_SELECT_COLUMNS,
  ASSEMBLY_JOBS_TABLE,
  mapAssemblyJobRow,
} from "./assembly-job-row";
import { mapOperatorAssemblyJobDto } from "./map-operator-assembly-job-dto";

async function loadScriptContextByReel(params: {
  clientId: string;
  reelScriptIds: string[];
}): Promise<
  Map<string, { updatedAt: string; modalidad: VisualModality | null }>
> {
  const result = new Map<
    string,
    { updatedAt: string; modalidad: VisualModality | null }
  >();

  if (!isSupabaseConfigured() || params.reelScriptIds.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("id, updated_at, slot_index, strategy_id")
    .eq("client_id", params.clientId)
    .in("id", params.reelScriptIds);

  if (error || !data) {
    return result;
  }

  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.updated_at !== "string") {
      continue;
    }
    result.set(row.id, {
      updatedAt: row.updated_at,
      modalidad: null,
    });
  }

  return result;
}

export async function getAssemblyJobsForReelScripts(params: {
  clientId: string;
  reelScriptIds: string[];
  modalidadByReelScriptId?: Map<string, VisualModality>;
}): Promise<OperatorAssemblyJobsByReelMap> {
  const result: OperatorAssemblyJobsByReelMap = {};
  for (const reelScriptId of params.reelScriptIds) {
    result[reelScriptId] = null;
  }

  if (!isSupabaseConfigured() || params.reelScriptIds.length === 0) {
    return result;
  }

  const scriptContext = await loadScriptContextByReel(params);
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select(ASSEMBLY_JOB_SELECT_COLUMNS)
    .eq("client_id", params.clientId)
    .in("reel_script_id", params.reelScriptIds)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return result;
  }

  const latestByReel = new Map<string, ReturnType<typeof mapAssemblyJobRow>>();
  for (const raw of data) {
    const row = mapAssemblyJobRow(raw as Record<string, unknown>);
    if (!row) {
      continue;
    }
    if (!latestByReel.has(row.reelScriptId)) {
      latestByReel.set(row.reelScriptId, row);
    }
  }

  for (const [reelScriptId, job] of latestByReel) {
    if (!job) {
      continue;
    }
    const ctx = scriptContext.get(reelScriptId);
    const modalidad =
      params.modalidadByReelScriptId?.get(reelScriptId) ?? "faceless";

    result[reelScriptId] = await mapOperatorAssemblyJobDto(job, {
      clientId: params.clientId,
      modalidad,
      scriptUpdatedAt: ctx?.updatedAt ?? null,
    });
  }

  return result;
}
