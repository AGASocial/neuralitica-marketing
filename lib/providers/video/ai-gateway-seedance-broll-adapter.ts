import "server-only";

import {
  AI_GATEWAY_ENV_KEY_NAME,
  AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS,
  AI_GATEWAY_SEEDANCE_BROLL_MODEL,
  AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY,
  AI_GATEWAY_SEEDANCE_UNIT_COST_CENTS_PER_CLIP,
  AI_GATEWAY_SEEDANCE_VIDEO_ASSET_ROLE,
  AI_GATEWAY_VIDEO_480P_9_16,
  AI_GATEWAY_VIDEO_DEFAULT_ASPECT_RATIO,
  clampAiGatewaySeedanceDurationSec,
} from "@/lib/contracts/ai-gateway-video";
import {
  costEstimateSchema,
  resolvedCreateVideoJobInputSchema,
  storedMediaAssetSchema,
  type CreateVideoJobInput,
  type ExternalJobId,
} from "@/lib/contracts/providers";
import { resolveMediaAssetUrlForProvider } from "@/lib/media/resolve-media-asset-url-for-provider";
import {
  uploadGeneratedVideoBuffer,
  type UploadGeneratedVideoArgs,
  type UploadGeneratedVideoResult,
} from "@/lib/media/upload-generated-video-buffer";
import {
  normalizeVideoJobStatusResult,
  parseCreateVideoJobResult,
  parseExternalJobId,
  ProviderAdapterError,
  sanitizeProviderErrorMessage,
} from "@/lib/providers/normalize-provider-response";
import type { VideoProviderAdapter } from "@/lib/providers/provider-adapters";
import { optionalDurationSecFromBuffer } from "@/lib/providers/video/optional-duration-sec-from-buffer";
import {
  createGatewayVideoModel,
  decodeGatewayVideoOperation,
  defaultGetVideoStatus,
  defaultStartVideo,
  encodeGatewayVideoOperation,
  materializeGatewayStatusVideo,
  requireAiGatewayApiKey,
  type CompletedVideoBytes,
  type GetVideoStatusFn,
  type GatewayStatusVideo,
  type StartVideoFn,
} from "@/lib/providers/video/ai-gateway-video-shared";

type JobContext = {
  clientId: string;
  reelScriptId: string;
};

export type CreateAiGatewaySeedanceBrollAdapterParams = {
  defaultEstimateCents: number;
  unitCostCentsPerClip?: number;
  envKeyName?: string;
  gatewayModel?: string;
  fallbackModels?: readonly string[];
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "image" | "portrait",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  startVideo?: StartVideoFn;
  getVideoStatus?: GetVideoStatusFn;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
};

function estimateCentsForInput(
  input: CreateVideoJobInput,
  unitCostCentsPerClip: number,
): number {
  const clipCount =
    typeof input.clipCount === "number" &&
    Number.isFinite(input.clipCount) &&
    input.clipCount > 0
      ? Math.min(Math.round(input.clipCount), 8)
      : 1;
  return unitCostCentsPerClip * clipCount;
}

function validateCreateJobInput(input: CreateVideoJobInput): void {
  resolvedCreateVideoJobInputSchema.parse(input);

  if (input.assetRole !== "broll") {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Seedance adapter only accepts assetRole broll",
    );
  }

  if (input.referenceVideoAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Seedance does not accept reference video loops",
    );
  }

  const prompt = input.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Server-authored prompt is required for Seedance B-roll",
    );
  }
}

export function createAiGatewaySeedanceBrollAdapter(
  params: CreateAiGatewaySeedanceBrollAdapterParams,
): VideoProviderAdapter {
  const {
    defaultEstimateCents,
    unitCostCentsPerClip = defaultEstimateCents ||
      AI_GATEWAY_SEEDANCE_UNIT_COST_CENTS_PER_CLIP,
    envKeyName = AI_GATEWAY_ENV_KEY_NAME,
    gatewayModel = AI_GATEWAY_SEEDANCE_BROLL_MODEL,
    fallbackModels = AI_GATEWAY_SEEDANCE_BROLL_FALLBACK_MODELS,
    resolveMediaAssetUrl,
    uploadGeneratedVideo = uploadGeneratedVideoBuffer,
    fetchImpl = fetch,
    startVideo = defaultStartVideo,
    getVideoStatus = defaultGetVideoStatus,
    initialJobContexts,
  } = params;

  const resolveAssetUrl =
    resolveMediaAssetUrl ??
    (async (
      assetId: string,
      clientId: string,
      kind: "image" | "portrait",
    ) => {
      void kind;
      return resolveMediaAssetUrlForProvider({
        assetId,
        clientId,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        ttlSec: 300,
      });
    });

  const jobContextByExternalId = new Map<ExternalJobId, JobContext>(
    initialJobContexts ?? [],
  );
  const completedBytesByExternalId = new Map<ExternalJobId, CompletedVideoBytes>();

  return {
    providerKey: AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY,
    videoAssetRole: AI_GATEWAY_SEEDANCE_VIDEO_ASSET_ROLE,

    async estimateCost(input: CreateVideoJobInput) {
      return costEstimateSchema.parse({
        estimatedCostCents: estimateCentsForInput(input, unitCostCentsPerClip),
        currency: "USD",
        providerKey: AI_GATEWAY_SEEDANCE_BROLL_PROVIDER_KEY,
      });
    },

    async createJob(input: CreateVideoJobInput) {
      validateCreateJobInput(input);
      const apiKey = requireAiGatewayApiKey(envKeyName);
      const duration = clampAiGatewaySeedanceDurationSec(input.targetDurationSec);
      const prompt = input.prompt!.trim();
      const stillAssetId =
        input.referenceImageAssetId ?? input.portraitAssetId ?? null;

      let imageUrl: string | undefined;
      if (stillAssetId) {
        imageUrl = await resolveAssetUrl(stillAssetId, input.clientId, "image");
      }

      const model = createGatewayVideoModel({ apiKey, modelId: gatewayModel });
      let startResult;
      try {
        startResult = await startVideo({
          model,
          prompt: imageUrl
            ? { image: imageUrl, text: prompt }
            : prompt,
          duration,
          aspectRatio: AI_GATEWAY_VIDEO_DEFAULT_ASPECT_RATIO,
          resolution: AI_GATEWAY_VIDEO_480P_9_16,
          generateAudio: false,
          providerOptions: {
            gateway: {
              models: [...fallbackModels],
            },
          },
        });
      } catch (error) {
        throw new ProviderAdapterError(
          "PROVIDER_REQUEST_FAILED",
          sanitizeProviderErrorMessage(
            error instanceof Error ? error.message : "Gateway video start failed",
          ),
        );
      }

      const externalJobId = parseExternalJobId(
        encodeGatewayVideoOperation(startResult.operation),
      );

      jobContextByExternalId.set(externalJobId, {
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
      });

      return parseCreateVideoJobResult({
        externalJobId,
        status: "queued",
        estimatedCostCents: estimateCentsForInput(input, unitCostCentsPerClip),
      });
    },

    async getJobStatus(externalJobId: ExternalJobId) {
      parseExternalJobId(externalJobId);
      const apiKey = requireAiGatewayApiKey(envKeyName);
      const operation = decodeGatewayVideoOperation(externalJobId);
      const model = createGatewayVideoModel({ apiKey, modelId: gatewayModel });

      let statusResult;
      try {
        statusResult = await getVideoStatus(model, { operation });
      } catch (error) {
        return normalizeVideoJobStatusResult({
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Gateway status failed",
        });
      }

      if (statusResult.status === "pending") {
        return normalizeVideoJobStatusResult({ status: "processing" });
      }

      if (statusResult.status === "error") {
        return normalizeVideoJobStatusResult({
          status: "failed",
          errorMessage: statusResult.error,
        });
      }

      const videos = statusResult.videos as GatewayStatusVideo[];
      const first = videos[0];
      if (!first) {
        return normalizeVideoJobStatusResult({
          status: "failed",
          errorMessage: "Provider output is not available",
        });
      }

      try {
        const bytes = await materializeGatewayStatusVideo(first, fetchImpl);
        completedBytesByExternalId.set(externalJobId, bytes);
      } catch (error) {
        return normalizeVideoJobStatusResult({
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Provider output missing",
        });
      }

      return normalizeVideoJobStatusResult({
        status: "completed",
        progressPercent: 100,
      });
    },

    async fetchAsset(
      externalJobId: ExternalJobId,
      _rawOutputUrl?: string,
      jobContext?: JobContext,
    ) {
      parseExternalJobId(externalJobId);

      const context =
        jobContext ?? jobContextByExternalId.get(externalJobId) ?? null;
      if (!context) {
        throw new ProviderAdapterError(
          "PROVIDER_JOB_CONTEXT_MISSING",
          "Job context is missing for asset download",
        );
      }

      let bytes = completedBytesByExternalId.get(externalJobId);
      if (!bytes) {
        const status = await this.getJobStatus(externalJobId);
        if (status.status !== "completed") {
          throw new ProviderAdapterError(
            "PROVIDER_OUTPUT_MISSING",
            status.sanitizedErrorMessage ?? "Provider output is not available",
          );
        }
        bytes = completedBytesByExternalId.get(externalJobId);
      }

      if (!bytes) {
        throw new ProviderAdapterError(
          "PROVIDER_OUTPUT_MISSING",
          "Provider output is not available",
        );
      }

      const uploaded = await uploadGeneratedVideo({
        clientId: context.clientId,
        reelScriptId: context.reelScriptId,
        buffer: bytes.buffer,
        mimeType: bytes.mimeType,
      });

      const durationSec = await optionalDurationSecFromBuffer(bytes.buffer);

      return storedMediaAssetSchema.parse({
        storageKey: uploaded.storageKey,
        mimeType: bytes.mimeType,
        sizeBytes: uploaded.sizeBytes,
        actualCostCents: unitCostCentsPerClip,
        ...(durationSec != null ? { durationSec } : {}),
      });
    },
  };
}
