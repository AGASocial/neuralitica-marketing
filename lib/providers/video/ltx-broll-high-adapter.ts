import "server-only";

import {
  buildLtxResultUrl,
  buildLtxStatusUrl,
  clampLtxClipCount,
  clampLtxClipDurationSec,
  LTX_ALLOWED_OUTPUT_HOSTS,
  LTX_DEFAULT_ASPECT_RATIO,
  LTX_DEFAULT_FPS,
  LTX_DEFAULT_RESOLUTION,
  LTX_ENV_KEY_NAME,
  LTX_FETCH_MAX_BYTES,
  LTX_FETCH_MAX_REDIRECTS,
  LTX_FETCH_TIMEOUT_MS,
  LTX_IMAGE_MIME_ALLOWLIST,
  LTX_INPUT_URL_TTL_SEC,
  LTX_PROVIDER_KEY,
  LTX_SUBMIT_URL,
  LTX_UNIT_COST_CENTS_PER_CLIP,
  LTX_VIDEO_ASSET_ROLE,
  mapLtxVendorDurationSec,
  PROVIDER_CONFIG_MISSING,
  type LtxVendorStatus,
  LTX_VENDOR_STATUS_MAP,
} from "@/lib/contracts/ltx-broll-high";
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

type LtxSubmitResponse = {
  request_id?: unknown;
  requestId?: unknown;
};

type LtxStatusResponse = {
  status?: unknown;
  error?: unknown;
};

type LtxResultResponse = {
  video?: {
    url?: unknown;
  };
  error?: unknown;
};

type JobContext = {
  clientId: string;
  reelScriptId: string;
};

export type CreateLtxBrollHighAdapterParams = {
  defaultEstimateCents: number;
  unitCostCentsPerClip?: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "image" | "portrait",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  /** Pre-seed job context for poller paths (US-8.4 L1). */
  initialJobContexts?: Map<ExternalJobId, JobContext>;
};

function getFalApiKey(): string {
  const token = process.env[LTX_ENV_KEY_NAME];
  if (!token || token.trim().length === 0) {
    throw new ProviderAdapterError(
      PROVIDER_CONFIG_MISSING,
      "Provider is not configured",
    );
  }
  return token.trim();
}

function resolveReferenceStillAssetId(input: CreateVideoJobInput): string {
  const assetId = input.referenceImageAssetId ?? input.portraitAssetId;
  if (!assetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Reference image asset is required for LTX B-roll",
    );
  }
  return assetId;
}

function validateCreateJobInput(input: CreateVideoJobInput): void {
  resolvedCreateVideoJobInputSchema.parse(input);

  if (input.assetRole !== "broll") {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "LTX adapter only accepts assetRole broll",
    );
  }

  if (input.referenceVideoAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "LTX does not accept reference video loops",
    );
  }

  resolveReferenceStillAssetId(input);

  const prompt = input.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Server-authored prompt is required for LTX B-roll",
    );
  }
}

function estimateCentsForInput(
  input: CreateVideoJobInput,
  unitCostCentsPerClip: number,
): number {
  const clipCount = clampLtxClipCount(input.clipCount ?? 1);
  return unitCostCentsPerClip * clipCount;
}

function mapLtxVendorStatus(raw: unknown): string {
  if (typeof raw !== "string") {
    return "failed";
  }
  const mapped = LTX_VENDOR_STATUS_MAP[raw as LtxVendorStatus];
  return mapped ?? raw;
}

function extractLtxOutputUrl(payload: LtxResultResponse): string | undefined {
  const url = payload.video?.url;
  return typeof url === "string" && url.startsWith("https:") ? url : undefined;
}

async function readResponseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return `Provider request failed (${response.status})`;
  }

  try {
    const payload = JSON.parse(text) as {
      message?: unknown;
      error?: unknown;
      detail?: unknown;
    };
    const candidate = payload.message ?? payload.error ?? payload.detail ?? text;
    return sanitizeProviderErrorMessage(candidate);
  } catch {
    return sanitizeProviderErrorMessage(text);
  }
}

async function falRequest(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Key ${token}`,
  };

  if (init.body) {
    headers["Content-Type"] = "application/json";
  }

  return fetchImpl(url, {
    ...init,
    headers,
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
      LTX_FETCH_TIMEOUT_MS,
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
      if (redirects > LTX_FETCH_MAX_REDIRECTS) {
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
      if (Number.isFinite(size) && size > LTX_FETCH_MAX_BYTES) {
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
      if (totalBytes > LTX_FETCH_MAX_BYTES) {
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

export function createLtxBrollHighAdapter(
  params: CreateLtxBrollHighAdapterParams,
): VideoProviderAdapter {
  const {
    defaultEstimateCents,
    unitCostCentsPerClip = defaultEstimateCents || LTX_UNIT_COST_CENTS_PER_CLIP,
    resolveMediaAssetUrl,
    uploadGeneratedVideo = uploadGeneratedVideoBuffer,
    fetchImpl = fetch,
    initialJobContexts,
  } = params;

  const resolveAssetUrl =
    resolveMediaAssetUrl ??
    (async (assetId: string, clientId: string, _kind: "image" | "portrait") =>
      resolveMediaAssetUrlForProvider({
        assetId,
        clientId,
        allowedMimeTypes: LTX_IMAGE_MIME_ALLOWLIST,
        ttlSec: LTX_INPUT_URL_TTL_SEC,
      }));

  const jobContextByExternalId = new Map<ExternalJobId, JobContext>(
    initialJobContexts ?? [],
  );

  return {
    providerKey: LTX_PROVIDER_KEY,
    videoAssetRole: LTX_VIDEO_ASSET_ROLE,

    async estimateCost(input: CreateVideoJobInput) {
      return costEstimateSchema.parse({
        estimatedCostCents: estimateCentsForInput(input, unitCostCentsPerClip),
        currency: "USD",
        providerKey: input.providerKey,
      });
    },

    async createJob(input: CreateVideoJobInput) {
      validateCreateJobInput(input);
      const token = getFalApiKey();

      const stillAssetId = resolveReferenceStillAssetId(input);
      const imageUrl = await resolveAssetUrl(
        stillAssetId,
        input.clientId,
        "image",
      );
      const policyDuration = clampLtxClipDurationSec(input.targetDurationSec);
      const vendorDuration = mapLtxVendorDurationSec(policyDuration);
      const prompt = input.prompt!.trim();

      const response = await falRequest(fetchImpl, token, LTX_SUBMIT_URL, {
        method: "POST",
        body: JSON.stringify({
          image_url: imageUrl,
          prompt,
          duration: vendorDuration,
          resolution: LTX_DEFAULT_RESOLUTION,
          aspect_ratio: LTX_DEFAULT_ASPECT_RATIO,
          fps: LTX_DEFAULT_FPS,
          generate_audio: false,
        }),
      });

      if (!response.ok) {
        const message = await readResponseErrorMessage(response);
        throw new ProviderAdapterError("PROVIDER_REQUEST_FAILED", message);
      }

      const payload = (await response.json()) as LtxSubmitResponse;
      const externalJobId = parseExternalJobId(
        payload.request_id ?? payload.requestId,
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
      const token = getFalApiKey();

      const statusResponse = await falRequest(
        fetchImpl,
        token,
        buildLtxStatusUrl(externalJobId),
        { method: "GET" },
      );

      if (!statusResponse.ok) {
        const message = await readResponseErrorMessage(statusResponse);
        return normalizeVideoJobStatusResult(
          {
            status: "failed",
            errorMessage: message,
          },
          LTX_ALLOWED_OUTPUT_HOSTS,
        );
      }

      const statusPayload = (await statusResponse.json()) as LtxStatusResponse;
      const mappedStatus = mapLtxVendorStatus(statusPayload.status);

      if (mappedStatus !== "completed") {
        return normalizeVideoJobStatusResult(
          {
            status: mappedStatus,
            errorMessage: statusPayload.error,
          },
          LTX_ALLOWED_OUTPUT_HOSTS,
        );
      }

      const resultResponse = await falRequest(
        fetchImpl,
        token,
        buildLtxResultUrl(externalJobId),
        { method: "GET" },
      );

      if (!resultResponse.ok) {
        const message = await readResponseErrorMessage(resultResponse);
        return normalizeVideoJobStatusResult(
          {
            status: "failed",
            errorMessage: message,
          },
          LTX_ALLOWED_OUTPUT_HOSTS,
        );
      }

      const resultPayload = (await resultResponse.json()) as LtxResultResponse;
      return normalizeVideoJobStatusResult(
        {
          status: "completed",
          outputUrl: extractLtxOutputUrl(resultPayload),
          errorMessage: resultPayload.error,
        },
        LTX_ALLOWED_OUTPUT_HOSTS,
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

      validateProviderOutputUrl(outputUrl, LTX_ALLOWED_OUTPUT_HOSTS);
      const { buffer, contentType } = await downloadProviderOutput(
        outputUrl,
        LTX_ALLOWED_OUTPUT_HOSTS,
        fetchImpl,
      );

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
        actualCostCents: unitCostCentsPerClip,
        ...(durationSec != null ? { durationSec } : {}),
      });
    },
  };
}
