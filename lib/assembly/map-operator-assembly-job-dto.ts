import "server-only";

import type { AssemblyConfig } from "@/lib/contracts/branding-job";
import type { OperatorAssemblyJobDto } from "@/lib/contracts/assembly-job";
import type { VisualModality } from "@/lib/contracts/visual-preferences";

import type { AssemblyJobRow } from "./assembly-job-row";
import { isTerminalAssemblyJobStatus } from "./assembly-job-row";
import { areAssemblyInputsComplete } from "./resolve-assembly-inputs";

function mapBrandingConfigForDto(
  config: AssemblyJobRow["brandingConfig"],
): AssemblyConfig | null {
  if (!config) {
    return null;
  }

  return {
    subtitlesEnabled: config.subtitlesEnabled,
    logoEnabled: config.logoEnabled,
    coverFrameSec: config.coverFrameSec,
  };
}

export async function mapOperatorAssemblyJobDto(
  job: AssemblyJobRow,
  options: {
    clientId: string;
    modalidad: VisualModality;
    scriptUpdatedAt: string | null;
  },
): Promise<OperatorAssemblyJobDto> {
  const assemblyInFlight = job.status === "queued" || job.status === "processing";
  const brandingInFlight =
    job.brandingStatus === "queued" || job.brandingStatus === "processing";
  const inputsComplete = await areAssemblyInputsComplete({
    clientId: options.clientId,
    reelScriptId: job.reelScriptId,
    modalidad: options.modalidad,
  });

  const scriptChangedSinceJob =
    options.scriptUpdatedAt !== null &&
    options.scriptUpdatedAt !== job.scriptUpdatedAt;

  const canReassemble =
    job.status === "failed" ||
    (isTerminalAssemblyJobStatus(job.status) && scriptChangedSinceJob) ||
    (job.status === "completed" && scriptChangedSinceJob);

  const canApplyBranding =
    job.status === "completed" &&
    !brandingInFlight &&
    (job.brandingStatus === null || job.brandingStatus === "failed");

  const canRebrand =
    job.status === "completed" &&
    !brandingInFlight &&
    (job.brandingStatus === "completed" || job.brandingStatus === "failed");

  const brandingFailureReason =
    job.brandingStatus === "failed" ? job.failureReason : null;

  return {
    jobId: job.id,
    reelScriptId: job.reelScriptId,
    status: job.status,
    templateId: job.templateId,
    targetDurationSec: job.targetDurationSec,
    actualDurationSec: job.actualDurationSec,
    outputMediaAssetId: job.outputMediaAssetId,
    failureReason: job.failureReason,
    brandingStatus: job.brandingStatus,
    brandingConfig: mapBrandingConfigForDto(job.brandingConfig),
    coverMediaAssetId: job.coverMediaAssetId,
    preBrandingOutputMediaAssetId: job.preBrandingOutputMediaAssetId,
    brandingFailureReason,
    canApplyBranding,
    canRebrand,
    canAssemble: inputsComplete && !assemblyInFlight,
    canReassemble,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function mapOperatorAssemblyJobStatusDto(
  job: AssemblyJobRow,
  options: {
    clientId: string;
    modalidad: VisualModality;
    scriptUpdatedAt: string | null;
  },
): Promise<Omit<OperatorAssemblyJobDto, "canAssemble">> {
  const dto = await mapOperatorAssemblyJobDto(job, options);
  const { canAssemble: _canAssemble, ...statusDto } = dto;
  return statusDto;
}
