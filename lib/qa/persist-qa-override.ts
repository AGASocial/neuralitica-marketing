import "server-only";

import type {
  OperatorQaOverrideDto,
  QaCheckKey,
} from "@/lib/contracts/qa-report";
import { qaCheckKeySchema } from "@/lib/contracts/qa-report";
import { loadClientDisplayName } from "@/lib/content-strategy/load-client-display-name";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const QA_OVERRIDES_TABLE = "neuramark_qa_overrides" as const;

export type QaOverrideRow = {
  id: string;
  clientId: string;
  qaReportId: string;
  assembledReelId: string;
  checkKey: QaCheckKey;
  reason: string;
  operatorClientId: string;
  createdAt: string;
};

export function mapQaOverrideRow(
  raw: Record<string, unknown>,
): QaOverrideRow | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.client_id !== "string" ||
    typeof raw.qa_report_id !== "string" ||
    typeof raw.assembled_reel_id !== "string" ||
    typeof raw.check_key !== "string" ||
    typeof raw.reason !== "string" ||
    typeof raw.operator_client_id !== "string" ||
    typeof raw.created_at !== "string"
  ) {
    return null;
  }

  const checkParsed = qaCheckKeySchema.safeParse(raw.check_key);
  if (!checkParsed.success) {
    return null;
  }

  return {
    id: raw.id,
    clientId: raw.client_id,
    qaReportId: raw.qa_report_id,
    assembledReelId: raw.assembled_reel_id,
    checkKey: checkParsed.data,
    reason: raw.reason,
    operatorClientId: raw.operator_client_id,
    createdAt: raw.created_at,
  };
}

export function toOperatorQaOverrideDto(
  row: QaOverrideRow,
  operatorDisplayName?: string,
): OperatorQaOverrideDto {
  const dto: OperatorQaOverrideDto = {
    overrideId: row.id,
    checkKey: row.checkKey,
    reason: row.reason,
    createdAt: row.createdAt,
  };
  if (operatorDisplayName && operatorDisplayName.length > 0) {
    dto.operatorDisplayName = operatorDisplayName;
  }
  return dto;
}

/**
 * INSERT-only. Never UPDATE/DELETE override rows.
 * Does not touch neuramark_qa_reports.
 */
export async function insertQaOverride(params: {
  clientId: string;
  qaReportId: string;
  assembledReelId: string;
  checkKey: QaCheckKey;
  reason: string;
  operatorClientId: string;
}): Promise<QaOverrideRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(QA_OVERRIDES_TABLE)
    .insert({
      client_id: params.clientId,
      qa_report_id: params.qaReportId,
      assembled_reel_id: params.assembledReelId,
      check_key: params.checkKey,
      reason: params.reason,
      operator_client_id: params.operatorClientId,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[qa-override] insert failed", {
      code: error?.code,
      qaReportId: params.qaReportId,
      checkKey: params.checkKey,
    });
    return null;
  }

  return mapQaOverrideRow(data as Record<string, unknown>);
}

export async function loadQaOverridesForReport(params: {
  qaReportId: string;
  clientId: string;
}): Promise<QaOverrideRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(QA_OVERRIDES_TABLE)
    .select("*")
    .eq("qa_report_id", params.qaReportId)
    .eq("client_id", params.clientId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  const rows: QaOverrideRow[] = [];
  for (const raw of data) {
    const row = mapQaOverrideRow(raw as Record<string, unknown>);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Batch-load overrides for many report ids (week Operator payload).
 * Returns map keyed by qa_report_id → chronological ASC rows.
 */
export async function loadQaOverridesForReports(params: {
  clientId: string;
  qaReportIds: string[];
}): Promise<Map<string, QaOverrideRow[]>> {
  const result = new Map<string, QaOverrideRow[]>();
  for (const id of params.qaReportIds) {
    result.set(id, []);
  }

  if (!isSupabaseConfigured() || params.qaReportIds.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(QA_OVERRIDES_TABLE)
    .select("*")
    .eq("client_id", params.clientId)
    .in("qa_report_id", params.qaReportIds)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return result;
  }

  for (const raw of data) {
    const row = mapQaOverrideRow(raw as Record<string, unknown>);
    if (!row) continue;
    const list = result.get(row.qaReportId) ?? [];
    list.push(row);
    result.set(row.qaReportId, list);
  }

  return result;
}

export async function toOperatorQaOverrideDtos(
  rows: readonly QaOverrideRow[],
): Promise<OperatorQaOverrideDto[]> {
  const nameCache = new Map<string, string | undefined>();

  const dtos: OperatorQaOverrideDto[] = [];
  for (const row of rows) {
    let displayName = nameCache.get(row.operatorClientId);
    if (!nameCache.has(row.operatorClientId)) {
      displayName =
        (await loadClientDisplayName(row.operatorClientId)) ?? undefined;
      nameCache.set(row.operatorClientId, displayName);
    }
    dtos.push(toOperatorQaOverrideDto(row, displayName));
  }
  return dtos;
}

/** Distinct check keys with ≥1 override row (gate informational). */
export function distinctOverriddenCheckKeys(
  rows: readonly QaOverrideRow[],
): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    keys.add(row.checkKey);
  }
  return [...keys];
}
