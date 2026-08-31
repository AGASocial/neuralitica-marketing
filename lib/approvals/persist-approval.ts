import "server-only";

import type {
  ApprovalDecision,
  ApprovalStatus,
} from "@/lib/contracts/approval";
import { approvalStatusSchema } from "@/lib/contracts/approval";
import type {
  ChangeRequestAuditEntry,
  ChangeRequestInput,
} from "@/lib/contracts/approval-revision";
import { getMaxRevisionRounds } from "@/lib/approvals/get-max-revision-rounds";
import {
  findClientRevisionRound,
  parseChangeRequests,
  withRoutingCompletedAt,
  withRoutingStartedAt,
} from "@/lib/approvals/parse-change-requests";
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
  revisionCount: number;
  changeRequests: ChangeRequestAuditEntry[];
  extraRevisionGranted: boolean;
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

  const revisionCount =
    typeof raw.revision_count === "number" ? raw.revision_count : 0;
  const extraRevisionGranted =
    typeof raw.extra_revision_granted === "boolean"
      ? raw.extra_revision_granted
      : false;

  return {
    id: raw.id,
    clientId: raw.client_id,
    assembledReelId: raw.assembled_reel_id,
    status: statusParsed.data,
    clientFeedback:
      typeof raw.client_feedback === "string" ? raw.client_feedback : null,
    decidedAt: typeof raw.decided_at === "string" ? raw.decided_at : null,
    decidedBy: typeof raw.decided_by === "string" ? raw.decided_by : null,
    revisionCount,
    changeRequests: parseChangeRequests(raw.change_requests),
    extraRevisionGranted,
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

/** US-11.3 — approved-only list for ready-to-publish; decided_at DESC. */
export async function listApprovedApprovalsForClient(params: {
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
    .eq("status", "approved")
    .order("decided_at", { ascending: false });

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
 * US-11.3 — Cliente attachment guard: approved approval links asset as output.
 */
export async function hasApprovedApprovalForOutputAsset(params: {
  clientId: string;
  assetId: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { data: approvals, error } = await supabase
    .from(APPROVALS_TABLE)
    .select("assembled_reel_id")
    .eq("client_id", params.clientId)
    .eq("status", "approved");

  if (error || !approvals?.length) {
    return false;
  }

  const reelIds = approvals
    .map((row) => (row as { assembled_reel_id?: unknown }).assembled_reel_id)
    .filter((id): id is string => typeof id === "string");

  if (reelIds.length === 0) {
    return false;
  }

  const { data: reels, error: reelError } = await supabase
    .from("neuramark_assembled_reels")
    .select("id")
    .eq("client_id", params.clientId)
    .eq("output_media_asset_id", params.assetId)
    .in("id", reelIds)
    .limit(1);

  return !reelError && (reels?.length ?? 0) > 0;
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
  decision: Extract<ApprovalDecision, "approved" | "rejected">;
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

/**
 * Atomic request_changes persist (US-11.2).
 * Single conditional UPDATE — never read-then-write revision limit.
 */
export async function updateApprovalRequestChanges(params: {
  approvalId: string;
  clientId: string;
  decidedBy: string;
  changeRequest: ChangeRequestInput;
  summary: string | null;
}): Promise<ApprovalRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const maxRounds = getMaxRevisionRounds();
  const decidedAt = new Date().toISOString();

  const newRound = {
    kind: "client_revision" as const,
    tags: params.changeRequest.tags,
    ...(params.changeRequest.notesByTag
      ? { notesByTag: params.changeRequest.notesByTag }
      : {}),
    ...(params.changeRequest.summary
      ? { summary: params.changeRequest.summary }
      : {}),
    decidedAt,
    decidedBy: params.decidedBy,
  };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "neuramark_update_approval_request_changes",
    {
      p_approval_id: params.approvalId,
      p_client_id: params.clientId,
      p_max_rounds: maxRounds,
      p_new_round: newRound,
      p_summary: params.summary,
      p_decided_by: params.decidedBy,
    },
  );

  if (error) {
    console.error("[approvals] request_changes rpc failed", {
      code: error.code,
      approvalId: params.approvalId,
    });
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  return mapApprovalRow(row as Record<string, unknown>);
}

export async function isRevisionLimitExhausted(
  approval: ApprovalRow,
): Promise<boolean> {
  const maxRounds = getMaxRevisionRounds();
  return (
    approval.revisionCount >= maxRounds && !approval.extraRevisionGranted
  );
}

/** Operator grant — sets extra_revision_granted + audit append. */
export async function grantExtraRevision(params: {
  approvalId: string;
  clientId: string;
  grantedBy: string;
  reason: string;
}): Promise<ApprovalRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const grantEntry = {
    kind: "operator_grant" as const,
    grantedAt: new Date().toISOString(),
    grantedBy: params.grantedBy,
    reason: params.reason,
  };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("neuramark_grant_extra_revision", {
    p_approval_id: params.approvalId,
    p_client_id: params.clientId,
    p_grant_entry: grantEntry,
  });

  if (error) {
    console.error("[approvals] grant extra revision rpc failed", {
      code: error.code,
      approvalId: params.approvalId,
    });
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  return mapApprovalRow(row as Record<string, unknown>);
}

/** Sets routingStartedAt on the matching client_revision round entry. */
export async function markRevisionRoutingStarted(params: {
  approvalId: string;
  clientId: string;
  round: number;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const approval = await loadApprovalByIdScoped({
    approvalId: params.approvalId,
    clientId: params.clientId,
  });
  if (!approval) {
    return;
  }

  const roundEntry = findClientRevisionRound(
    approval.changeRequests,
    params.round,
  );
  if (!roundEntry || roundEntry.routingStartedAt) {
    return;
  }

  const changeRequests = withRoutingStartedAt(
    approval.changeRequests,
    params.round,
    new Date().toISOString(),
  );

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(APPROVALS_TABLE)
    .update({ change_requests: changeRequests })
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId);

  if (error) {
    console.error("[approvals] markRevisionRoutingStarted failed", {
      code: error.code,
      approvalId: params.approvalId,
    });
  }
}

/** Sets routingCompletedAt on the matching client_revision round entry. */
export async function markRevisionRoutingCompleted(params: {
  approvalId: string;
  clientId: string;
  round: number;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const approval = await loadApprovalByIdScoped({
    approvalId: params.approvalId,
    clientId: params.clientId,
  });
  if (!approval) {
    return;
  }

  const roundEntry = findClientRevisionRound(
    approval.changeRequests,
    params.round,
  );
  if (!roundEntry) {
    return;
  }

  const changeRequests = withRoutingCompletedAt(
    approval.changeRequests,
    params.round,
    new Date().toISOString(),
  );

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(APPROVALS_TABLE)
    .update({ change_requests: changeRequests })
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId);

  if (error) {
    console.error("[approvals] markRevisionRoutingCompleted failed", {
      code: error.code,
      approvalId: params.approvalId,
    });
  }
}

/** Server-only requeue — changes_requested → pending_client. */
export async function requeueApprovalRow(params: {
  approvalId: string;
  clientId: string;
}): Promise<ApprovalRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "neuramark_requeue_approval_after_revision",
    {
      p_approval_id: params.approvalId,
      p_client_id: params.clientId,
    },
  );

  if (error) {
    console.error("[approvals] requeue rpc failed", {
      code: error.code,
      approvalId: params.approvalId,
    });
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return null;
  }

  return mapApprovalRow(row as Record<string, unknown>);
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
