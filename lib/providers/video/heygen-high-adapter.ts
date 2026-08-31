import "server-only";

import {
  HEYGEN_ALLOWED_OUTPUT_HOSTS,
  HEYGEN_API_BASE_URL,
  HEYGEN_API_KEY_HEADER,
  HEYGEN_AVATAR_ENGINE,
  HEYGEN_CREATE_VIDEO_PATH,
  HEYGEN_DEFAULT_CREATE_OPTIONS,
  HEYGEN_DEFAULT_AVATAR_ID_ENV,
  HEYGEN_ENV_KEY_NAME,
  HEYGEN_FETCH_MAX_BYTES,
  HEYGEN_FETCH_MAX_REDIRECTS,
  HEYGEN_FETCH_TIMEOUT_MS,
  HEYGEN_FORBIDDEN_ENGINE_TYPES,
  HEYGEN_GET_VIDEO_PATH_PREFIX,
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

function buildCreateBody(params: {
  mode: "own_avatar" | "generic_avatar";
  audioUrl: string;
  imageUrl?: string;
  heygenAvatarId?: string;
}): Record<string, unknown> {
  if (params.mode === "own_avatar") {
    if (!params.imageUrl) {
      throw new ProviderAdapterError(
        "INVALID_PROVIDER_INPUT",
        "Portrait image URL is required for own_avatar HeyGen path",
      );
    }
    const body: Record<string, unknown> = {
      type: "image",
      image: {
        type: "url",
        url: params.imageUrl,
      },
      audio_url: params.audioUrl,
      ...HEYGEN_DEFAULT_CREATE_OPTIONS,
    };
    assertNoForbiddenEngine(body);
    return body;
  }

  const avatarId = params.heygenAvatarId?.trim();
  if (!avatarId) {
    throw new ProviderAdapterError(
      PROVIDER_CONFIG_MISSING,
      "Provider is not configured",
    );
  }

  const body: Record<string, unknown> = {
    type: "avatar",
    avatar_id: avatarId,
    audio_url: params.audioUrl,
    ...HEYGEN_DEFAULT_CREATE_OPTIONS,
    engine: { ...HEYGEN_AVATAR_ENGINE },
  };
  assertNoForbiddenEngine(body);
  return body;
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

function extractVideoId(payload: HeygenVideoPayload): unknown {
  return payload.video_id ?? payload.id;
}

async function readResponseErrorMessage(
  response: Response,
  apiKey: string,
): Promise<string> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return `Provider request failed (${response.status})`;
  }

  let candidate = text;
  try {
    const payload = JSON.parse(text) as HeygenApiResponse & {
      detail?: unknown;
      error?: unknown;
      title?: unknown;
    };
    const raw =
      payload.detail ??
      payload.error ??
      payload.message ??
      payload.title ??
      text;
    candidate = typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch {
    candidate = text;
  }

  if (apiKey.length > 0) {
    candidate = candidate.split(apiKey).join("[redacted]");
  }

  return sanitizeProviderErrorMessage(candidate);
}

async function heygenRequest(
  fetchImpl: typeof fetch,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${HEYGEN_API_BASE_URL}${path}`;
  return fetchImpl(url, {
    ...init,
    headers: {
      [HEYGEN_API_KEY_HEADER]: apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function downloadProviderOutput(
  initialUrl: string,
  allowedHosts: readonly string[],
  fetchImpl: typeof fetch,
): Promise<{ buffer: Buffer; contentType: string }> {
  let currentUrl = validateProviderOutputUrl(initialUrl, allowedHosts);
  let redirects = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HEYGEN_FETCH_TIMEOUT_MS,
    );

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

      currentUrl = validateProviderOutputUrl(
        new URL(location, currentUrl).href,
        allowedHosts,
      );
      continue;
    }

    if (!response.ok) {
      throw new ProviderAdapterError(
        "PROVIDER_DOWNLOAD_FAILED",
        sanitizeProviderErrorMessage(
          `Provider output download failed (${response.status})`,
        ),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.startsWith("video/") &&
      contentType !== "application/octet-stream"
    ) {
      throw new ProviderAdapterError(
        "PROVIDER_DOWNLOAD_FAILED",
        "Provider output content type is not video",
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const size = Number.parseInt(contentLength, 10);
      if (Number.isFinite(size) && size > HEYGEN_FETCH_MAX_BYTES) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Provider output exceeds maximum size",
        );
      }
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const body = response.body;
    if (!body) {
      throw new ProviderAdapterError(
        "PROVIDER_DOWNLOAD_FAILED",
        "Provider output body is empty",
      );
    }

    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > HEYGEN_FETCH_MAX_BYTES) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Provider output exceeds maximum size",
        );
      }
      chunks.push(Buffer.from(value));
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType: contentType.startsWith("video/")
        ? contentType.split(";")[0]!.trim()
        : "video/mp4",
    };
  }
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

      let imageUrl: string | undefined;
      if (mode === "own_avatar" && portraitAssetId) {
        imageUrl = await resolveAssetUrl(
          portraitAssetId,
          input.clientId,
          "portrait",
        );
      }

      const createBody = buildCreateBody({
        mode,
        audioUrl,
        imageUrl,
        heygenAvatarId,
      });

      const response = await heygenRequest(
        fetchImpl,
        apiKey,
        HEYGEN_CREATE_VIDEO_PATH,
        {
          method: "POST",
          body: JSON.stringify(createBody),
        },
      );

      if (!response.ok) {
        const message = await readResponseErrorMessage(response, apiKey);
        throw new ProviderAdapterError("PROVIDER_REQUEST_FAILED", message);
      }

      const payload = (await response.json()) as HeygenApiResponse;
      const data = payload.data ?? {};
      const externalJobId = parseExternalJobId(extractVideoId(data));
      const statusResult = normalizeVideoJobStatusResult(
        {
          status: data.status,
          errorMessage: data.error ?? data.message,
          outputUrl: extractOutputUrl(data),
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

      const response = await heygenRequest(
        fetchImpl,
        apiKey,
        `${HEYGEN_GET_VIDEO_PATH_PREFIX}${encodeURIComponent(externalJobId)}`,
        { method: "GET" },
      );

      if (!response.ok) {
        const message = await readResponseErrorMessage(response, apiKey);
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
      const { buffer, contentType } = await downloadProviderOutput(
        outputUrl,
        HEYGEN_ALLOWED_OUTPUT_HOSTS,
        fetchImpl,
      );

      const estimatedCostCents = defaultEstimateCents;
      const uploaded = await uploadGeneratedVideo({
        clientId: context.clientId,
        reelScriptId: context.reelScriptId,
        buffer,
        mimeType: contentType,
      });

      const durationSec = await optionalDurationSecFromBuffer(buffer);

      return storedMediaAssetSchema.parse({
        storageKey: uploaded.storageKey,
        mimeType: contentType,
        sizeBytes: uploaded.sizeBytes,
        actualCostCents: estimatedCostCents,
        ...(durationSec != null ? { durationSec } : {}),
      });
    },
  };
}
