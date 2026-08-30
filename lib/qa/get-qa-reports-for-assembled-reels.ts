import "server-only";

import type {
  OperatorQaReportDetailDto,
  OperatorQaReportsByAssembledReelMap,
} from "@/lib/contracts/qa-report";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  loadQaOverridesForReports,
  toOperatorQaOverrideDtos,
} from "@/lib/qa/persist-qa-override";
import {
  mapQaReportRow,
  toOperatorQaReportDetailDto,
  QA_REPORTS_TABLE,
} from "@/lib/qa/persist-qa-report";

/**
 * Batch-load QA detail DTOs for week Operator scripts payload (US-10.1 / US-10.2).
 * Attaches chronological overrides[] per report.
 */
export async function getQaReportsForAssembledReels(params: {
  clientId: string;
  assembledReelIds: string[];
}): Promise<OperatorQaReportsByAssembledReelMap> {
  const result: OperatorQaReportsByAssembledReelMap = {};
  for (const id of params.assembledReelIds) {
    result[id] = null;
  }

  if (!isSupabaseConfigured() || params.assembledReelIds.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(QA_REPORTS_TABLE)
    .select("*")
    .eq("client_id", params.clientId)
    .in("assembled_reel_id", params.assembledReelIds);

  if (error || !data) {
    return result;
  }

  const rows = [];
  for (const raw of data) {
    const row = mapQaReportRow(raw as Record<string, unknown>);
    if (row) rows.push(row);
  }

  const overridesByReport = await loadQaOverridesForReports({
    clientId: params.clientId,
    qaReportIds: rows.map((r) => r.id),
  });

  for (const row of rows) {
    const overrideRows = overridesByReport.get(row.id) ?? [];
    const overrides = await toOperatorQaOverrideDtos(overrideRows);
    const dto: OperatorQaReportDetailDto = toOperatorQaReportDetailDto(
      row,
      overrides,
    );
    result[row.assembledReelId] = dto;
  }

  return result;
}
