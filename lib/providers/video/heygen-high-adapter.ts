import "server-only";

import {
  HEYGEN_ALLOWED_OUTPUT_HOSTS,
  HEYGEN_AVATAR_ENGINE,
  HEYGEN_DEFAULT_AVATAR_ID_ENV,
  HEYGEN_DEFAULT_CREATE_OPTIONS,
  HEYGEN_ENV_KEY_NAME,
  HEYGEN_FETCH_MAX_BYTES,
  HEYGEN_FETCH_MAX_REDIRECTS,
  HEYGEN_FETCH_TIMEOUT_MS,
  HEYGEN_FORBIDDEN_ENGINE_TYPES,
  HEYGEN_UNIT_COST_CENTS_PER_SECOND,
  PROVIDER_CONFIG_MISSING,
} from "@/lib/contracts/heygen-high";
import {
  costEstimateSchema,
  resolvedCreateVideoJobInputSchema,
  storedMediaAssetSchema,
  type CreateVideoJobInput,
  type ExternalJobId,
} from "@/lib/contracts/providers";
import { cropPortraitTo9x16 } from "@/lib/media/crop-portrait-to-9x16";
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
  validateProviderOutputUrl,
} from "@/lib/providers/normalize-provider-response";
import { optionalDurationSecFromBuffer } from "@/lib/providers/video/optional-duration-sec-from-buffer";
import type { VideoProviderAdapter } from "@/lib/providers/provider-adapters";
import {
  getCachedHeygenLook,
  upsertCachedHeygenLook,
} from "@/lib/providers/video/heygen-look-cache";
import {
  heygenCreateAudioDrivenAvatarVideo,
  heygenCreatePhotoAvatar,
  heygenGetVideo,
  heygenUploadAsset,
  heygenWaitForLookCompleted,
  readHeygenResponseErrorMessage,
  type HeygenV3ClientDeps,
} from "@/lib/providers/video/heygen-v3-client";

type HeygenVideoPayload = {
  video_id?: unknown;
  id?: unknown;
  status?: unknown;
  error?: unknown;
  message?: unknown;
  video_url?: unknown;
  captioned_video_url?: unknown;
};

type HeygenApiResponse = {
  data?: HeygenVideoPayload | null;
  error?: unknown;
  message?: unknown;
};

type JobContext = {
  clientId: string;
  reelScriptId: string;
};

export type CreateHeygenHighAdapterParams = {
  defaultEstimateCents: number;
  unitCostCentsPerSecond: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "portrait" | "audio",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  /** Server config — process.env.HEYGEN_DEFAULT_AVATAR_ID at registry bootstrap. */
  heygenAvatarId?: string;
  /** Pre-seed job context for poller paths (US-8.4 L1 — job-row tenant context). */
  initialJobContexts?: Map<ExternalJobId, JobContext>;
  getCachedLook?: typeof getCachedHeygenLook;
  upsertCachedLook?: typeof upsertCachedHeygenLook;
  sleep?: (ms: number) => Promise<void>;
  /** Test seam — skip sharp crop when injecting pre-cropped bytes. */
  cropPortrait?: typeof cropPortraitTo9x16;
};

function getHeygenApiKey(): string {
  const token = process.env[HEYGEN_ENV_KEY_NAME];
  if (!token || token.trim().length === 0) {
    throw new ProviderAdapterError(
      PROVIDER_CONFIG_MISSING,
      "Provider is not configured",
    );
  }
  return token.trim();
}

function estimateCentsForDuration(
  input: CreateVideoJobInput,
  unitCostCentsPerSecond: number,
  defaultEstimateCents: number,
): number {
  const duration = input.targetDurationSec;
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return unitCostCentsPerSecond * duration;
  }
  return defaultEstimateCents;
}

function resolvePortraitAssetId(input: CreateVideoJobInput): string | null {
  return input.portraitAssetId ?? input.referenceImageAssetId ?? null;
}

function validateCreateJobInput(
  input: CreateVideoJobInput,
  heygenAvatarId: string | undefined,
): { mode: "own_avatar" | "generic_avatar"; portraitAssetId: string | null } {
  resolvedCreateVideoJobInputSchema.parse(input);

  if (input.referenceVideoAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "HeyGen does not accept reference video loops",
    );
  }

  if (!input.voiceoverAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Voiceover asset is required for HeyGen",
    );
  }

  const portraitAssetId = resolvePortraitAssetId(input);
  if (portraitAssetId) {
    return { mode: "own_avatar", portraitAssetId };
  }

  const avatarId = heygenAvatarId?.trim();
  if (!avatarId) {
    throw new ProviderAdapterError(
      PROVIDER_CONFIG_MISSING,
      "Provider is not configured",
    );
  }

  return { mode: "generic_avatar", portraitAssetId: null };
}

function assertNoForbiddenEngine(body: Record<string, unknown>): void {
  const engine = body.engine;
  if (!engine || typeof engine !== "object" || Array.isArray(engine)) {
    return;
  }
  const type = (engine as { type?: unknown }).type;
  if (
    typeof type === "string" &&
    (HEYGEN_FORBIDDEN_ENGINE_TYPES as readonly string[]).includes(type)
  ) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Forbidden HeyGen engine type",
    );
  }
}

function extractOutputUrl(payload: HeygenVideoPayload): string | undefined {
  const preferred = payload.video_url;
  if (typeof preferred === "string" && preferred.startsWith("https:")) {
    return preferred;
  }
  const captioned = payload.captioned_video_url;
  if (typeof captioned === "string" && captioned.startsWith("https:")) {
    return captioned;
  }
  return undefined;
}

async function downloadBytes(
  initialUrl: string,
  allowedHosts: readonly string[] | null,
  fetchImpl: typeof fetch,
  maxBytes: number,
): Promise<{ buffer: Buffer; contentType: string }> {
  let currentUrl =
    allowedHosts === null
      ? initialUrl
      : validateProviderOutputUrl(initialUrl, allowedHosts);
  let redirects = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEYGEN_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Provider output redirect missing location",
        );
      }
      redirects += 1;
      if (redirects > HEYGEN_FETCH_MAX_REDIRECTS) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Provider output exceeded redirect limit",
        );
      }
      const next = new URL(location, currentUrl).href;
      currentUrl =
        allowedHosts === null
          ? next
          : validateProviderOutputUrl(next, allowedHosts);
      continue;
    }

    if (!response.ok) {
      throw new ProviderAdapterError(
        "PROVIDER_DOWNLOAD_FAILED",
        sanitizeProviderErrorMessage(
          `Download failed (${response.status})`,
        ),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const size = Number.parseInt(contentLength, 10);
      if (Number.isFinite(size) && size > maxBytes) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Download exceeds maximum size",
        );
      }
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const body = response.body;
    if (!body) {
      throw new ProviderAdapterError(
        "PROVIDER_DOWNLOAD_FAILED",
        "Download body is empty",
      );
    }
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Download exceeds maximum size",
        );
      }
      chunks.push(Buffer.from(value));
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType: contentType.split(";")[0]?.trim() || "application/octet-stream",
    };
  }
}

async function resolveOrCreatePhotoLook(params: {
  deps: HeygenV3ClientDeps;
  clientId: string;
  portraitAssetId: string;
  portraitUrl: string;
  fetchImpl: typeof fetch;
  getCachedLook: typeof getCachedHeygenLook;
  upsertCachedLook: typeof upsertCachedHeygenLook;
  cropPortrait: typeof cropPortraitTo9x16;
}): Promise<string> {
  const cached = await params.getCachedLook({
    clientId: params.clientId,
    portraitAssetId: params.portraitAssetId,
  });
  if (cached?.heygenLookId) {
    return cached.heygenLookId;
  }

  // Our signed media URLs are first-party — skip HeyGen host allowlist.
  const { buffer } = await downloadBytes(
    params.portraitUrl,
    null,
    params.fetchImpl,
    HEYGEN_FETCH_MAX_BYTES,
  );
  const cropped = await params.cropPortrait({ input: buffer });
  const uploadedImage = await heygenUploadAsset(params.deps, {
    bytes: cropped.buffer,
    filename: "portrait-9x16.jpg",
    mimeType: cropped.mimeType,
  });

  const created = await heygenCreatePhotoAvatar(params.deps, {
    name: `neuramark-${params.clientId.slice(0, 8)}`,
    imageAssetId: uploadedImage.assetId,
  });
  if (created.status !== "completed") {
    await heygenWaitForLookCompleted(params.deps, created.lookId);
  }

  await params.upsertCachedLook({
    clientId: params.clientId,
    portraitAssetId: params.portraitAssetId,
    heygenLookId: created.lookId,
    heygenGroupId: created.groupId,
    heygenImageAssetId: uploadedImage.assetId,
  });

  return created.lookId;
}

export function createHeygenHighAdapter(
  params: CreateHeygenHighAdapterParams,
): VideoProviderAdapter {
  const {
    defaultEstimateCents,
    unitCostCentsPerSecond = HEYGEN_UNIT_COST_CENTS_PER_SECOND,
    resolveMediaAssetUrl,
    uploadGeneratedVideo = uploadGeneratedVideoBuffer,
    fetchImpl = fetch,
    heygenAvatarId = process.env[HEYGEN_DEFAULT_AVATAR_ID_ENV],
    initialJobContexts,
    getCachedLook = getCachedHeygenLook,
    upsertCachedLook = upsertCachedHeygenLook,
    sleep,
    cropPortrait = cropPortraitTo9x16,
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

  return {
    providerKey: "heygen_high",
    videoAssetRole: "primary",

    async estimateCost(input: CreateVideoJobInput) {
      const estimatedCostCents = estimateCentsForDuration(
        input,
        unitCostCentsPerSecond,
        defaultEstimateCents,
      );
      return costEstimateSchema.parse({
        estimatedCostCents,
        currency: "USD",
        providerKey: "heygen_high",
      });
    },

    async createJob(input: CreateVideoJobInput) {
      const { mode, portraitAssetId } = validateCreateJobInput(
        input,
        heygenAvatarId,
      );
      const apiKey = getHeygenApiKey();
      const deps: HeygenV3ClientDeps = { apiKey, fetchImpl, sleep };
      const estimatedCostCents = estimateCentsForDuration(
        input,
        unitCostCentsPerSecond,
        defaultEstimateCents,
      );

      const audioUrl = await resolveAssetUrl(
        input.voiceoverAssetId!,
        input.clientId,
        "audio",
      );
      const { buffer: audioBytes, contentType: audioMime } = await downloadBytes(
        audioUrl,
        null,
        fetchImpl,
        HEYGEN_FETCH_MAX_BYTES,
      );
      const audioExt = audioMime.includes("wav")
        ? "wav"
        : audioMime.includes("mp4")
          ? "m4a"
          : "mp3";
      const uploadedAudio = await heygenUploadAsset(deps, {
        bytes: audioBytes,
        filename: `voiceover.${audioExt}`,
        mimeType: audioMime.startsWith("audio/")
          ? audioMime
          : "audio/mpeg",
      });

      let avatarId: string;
      if (mode === "own_avatar" && portraitAssetId) {
        const portraitUrl = await resolveAssetUrl(
          portraitAssetId,
          input.clientId,
          "portrait",
        );
        avatarId = await resolveOrCreatePhotoLook({
          deps,
          clientId: input.clientId,
          portraitAssetId,
          portraitUrl,
          fetchImpl,
          getCachedLook,
          upsertCachedLook,
          cropPortrait,
        });
      } else {
        avatarId = heygenAvatarId!.trim();
      }

      const createExtras: Record<string, unknown> = {
        ...HEYGEN_DEFAULT_CREATE_OPTIONS,
        engine: { ...HEYGEN_AVATAR_ENGINE },
      };
      assertNoForbiddenEngine(createExtras);

      const created = await heygenCreateAudioDrivenAvatarVideo(deps, {
        avatarId,
        audioAssetId: uploadedAudio.assetId,
        bodyExtras: createExtras,
      });

      const externalJobId = parseExternalJobId(created.videoId);
      const statusResult = normalizeVideoJobStatusResult(
        {
          status: created.status,
          errorMessage: undefined,
          outputUrl: undefined,
        },
        HEYGEN_ALLOWED_OUTPUT_HOSTS,
      );

      jobContextByExternalId.set(externalJobId, {
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
      });

      return parseCreateVideoJobResult({
        externalJobId,
        status: statusResult.status,
        estimatedCostCents,
      });
    },

    async getJobStatus(externalJobId: ExternalJobId) {
      parseExternalJobId(externalJobId);
      const apiKey = getHeygenApiKey();
      const deps: HeygenV3ClientDeps = { apiKey, fetchImpl, sleep };

      const response = await heygenGetVideo(deps, externalJobId);
      if (!response.ok) {
        const message = await readHeygenResponseErrorMessage(response, apiKey);
        return normalizeVideoJobStatusResult(
          {
            status: "failed",
            errorMessage: message,
          },
          HEYGEN_ALLOWED_OUTPUT_HOSTS,
        );
      }

      const payload = (await response.json()) as HeygenApiResponse;
      const data = payload.data ?? {};
      return normalizeVideoJobStatusResult(
        {
          status: data.status,
          errorMessage: data.error ?? data.message,
          outputUrl: extractOutputUrl(data),
        },
        HEYGEN_ALLOWED_OUTPUT_HOSTS,
      );
    },

    async fetchAsset(
      externalJobId: ExternalJobId,
      rawOutputUrl?: string,
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

      let outputUrl = rawOutputUrl;
      if (!outputUrl) {
        const status = await this.getJobStatus(externalJobId);
        outputUrl = status.rawOutputUrl;
      }

      if (!outputUrl) {
        throw new ProviderAdapterError(
          "PROVIDER_OUTPUT_MISSING",
          "Provider output URL is not available",
        );
      }

      validateProviderOutputUrl(outputUrl, HEYGEN_ALLOWED_OUTPUT_HOSTS);
      const { buffer, contentType } = await downloadBytes(
        outputUrl,
        HEYGEN_ALLOWED_OUTPUT_HOSTS,
        fetchImpl,
        HEYGEN_FETCH_MAX_BYTES,
      );

      const estimatedCostCents = defaultEstimateCents;
      const uploaded = await uploadGeneratedVideo({
        clientId: context.clientId,
        reelScriptId: context.reelScriptId,
        buffer,
        mimeType: contentType.startsWith("video/")
          ? contentType
          : "video/mp4",
      });

      const durationSec = await optionalDurationSecFromBuffer(buffer);

      return storedMediaAssetSchema.parse({
        storageKey: uploaded.storageKey,
        mimeType: contentType.startsWith("video/")
          ? contentType.split(";")[0]!.trim()
          : "video/mp4",
        sizeBytes: uploaded.sizeBytes,
        actualCostCents: estimatedCostCents,
        ...(durationSec != null ? { durationSec } : {}),
      });
    },
  };
}
