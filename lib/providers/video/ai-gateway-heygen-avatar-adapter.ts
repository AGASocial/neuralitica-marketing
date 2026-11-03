import "server-only";

import {
  AI_GATEWAY_ENV_KEY_NAME,
  AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
  AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND,
  AI_GATEWAY_HEYGEN_VIDEO_ASSET_ROLE,
  AI_GATEWAY_HEYGEN_VIDEO_MODEL,
  AI_GATEWAY_VIDEO_DEFAULT_ASPECT_RATIO,
  AI_GATEWAY_VIDEO_DEFAULT_RESOLUTION_CLASS,
  clampAiGatewayHeygenDurationSec,
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

export type CreateAiGatewayHeygenAvatarAdapterParams = {
  defaultEstimateCents: number;
  unitCostCentsPerSecond?: number;
  envKeyName?: string;
  gatewayModel?: string;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "portrait" | "audio",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  startVideo?: StartVideoFn;
  getVideoStatus?: GetVideoStatusFn;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
};

function estimateCentsForDuration(
  input: CreateVideoJobInput,
  unitCostCentsPerSecond: number,
  defaultEstimateCents: number,
): number {
  const duration = input.targetDurationSec;
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return unitCostCentsPerSecond * clampAiGatewayHeygenDurationSec(duration);
  }
  return defaultEstimateCents;
}

function resolvePortraitAssetId(input: CreateVideoJobInput): string {
  const portrait = input.portraitAssetId ?? input.referenceImageAssetId;
  if (!portrait) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Portrait image is required for AI Gateway HeyGen avatar",
    );
  }
  return portrait;
}

function validateCreateJobInput(input: CreateVideoJobInput): {
  portraitAssetId: string;
  voiceoverAssetId: string;
} {
  resolvedCreateVideoJobInputSchema.parse(input);

  if (input.referenceVideoAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "AI Gateway HeyGen does not accept reference video loops",
    );
  }

  if (!input.voiceoverAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Voiceover asset is required for AI Gateway HeyGen",
    );
  }

  return {
    portraitAssetId: resolvePortraitAssetId(input),
    voiceoverAssetId: input.voiceoverAssetId,
  };
}

export function createAiGatewayHeygenAvatarAdapter(
  params: CreateAiGatewayHeygenAvatarAdapterParams,
): VideoProviderAdapter {
  const {
    defaultEstimateCents,
    unitCostCentsPerSecond = AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND,
    envKeyName = AI_GATEWAY_ENV_KEY_NAME,
    gatewayModel = AI_GATEWAY_HEYGEN_VIDEO_MODEL,
    resolveMediaAssetUrl,
    uploadGeneratedVideo = uploadGeneratedVideoBuffer,
    fetchImpl = fetch,
    startVideo = defaultStartVideo,
    getVideoStatus = defaultGetVideoStatus,
    initialJobContexts,
  } = params;

  const resolveAssetUrl =
    resolveMediaAssetUrl ??
    (async (assetId: string, clientId: string, kind: "portrait" | "audio") =>
      resolveMediaAssetUrlForProvider({
        assetId,
        clientId,
        kind,
      }));

  const jobContextByExternalId = new Map<ExternalJobId, JobContext>(
    initialJobContexts ?? [],
  );
  const completedBytesByExternalId = new Map<ExternalJobId, CompletedVideoBytes>();

  return {
    providerKey: AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
    videoAssetRole: AI_GATEWAY_HEYGEN_VIDEO_ASSET_ROLE,

    async estimateCost(input: CreateVideoJobInput) {
      return costEstimateSchema.parse({
        estimatedCostCents: estimateCentsForDuration(
          input,
          unitCostCentsPerSecond,
          defaultEstimateCents,
        ),
        currency: "USD",
        providerKey: AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
      });
    },

    async createJob(input: CreateVideoJobInput) {
      const { portraitAssetId, voiceoverAssetId } = validateCreateJobInput(input);
      const apiKey = requireAiGatewayApiKey(envKeyName);
      const duration = clampAiGatewayHeygenDurationSec(input.targetDurationSec);
      const estimatedCostCents = estimateCentsForDuration(
        input,
        unitCostCentsPerSecond,
        defaultEstimateCents,
      );

      const [imageUrl, audioUrl] = await Promise.all([
        resolveAssetUrl(portraitAssetId, input.clientId, "portrait"),
        resolveAssetUrl(voiceoverAssetId, input.clientId, "audio"),
      ]);

      const model = createGatewayVideoModel({ apiKey, modelId: gatewayModel });
      let startResult;
      try {
        // heygen/heygen-video-1 supports audio input (gateway model input_limits.audio).
        // Pass signed TTS URL via providerOptions + inputReferences so lip-sync
        // drives from OUR ElevenLabs track (not HeyGen-generated speech).
        startResult = await startVideo({
          model,
          prompt: {
            image: imageUrl,
            text:
              input.prompt?.trim() ||
              "A talking presenter speaking to camera. Natural head movement, clear lip sync to the reference audio. Vertical framing.",
          },
          duration,
          aspectRatio: AI_GATEWAY_VIDEO_DEFAULT_ASPECT_RATIO,
          generateAudio: true,
          inputReferences: [
            {
              data: audioUrl,
              mediaType: "audio/mpeg",
            },
          ],
          providerOptions: {
            heygen: {
              resolution: AI_GATEWAY_VIDEO_DEFAULT_RESOLUTION_CLASS,
              promptEnhancement: "disabled",
              referenceImages: [{ type: "url", url: imageUrl }],
              referenceAudio: [{ type: "url", url: audioUrl }],
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
        estimatedCostCents,
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
        actualCostCents: defaultEstimateCents,
        ...(durationSec != null ? { durationSec } : {}),
      });
    },
  };
}
