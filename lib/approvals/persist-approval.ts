import "server-only";

import type {
  ApprovalDecision,
  ApprovalStatus,
} from "@/lib/contracts/approval";
import { approvalStatusSchema } from "@/lib/contracts/approval";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const APPROVALS_TABLE = "neuramark_approvals" as const;

export type ApprovalRow = {
  id: string;
  clientId: string;
  assembledReelId: string;
  status: ApprovalStatus;
  clientFeedback: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapApprovalRow(
  raw: Record<string, unknown>,
): ApprovalRow | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.client_id !== "string" ||
    typeof raw.assembled_reel_id !== "string" ||
    typeof raw.status !== "string" ||
    typeof raw.created_at !== "string" ||
    typeof raw.updated_at !== "string"
  ) {
    return null;
  }

  const statusParsed = approvalStatusSchema.safeParse(raw.status);
  if (!statusParsed.success) {
    return null;
  }

  return {
    id: raw.id,
    clientId: raw.client_id,
    assembledReelId: raw.assembled_reel_id,
    status: statusParsed.data,
    clientFeedback:
      typeof raw.client_feedback === "string" ? raw.client_feedback : null,
    decidedAt: typeof raw.decided_at === "string" ? raw.decided_at : null,
    decidedBy: typeof raw.decided_by === "string" ? raw.decided_by : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export async function loadApprovalByIdScoped(params: {
  approvalId: string;
  clientId: string;
}): Promise<ApprovalRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .select("*")
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapApprovalRow(data as Record<string, unknown>);
}

export async function loadApprovalByAssembledReelScoped(params: {
  assembledReelId: string;
  clientId: string;
}): Promise<ApprovalRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .select("*")
    .eq("assembled_reel_id", params.assembledReelId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapApprovalRow(data as Record<string, unknown>);
}

export async function listPendingApprovalsForClient(params: {
  clientId: string;
}): Promise<ApprovalRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .select("*")
    .eq("client_id", params.clientId)
    .eq("status", "pending_client")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  const rows: ApprovalRow[] = [];
  for (const raw of data) {
    const mapped = mapApprovalRow(raw as Record<string, unknown>);
    if (mapped) {
      rows.push(mapped);
    }
  }
  return rows;
}

/**
 * INSERT pending_client only. client_id from session — never from body.
 */
export async function insertPendingApproval(params: {
  clientId: string;
  assembledReelId: string;
}): Promise<ApprovalRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .insert({
      client_id: params.clientId,
      assembled_reel_id: params.assembledReelId,
      status: "pending_client",
      client_feedback: null,
      decided_at: null,
      decided_by: null,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Unique race: another ensure won — load existing
    if (error?.code === "23505") {
      return loadApprovalByAssembledReelScoped({
        assembledReelId: params.assembledReelId,
        clientId: params.clientId,
      });
    }
    console.error("[approvals] insert failed", {
      code: error?.code,
      assembledReelId: params.assembledReelId,
    });
    return null;
  }

  return mapApprovalRow(data as Record<string, unknown>);
}

/**
 * UPDATE pending_client → approved | rejected only.
 * Returns null if no matching pending row (race / already decided).
 */
export async function updateApprovalDecision(params: {
  approvalId: string;
  clientId: string;
  decision: ApprovalDecision;
  decidedBy: string;
  clientFeedback: string | null;
}): Promise<ApprovalRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const decidedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .update({
      status: params.decision,
      decided_at: decidedAt,
      decided_by: params.decidedBy,
      client_feedback:
        params.decision === "approved" ? null : params.clientFeedback,
    })
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId)
    .eq("status", "pending_client")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[approvals] decide update failed", {
      code: error.code,
      approvalId: params.approvalId,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return mapApprovalRow(data as Record<string, unknown>);
}

/** Candidate assemblies for batch-ensure (branding completed + branded output). */
export async function listBrandCompletedAssemblyIdsForClient(params: {
  clientId: string;
}): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_assembled_reels")
    .select("id")
    .eq("client_id", params.clientId)
    .eq("status", "completed")
    .eq("branding_status", "completed")
    .not("output_media_asset_id", "is", null)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");
}
