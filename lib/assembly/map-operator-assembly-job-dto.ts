import "server-only";

import type { OperatorAssemblyJobDto } from "@/lib/contracts/assembly-job";
import type { VisualModality } from "@/lib/contracts/visual-preferences";

import type { AssemblyJobRow } from "./assembly-job-row";
import { isTerminalAssemblyJobStatus } from "./assembly-job-row";
import { areAssemblyInputsComplete } from "./resolve-assembly-inputs";

export async function mapOperatorAssemblyJobDto(
  job: AssemblyJobRow,
  options: {
    clientId: string;
    modalidad: VisualModality;
    scriptUpdatedAt: string | null;
  },
): Promise<OperatorAssemblyJobDto> {
  const inFlight = job.status === "queued" || job.status === "processing";
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

  return {
    jobId: job.id,
    reelScriptId: job.reelScriptId,
    status: job.status,
    templateId: job.templateId,
    targetDurationSec: job.targetDurationSec,
    actualDurationSec: job.actualDurationSec,
    outputMediaAssetId: job.outputMediaAssetId,
    failureReason: job.failureReason,
    canAssemble: inputsComplete && !inFlight,
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
