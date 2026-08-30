import "server-only";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import type {
  ApplyBrandingForAssemblyRequest,
  BrandingConfigSnapshot,
  CreateBrandingJobForAssemblyResult,
} from "@/lib/contracts/branding-job";
import {
  applyBrandingForAssemblyRequestSchema,
  assemblyConfigSchema,
  DEFAULT_ASSEMBLY_CONFIG,
} from "@/lib/contracts/branding-job";
import {
  markBrandingFailed,
  writeBrandingQueuedState,
} from "@/lib/branding/apply-branding-job-update";
import { computeBrandingFingerprint } from "@/lib/branding/compute-branding-fingerprint";
import { enqueueBrandingJob } from "@/lib/branding/enqueue-branding-job";
import {
  loadBrandingJobByIdUnscoped,
  loadScriptBrandingContext,
} from "@/lib/branding/load-branding-job";
import { resolveSubtitleBeats } from "@/lib/branding/resolve-subtitle-beats";
import { sanitizeSubtitleBeats } from "@/lib/branding/sanitize-subtitle-beats";
import type { BrandingJobRow } from "@/lib/branding/branding-job-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import {
  brandingBaseIncompleteError,
  brandingJobForbiddenError,
  brandingJobForbiddenFieldsError,
  brandingJobInternalError,
  brandingJobNotFoundError,
  brandingJobUnauthenticatedError,
  brandingValidationError,
  brandingSubtitleSanitizeFailedError,
} from "./branding-errors";
import { findForbiddenBrandingKeys } from "./find-forbidden-branding-keys";

async function loadAssemblyJobForBranding(params: {
  assemblyJobId: string;
  clientId: string;
}): Promise<BrandingJobRow | null> {
  const job = await loadBrandingJobByIdUnscoped(params.assemblyJobId);
  if (!job || job.clientId !== params.clientId || job.status !== "completed") {
    return null;
  }
  if (!job.outputMediaAssetId) {
    return null;
  }
  return job;
}

async function loadClientAssemblyDefaults(
  clientId: string,
): Promise<typeof DEFAULT_ASSEMBLY_CONFIG> {
  if (!isSupabaseConfigured()) {
    return DEFAULT_ASSEMBLY_CONFIG;
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("neuramark_business_profiles")
    .select("assembly_config")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!data || data.assembly_config == null) {
    return DEFAULT_ASSEMBLY_CONFIG;
  }

  const parsed = assemblyConfigSchema.safeParse(data.assembly_config);
  return parsed.success ? parsed.data : DEFAULT_ASSEMBLY_CONFIG;
}

function buildBrandingConfigSnapshot(params: {
  subtitlesEnabled: boolean;
  logoEnabled: boolean;
  coverFrameSec: number;
  sanitizedBeats: string[];
  subtitleSourceHash: string;
}): BrandingConfigSnapshot {
  return {
    subtitlesEnabled: params.subtitlesEnabled,
    logoEnabled: params.logoEnabled,
    coverFrameSec: params.coverFrameSec,
    subtitleBeatCount: params.sanitizedBeats.length,
    subtitleSourceHash: params.subtitleSourceHash,
  };
}

export async function createBrandingJobForAssembly(input: {
  assemblyJobId: string;
  subtitlesEnabled?: boolean;
  logoEnabled?: boolean;
  source: "auto_chain" | "operator_manual";
}): Promise<CreateBrandingJobForAssemblyResult> {
  try {
    let clientId: string;

    if (input.source === "operator_manual") {
      try {
        const operator = await requireOperator("handler");
        clientId = operator.id;
      } catch (error) {
        if (isAuthGuardError(error)) {
          return error.status === 401
            ? brandingJobUnauthenticatedError()
            : brandingJobForbiddenError();
        }
        throw error;
      }
    } else {
      const unscoped = await loadBrandingJobByIdUnscoped(input.assemblyJobId);
      if (!unscoped) {
        return brandingJobNotFoundError();
      }
      clientId = unscoped.clientId;
    }

    const job = await loadAssemblyJobForBranding({
      assemblyJobId: input.assemblyJobId,
      clientId,
    });
    if (!job) {
      return brandingJobNotFoundError();
    }

    const script = await loadScriptBrandingContext({
      clientId,
      reelScriptId: job.reelScriptId,
    });
    if (!script) {
      return brandingBaseIncompleteError();
    }

    const defaults = await loadClientAssemblyDefaults(clientId);
    const subtitlesEnabled =
      input.subtitlesEnabled ?? defaults.subtitlesEnabled;
    const logoEnabled = input.logoEnabled ?? defaults.logoEnabled;
    const coverFrameSec = defaults.coverFrameSec;

    const beats = resolveSubtitleBeats(script.onScreenText);
    const sanitized = sanitizeSubtitleBeats(beats);
    if (!sanitized.ok) {
      if (input.source === "auto_chain") {
        await markBrandingFailed({
          assemblyJobId: job.id,
          failureReason: sanitized.messageKey,
        });
      }
      return brandingSubtitleSanitizeFailedError();
    }

    const effectiveSubtitlesEnabled =
      subtitlesEnabled && sanitized.sanitizedBeats.length > 0;

    const brandingConfig = buildBrandingConfigSnapshot({
      subtitlesEnabled: effectiveSubtitlesEnabled,
      logoEnabled,
      coverFrameSec,
      sanitizedBeats: sanitized.sanitizedBeats,
      subtitleSourceHash: sanitized.subtitleSourceHash,
    });

    const preBrandingOutputMediaAssetId = job.outputMediaAssetId!;
    const brandingFingerprint = computeBrandingFingerprint({
      preBrandingOutputMediaAssetId,
      brandingConfig,
      subtitleSourceHash: sanitized.subtitleSourceHash,
    });

    if (
      job.brandingStatus === "completed" &&
      job.brandingFingerprint === brandingFingerprint
    ) {
      return {
        ok: true,
        assemblyJobId: job.id,
        brandingStatus: "completed",
        idempotent: true,
        outputMediaAssetId: job.outputMediaAssetId ?? undefined,
        coverMediaAssetId: job.coverMediaAssetId ?? undefined,
      };
    }

    if (
      job.brandingStatus === "queued" ||
      job.brandingStatus === "processing"
    ) {
      return {
        ok: true,
        assemblyJobId: job.id,
        brandingStatus: job.brandingStatus,
        idempotent: true,
        inFlight: true,
      };
    }

    if (!isSupabaseConfigured()) {
      return brandingJobInternalError();
    }

    await writeBrandingQueuedState({
      assemblyJobId: job.id,
      brandingConfig,
      brandingFingerprint,
    });

    enqueueBrandingJob(job.id);

    return {
      ok: true,
      assemblyJobId: job.id,
      brandingStatus: "queued",
      idempotent: false,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? brandingJobUnauthenticatedError()
        : brandingJobForbiddenError();
    }
    console.error("[branding] create job unexpected error");
    return brandingJobInternalError();
  }
}

export async function applyBrandingForAssemblyInner(
  rawInput: unknown,
): Promise<CreateBrandingJobForAssemblyResult> {
  if (findForbiddenBrandingKeys(rawInput).length > 0) {
    return brandingJobForbiddenFieldsError();
  }

  const parsed = applyBrandingForAssemblyRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return brandingValidationError();
  }

  const request: ApplyBrandingForAssemblyRequest = parsed.data;

  return createBrandingJobForAssembly({
    assemblyJobId: request.assemblyJobId,
    subtitlesEnabled: request.subtitlesEnabled,
    logoEnabled: request.logoEnabled,
    source: "operator_manual",
  });
}
