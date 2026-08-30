import "server-only";

/**
 * QA gate helper for US-11.1 (US-10.2 readiness with override coverage).
 * Reads DB only — never accepts client passed/ready flags.
 */

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  computeQaGateReady,
  computeUncoveredFailedOverridableKeys,
} from "@/lib/contracts/qa-override";
import type { QaCheckResult, QaGateStatus } from "@/lib/contracts/qa-report";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import {
  isBlockingCheckKey,
  isOverridableCheckKey,
} from "@/lib/qa/check-catalog";
import {
  distinctOverriddenCheckKeys,
  loadQaOverridesForReport,
} from "@/lib/qa/persist-qa-override";
import { loadQaReportForAssembledReel } from "@/lib/qa/persist-qa-report";

function notReady(partial?: Partial<QaGateStatus>): QaGateStatus {
  return {
    ready: false,
    status: null,
    hasBlockingFailures: false,
    hasOverridableFailures: false,
    qaReportId: null,
    overriddenCheckKeys: [],
    uncoveredFailedCheckKeys: [],
    ...partial,
  };
}

/**
 * Catalog-preferred failure flags (severity from check-catalog, not body).
 */
function catalogFailureFlags(checks: readonly QaCheckResult[]): {
  hasBlockingFailures: boolean;
  hasOverridableFailures: boolean;
} {
  let hasBlockingFailures = false;
  let hasOverridableFailures = false;
  for (const check of checks) {
    if (check.status !== "fail") continue;
    if (isBlockingCheckKey(check.checkKey)) {
      hasBlockingFailures = true;
    } else if (isOverridableCheckKey(check.checkKey)) {
      hasOverridableFailures = true;
    }
  }
  return { hasBlockingFailures, hasOverridableFailures };
}

/**
 * Checks with catalog severity for gate coverage (prefer catalog over stored).
 */
function checksWithCatalogSeverity(
  checks: readonly QaCheckResult[],
): QaCheckResult[] {
  return checks.map((check) => {
    if (isBlockingCheckKey(check.checkKey)) {
      return { ...check, severity: "blocking" as const };
    }
    if (isOverridableCheckKey(check.checkKey)) {
      return { ...check, severity: "overridable" as const };
    }
    return check;
  });
}

/**
 * Ready iff:
 *   (a) status === "passed"
 *   OR
 *   (b) status === "failed" && !blocking fails && every failed overridable key
 *       has ≥1 neuramark_qa_overrides row
 *
 * blocked | pending | running | missing → not ready.
 * NEVER honors caller-supplied passed / ready / override flags.
 */
export async function getQaGateStatusForAssembledReel(
  assembledReelId: string,
): Promise<QaGateStatus> {
  if (
    typeof assembledReelId !== "string" ||
    assembledReelId.trim().length === 0
  ) {
    return notReady();
  }

  const user = await getCurrentUser();
  if (!user) {
    return notReady();
  }

  const assembly = await loadAssemblyJobScoped({
    jobId: assembledReelId,
    clientId: user.id,
  });
  if (!assembly) {
    return notReady();
  }

  const report = await loadQaReportForAssembledReel({
    assembledReelId,
    clientId: user.id,
  });
  if (!report) {
    return notReady();
  }

  const flags = catalogFailureFlags(report.checks);
  const overrideRows = await loadQaOverridesForReport({
    qaReportId: report.id,
    clientId: user.id,
  });
  const overriddenCheckKeys = distinctOverriddenCheckKeys(overrideRows);
  const catalogChecks = checksWithCatalogSeverity(report.checks);
  const uncoveredFailedCheckKeys = computeUncoveredFailedOverridableKeys({
    checks: catalogChecks,
    overriddenCheckKeys,
  });

  const ready = computeQaGateReady({
    status: report.status,
    checks: catalogChecks,
    overriddenCheckKeys,
    hasBlockingFailures: flags.hasBlockingFailures,
  });

  return {
    ready,
    status: report.status,
    hasBlockingFailures: flags.hasBlockingFailures,
    hasOverridableFailures: flags.hasOverridableFailures,
    qaReportId: report.id,
    overriddenCheckKeys,
    uncoveredFailedCheckKeys,
  };
}
