import "server-only";

import {
  authGuardResponse,
  isAuthGuardError,
  requireOperator,
} from "@/lib/auth/require-user";
import { operatorAssemblyJobStatusDtoSchema } from "@/lib/contracts/assembly-job";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import { mapOperatorAssemblyJobStatusDto } from "@/lib/assembly/map-operator-assembly-job-dto";
import { loadReelScriptForVideoJob } from "@/lib/video-jobs/load-reel-script-for-video-job";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Operator-only assembly job status poll (US-9.1).
 * Frontend consumer: `/operator/scripts` expand row optional interval refresh.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  let operator;
  try {
    operator = await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardResponse(error);
    }
    throw error;
  }

  const { jobId } = await context.params;
  if (!jobId || !UUID_RE.test(jobId)) {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const job = await loadAssemblyJobScoped({
    jobId,
    clientId: operator.id,
  });

  if (!job) {
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const script = await loadReelScriptForVideoJob({
    reelScriptId: job.reelScriptId,
    clientId: operator.id,
  });

  const dto = await mapOperatorAssemblyJobStatusDto(job, {
    clientId: operator.id,
    modalidad: script?.modalidad ?? "faceless",
    scriptUpdatedAt: null,
  });
  const parsed = operatorAssemblyJobStatusDtoSchema.safeParse(dto);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new Response(JSON.stringify(parsed.data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
