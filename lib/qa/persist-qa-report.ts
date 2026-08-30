import "server-only";

import type {
  OperatorQaReportDetailDto,
  QaCheckResult,
  QaReportStatus,
} from "@/lib/contracts/qa-report";
import { qaCheckResultSchema } from "@/lib/contracts/qa-report";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const QA_REPORTS_TABLE = "neuramark_qa_reports" as const;

export type QaReportRow = {
  id: string;
  clientId: string;
  assembledReelId: string;
  checks: QaCheckResult[];
  status: QaReportStatus;
  createdAt: string;
  updatedAt: string;
};

function parseChecks(raw: unknown): QaCheckResult[] {
  if (!Array.isArray(raw)) return [];
  const out: QaCheckResult[] = [];
  for (const item of raw) {
    const parsed = qaCheckResultSchema.safeParse(item);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}

export function mapQaReportRow(
  raw: Record<string, unknown>,
): QaReportRow | null {
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

  const status = raw.status as QaReportStatus;
  if (
    status !== "pending" &&
    status !== "running" &&
    status !== "passed" &&
    status !== "failed" &&
    status !== "blocked"
  ) {
    return null;
  }

  return {
    id: raw.id,
    clientId: raw.client_id,
    assembledReelId: raw.assembled_reel_id,
    checks: parseChecks(raw.checks),
    status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function toOperatorQaReportDetailDto(
  row: QaReportRow,
): OperatorQaReportDetailDto {
  return {
    qaReportId: row.id,
    assembledReelId: row.assembledReelId,
    status: row.status,
    checks: row.checks,
    // US-10.2 BUILD batch-loads ledger; empty until override attach ships.
    overrides: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function qaFailureFlags(checks: readonly QaCheckResult[]): {
  hasBlockingFailures: boolean;
  hasOverridableFailures: boolean;
} {
  let hasBlockingFailures = false;
  let hasOverridableFailures = false;
  for (const check of checks) {
    if (check.status !== "fail") continue;
    if (check.severity === "blocking") {
      hasBlockingFailures = true;
    } else {
      hasOverridableFailures = true;
    }
  }
  return { hasBlockingFailures, hasOverridableFailures };
}

export async function loadQaReportForAssembledReel(params: {
  assembledReelId: string;
  clientId: string;
}): Promise<QaReportRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(QA_REPORTS_TABLE)
    .select("*")
    .eq("assembled_reel_id", params.assembledReelId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapQaReportRow(data as Record<string, unknown>);
}

/**
 * Fail-closed: set status=running (clears prior passed immediately).
 */
export async function upsertQaReportRunning(params: {
  assembledReelId: string;
  clientId: string;
}): Promise<QaReportRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(QA_REPORTS_TABLE)
    .upsert(
      {
        client_id: params.clientId,
        assembled_reel_id: params.assembledReelId,
        checks: [],
        status: "running",
        updated_at: now,
      },
      { onConflict: "assembled_reel_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    console.error("[qa] upsert running failed", {
      code: error?.code,
      assembledReelId: params.assembledReelId,
    });
    return null;
  }

  return mapQaReportRow(data as Record<string, unknown>);
}

export async function upsertQaReportTerminal(params: {
  assembledReelId: string;
  clientId: string;
  checks: QaCheckResult[];
  status: "passed" | "failed" | "blocked";
}): Promise<QaReportRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(QA_REPORTS_TABLE)
    .upsert(
      {
        client_id: params.clientId,
        assembled_reel_id: params.assembledReelId,
        checks: params.checks,
        status: params.status,
        updated_at: now,
      },
      { onConflict: "assembled_reel_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    console.error("[qa] upsert terminal failed", {
      code: error?.code,
      assembledReelId: params.assembledReelId,
    });
    return null;
  }

  return mapQaReportRow(data as Record<string, unknown>);
}
