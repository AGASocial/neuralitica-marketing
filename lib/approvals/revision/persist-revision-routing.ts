import "server-only";

import {
  changeRequestAuditEntrySchema,
  type ChangeRequestClientRound,
  computeRevisionRoutingPlan,
  type RevisionRoutingPlan,
} from "@/lib/contracts/approval-revision";
import type { ApprovalStatus } from "@/lib/contracts/approval";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { APPROVALS_TABLE } from "@/lib/approvals/persist-approval";

export type ApprovalRevisionRow = {
  id: string;
  clientId: string;
  assembledReelId: string;
  status: ApprovalStatus;
  revisionCount: number;
  changeRequests: ChangeRequestClientRound[];
};

function parseChangeRequests(raw: unknown): ChangeRequestClientRound[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const rounds: ChangeRequestClientRound[] = [];
  for (const entry of raw) {
    const parsed = changeRequestAuditEntrySchema.safeParse(entry);
    if (parsed.success && parsed.data.kind === "client_revision") {
      rounds.push(parsed.data);
    }
  }
  return rounds;
}

export function mapApprovalRevisionRow(
  raw: Record<string, unknown>,
): ApprovalRevisionRow | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.client_id !== "string" ||
    typeof raw.assembled_reel_id !== "string" ||
    typeof raw.status !== "string"
  ) {
    return null;
  }

  const revisionCount =
    typeof raw.revision_count === "number" ? raw.revision_count : 0;

  return {
    id: raw.id,
    clientId: raw.client_id,
    assembledReelId: raw.assembled_reel_id,
    status: raw.status as ApprovalStatus,
    revisionCount,
    changeRequests: parseChangeRequests(raw.change_requests),
  };
}

export async function loadApprovalRevisionByIdScoped(params: {
  approvalId: string;
  clientId: string;
}): Promise<ApprovalRevisionRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .select(
      "id, client_id, assembled_reel_id, status, revision_count, change_requests",
    )
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapApprovalRevisionRow(data as Record<string, unknown>);
}

export async function loadActiveRevisionForAssembledReel(params: {
  assembledReelId: string;
  clientId: string;
}): Promise<(ApprovalRevisionRow & { round: number; routingPlan: RevisionRoutingPlan }) | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .select(
      "id, client_id, assembled_reel_id, status, revision_count, change_requests",
    )
    .eq("assembled_reel_id", params.assembledReelId)
    .eq("client_id", params.clientId)
    .eq("status", "changes_requested")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = mapApprovalRevisionRow(data as Record<string, unknown>);
  if (!row) {
    return null;
  }

  const activeRound = row.changeRequests.find(
    (entry) => entry.round === row.revisionCount,
  );
  if (!activeRound) {
    return null;
  }

  return {
    ...row,
    round: activeRound.round,
    routingPlan: computeRevisionRoutingPlan(activeRound.tags),
  };
}

export function findClientRevisionRound(
  row: ApprovalRevisionRow,
  round: number,
): ChangeRequestClientRound | null {
  return row.changeRequests.find((entry) => entry.round === round) ?? null;
}

/**
 * Idempotency guard — first router call sets routingStartedAt on the round entry.
 * Returns false when the same { approvalId, round } was already marked started.
 */
export async function tryMarkRevisionRoutingStarted(params: {
  approvalId: string;
  clientId: string;
  round: number;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const row = await loadApprovalRevisionByIdScoped({
    approvalId: params.approvalId,
    clientId: params.clientId,
  });
  if (!row || row.status !== "changes_requested") {
    return false;
  }

  const roundEntry = findClientRevisionRound(row, params.round);
  if (!roundEntry) {
    return false;
  }

  if (roundEntry.routingStartedAt) {
    return false;
  }

  const startedAt = new Date().toISOString();
  const updatedRequests = row.changeRequests.map((entry) =>
    entry.round === params.round
      ? { ...entry, routingStartedAt: startedAt }
      : entry,
  );

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(APPROVALS_TABLE)
    .update({ change_requests: updatedRequests })
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId)
    .eq("status", "changes_requested");

  if (error) {
    const reread = await loadApprovalRevisionByIdScoped({
      approvalId: params.approvalId,
      clientId: params.clientId,
    });
    const rereadRound = reread
      ? findClientRevisionRound(reread, params.round)
      : null;
    return Boolean(rereadRound?.routingStartedAt);
  }

  return true;
}

export async function markRevisionRoutingCompleted(params: {
  approvalId: string;
  clientId: string;
  round: number;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const row = await loadApprovalRevisionByIdScoped({
    approvalId: params.approvalId,
    clientId: params.clientId,
  });
  if (!row) {
    return;
  }

  const completedAt = new Date().toISOString();
  const updatedRequests = row.changeRequests.map((entry) =>
    entry.round === params.round
      ? { ...entry, routingCompletedAt: completedAt }
      : entry,
  );

  const supabase = createServerSupabaseClient();
  await supabase
    .from(APPROVALS_TABLE)
    .update({ change_requests: updatedRequests })
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId);
}

export async function requeueApprovalStatusToPendingClient(params: {
  approvalId: string;
  clientId: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .update({
      status: "pending_client",
      decided_at: null,
      decided_by: null,
    })
    .eq("id", params.approvalId)
    .eq("client_id", params.clientId)
    .eq("status", "changes_requested")
    .select("id")
    .maybeSingle();

  return !error && Boolean(data);
}
