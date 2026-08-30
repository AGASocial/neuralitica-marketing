import "server-only";

/**
 * QA override orchestration (US-10.2).
 * Closed write surface for neuramark_qa_overrides — INSERT only.
 * Never UPDATE neuramark_qa_reports.status / checks.
 */

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  overrideQaCheckInputSchema,
  type OverrideQaCheckResult,
} from "@/lib/contracts/qa-override";
import {
  isBlockingCheckKey,
  isOverridableCheckKey,
} from "@/lib/qa/check-catalog";
import {
  checkQaOverrideRateLimit,
  recordQaOverrideAttempt,
} from "@/lib/qa/check-qa-override-rate-limit";
import { findForbiddenQaOverrideKeys } from "@/lib/qa/find-forbidden-qa-override-keys";
import {
  qaOverrideCheckBlockingError,
  qaOverrideCheckNotFailedError,
  qaOverrideForbiddenFieldsError,
  qaOverrideInternalError,
  qaOverrideNotFoundError,
  qaOverrideRateLimitedError,
  qaOverrideValidationError,
} from "@/lib/qa/override-errors";
import {
  insertQaOverride,
  loadQaOverridesForReport,
  toOperatorQaOverrideDtos,
} from "@/lib/qa/persist-qa-override";
import {
  loadQaReportById,
  toOperatorQaReportDetailDto,
} from "@/lib/qa/persist-qa-report";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

export type OverrideQaCheckForClientParams = {
  rawInput: unknown;
  operator: CurrentUser;
};

export async function overrideQaCheckForClient(
  params: OverrideQaCheckForClientParams,
): Promise<OverrideQaCheckResult> {
  const forbiddenKeys = findForbiddenQaOverrideKeys(params.rawInput);
  if (forbiddenKeys.length > 0) {
    const fields: Record<string, string[]> = {};
    for (const key of forbiddenKeys) {
      fields[key] = ["FORBIDDEN"];
    }
    return qaOverrideForbiddenFieldsError(fields);
  }

  const parsed = overrideQaCheckInputSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return qaOverrideValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  const { qaReportId, checkKey, reason } = parsed.data;
  const clientId = params.operator.id;

  const rateCheck = await checkQaOverrideRateLimit({ clientId });
  if (!rateCheck.ok) {
    return qaOverrideRateLimitedError();
  }

  const report = await loadQaReportById({ qaReportId, clientId });
  if (!report) {
    return qaOverrideNotFoundError();
  }

  if (isBlockingCheckKey(checkKey)) {
    return qaOverrideCheckBlockingError();
  }

  const target = report.checks.find((c) => c.checkKey === checkKey);
  if (
    !target ||
    target.status !== "fail" ||
    !isOverridableCheckKey(checkKey)
  ) {
    return qaOverrideCheckNotFailedError();
  }

  const inserted = await insertQaOverride({
    clientId: report.clientId,
    qaReportId: report.id,
    assembledReelId: report.assembledReelId,
    checkKey,
    reason,
    operatorClientId: params.operator.id,
  });

  if (!inserted) {
    return qaOverrideInternalError();
  }

  await recordQaOverrideAttempt({ clientId });

  const overrideRows = await loadQaOverridesForReport({
    qaReportId: report.id,
    clientId: report.clientId,
  });
  const overrides = await toOperatorQaOverrideDtos(overrideRows);

  // Prefer session display name for the just-inserted actor when join is sparse.
  const withDisplay = overrides.map((row) => {
    if (
      row.overrideId === inserted.id &&
      !row.operatorDisplayName &&
      params.operator.displayName
    ) {
      return {
        ...row,
        operatorDisplayName: params.operator.displayName,
      };
    }
    return row;
  });

  return {
    ok: true,
    qaReportId: report.id,
    assembledReelId: report.assembledReelId,
    checkKey,
    overrideId: inserted.id,
    status: report.status,
    overrides: withDisplay,
    report: toOperatorQaReportDetailDto(report, withDisplay),
  };
}
