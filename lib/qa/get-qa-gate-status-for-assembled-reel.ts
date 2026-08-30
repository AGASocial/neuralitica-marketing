import "server-only";

/**
 * QA gate helper for US-11.1 (US-10.1 Phase A).
 * Reads DB only — never accepts client passed/ready flags.
 */

import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { QaGateStatus } from "@/lib/contracts/qa-report";
import { isQaReportReadyPhaseA } from "@/lib/contracts/qa-report";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import {
  loadQaReportForAssembledReel,
  qaFailureFlags,
} from "@/lib/qa/persist-qa-report";

function notReady(partial?: Partial<QaGateStatus>): QaGateStatus {
  return {
    ready: false,
    status: null,
    hasBlockingFailures: false,
    hasOverridableFailures: false,
    qaReportId: null,
    ...partial,
  };
}

/**
 * Phase A: ready === true iff report status === 'passed'.
 * Foreign / missing assembly → not ready (US-11.1 will 404 package).
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

  const flags = qaFailureFlags(report.checks);
  return {
    ready: isQaReportReadyPhaseA(report.status),
    status: report.status,
    hasBlockingFailures: flags.hasBlockingFailures,
    hasOverridableFailures: flags.hasOverridableFailures,
    qaReportId: report.id,
  };
}
