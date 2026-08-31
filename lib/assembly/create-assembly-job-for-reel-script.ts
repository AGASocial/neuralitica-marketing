import "server-only";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
  assembleReelForScriptRequestSchema,
  type AssembleReelForScriptResult,
} from "@/lib/contracts/assembly-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { loadReelScriptForVideoJob } from "@/lib/video-jobs/load-reel-script-for-video-job";

import { computeAssemblyInputFingerprint } from "./compute-input-fingerprint";
import { enqueueAssemblyJob } from "./enqueue-assembly-job";
import {
  assemblyJobForbiddenError,
  assemblyJobForbiddenFieldsError,
  assemblyJobInternalError,
  assemblyJobNotFoundError,
  assemblyJobUnauthenticatedError,
  assemblyInputsIncompleteError,
  assemblyJobMutationError,
} from "./errors";
import { findForbiddenAssemblyKeys } from "./find-forbidden-assembly-keys";
import { ASSEMBLY_JOBS_TABLE, mapAssemblyJobRow } from "./assembly-job-row";
import { resolveAssemblyInputs } from "./resolve-assembly-inputs";

async function loadScriptUpdatedAt(params: {
  reelScriptId: string;
  clientId: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("updated_at")
    .eq("id", params.reelScriptId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data || typeof (data as { updated_at?: unknown }).updated_at !== "string") {
    return null;
  }

  return (data as { updated_at: string }).updated_at;
}

async function findIdempotentAssemblyJob(params: {
  clientId: string;
  reelScriptId: string;
  scriptUpdatedAt: string;
  inputFingerprint: string;
}): Promise<ReturnType<typeof mapAssemblyJobRow>> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select("*")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("script_updated_at", params.scriptUpdatedAt)
    .eq("input_fingerprint", params.inputFingerprint)
    .order("created_at", { ascending: false });

  if (error || !data?.length) {
    return null;
  }

  for (const raw of data) {
    const row = mapAssemblyJobRow(raw as Record<string, unknown>);
    if (!row) {
      continue;
    }
    if (row.status === "completed") {
      return row;
    }
    if (row.status === "queued" || row.status === "processing") {
      return row;
    }
  }

  return null;
}

export type CreateAssemblyJobForReelScriptResult = AssembleReelForScriptResult;

export type CreateAssemblyJobTrustedParams = {
  clientId: string;
  reelScriptId: string;
  invokedBy: "operator" | "revision";
};

/**
 * Trusted server-only assembly enqueue (Operator or revision router).
 */
export async function createAssemblyJobForClientTrusted(
  params: CreateAssemblyJobTrustedParams,
): Promise<CreateAssemblyJobForReelScriptResult> {
  try {
    const { reelScriptId, clientId } = params;

    const script = await loadReelScriptForVideoJob({
      reelScriptId,
      clientId,
    });
    if (!script) {
      return assemblyJobNotFoundError();
    }

    const scriptUpdatedAt = await loadScriptUpdatedAt({
      reelScriptId,
      clientId,
    });
    if (!scriptUpdatedAt) {
      return assemblyJobNotFoundError();
    }

    const inputs = await resolveAssemblyInputs({
      clientId,
      reelScriptId,
      modalidad: script.modalidad,
      targetDurationSec: script.package.targetDurationSec,
      coldOpenNotes: script.package.coldOpenNotes ?? null,
    });
    if (!inputs.ok) {
      return assemblyInputsIncompleteError(inputs.messageKey);
    }

    const inputFingerprint = computeAssemblyInputFingerprint({
      primaryVideoAssetId: inputs.primaryVideoAssetId,
      voiceoverAssetId: inputs.voiceoverAssetId,
      templateId: ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
      orderedBrollAssetIds: inputs.brollAssetIds,
      pathTag: inputs.pathTag,
    });

    const existing = await findIdempotentAssemblyJob({
      clientId,
      reelScriptId,
      scriptUpdatedAt,
      inputFingerprint,
    });

    if (existing?.status === "completed") {
      return {
        ok: true,
        jobId: existing.id,
        status: "completed",
        idempotent: true,
        outputMediaAssetId: existing.outputMediaAssetId ?? undefined,
      };
    }

    if (
      existing &&
      (existing.status === "queued" || existing.status === "processing")
    ) {
      return {
        ok: true,
        jobId: existing.id,
        status: existing.status,
        idempotent: true,
        inFlight: true,
      };
    }

    if (!isSupabaseConfigured()) {
      return assemblyJobInternalError();
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from(ASSEMBLY_JOBS_TABLE)
      .insert({
        client_id: clientId,
        reel_script_id: reelScriptId,
        template_id: ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
        status: "queued",
        primary_video_asset_id: inputs.primaryVideoAssetId,
        voiceover_asset_id: inputs.voiceoverAssetId,
        broll_asset_ids:
          inputs.pathTag === "broll_stitch" ? inputs.brollAssetIds : null,
        assembly_path_tag: inputs.pathTag,
        script_updated_at: scriptUpdatedAt,
        input_fingerprint: inputFingerprint,
        target_duration_sec: script.package.targetDurationSec,
      })
      .select("id")
      .single();

    if (error || !data || typeof (data as { id?: unknown }).id !== "string") {
      if (error?.code === "23505") {
        const raced = await findIdempotentAssemblyJob({
          clientId,
          reelScriptId,
          scriptUpdatedAt,
          inputFingerprint,
        });
        if (raced?.status === "completed") {
          return {
            ok: true,
            jobId: raced.id,
            status: "completed",
            idempotent: true,
            outputMediaAssetId: raced.outputMediaAssetId ?? undefined,
          };
        }
      }
      return assemblyJobInternalError();
    }

    const jobId = (data as { id: string }).id;
    enqueueAssemblyJob(jobId);

    console.info("[assembly] revision enqueue", {
      jobId,
      reelScriptId,
      clientId,
      invokedBy: params.invokedBy,
    });

    return {
      ok: true,
      jobId,
      status: "queued",
      idempotent: false,
    };
  } catch (error) {
    console.error("[assembly] trusted create job unexpected error");
    return assemblyJobInternalError();
  }
}

/**
 * Assembly orchestrator (US-9.1). Operator-only; pointer input `{ reelScriptId }`.
 */
export async function createAssemblyJobForReelScript(
  rawInput: unknown,
): Promise<CreateAssemblyJobForReelScriptResult> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return error.status === 401
          ? assemblyJobUnauthenticatedError()
          : assemblyJobForbiddenError();
      }
      throw error;
    }

    if (findForbiddenAssemblyKeys(rawInput).length > 0) {
      return assemblyJobForbiddenFieldsError();
    }

    const parsed = assembleReelForScriptRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return assemblyJobMutationError("VALIDATION_ERROR");
    }

    return createAssemblyJobForClientTrusted({
      clientId: operator.id,
      reelScriptId: parsed.data.reelScriptId,
      invokedBy: "operator",
    });
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? assemblyJobUnauthenticatedError()
        : assemblyJobForbiddenError();
    }
    console.error("[assembly] create job unexpected error");
    return assemblyJobInternalError();
  }
}
