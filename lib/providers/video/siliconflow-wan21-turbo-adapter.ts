import "server-only";

import {
  PROVIDER_CONFIG_MISSING,
  WAN_ALLOWED_OUTPUT_HOSTS,
  WAN_DEFAULT_IMAGE_SIZE,
  WAN_ENV_KEY_NAME,
  WAN_FETCH_MAX_BYTES,
  WAN_FETCH_MAX_REDIRECTS,
  WAN_FETCH_TIMEOUT_MS,
  WAN_IMAGE_MIME_ALLOWLIST,
  WAN_IMAGE_SIZE_ALLOWLIST,
  WAN_INPUT_URL_TTL_SEC,
  WAN_MODEL_ID,
  WAN_PROVIDER_KEY,
  WAN_STATUS_URL,
  WAN_SUBMIT_URL,
  WAN_UNIT_COST_CENTS_PER_CLIP,
  WAN_VIDEO_ASSET_ROLE,
  clampWanClipCount,
  clampWanClipDurationSec,
  type WanVendorStatus,
  WAN_VENDOR_STATUS_MAP,
} from "@/lib/contracts/siliconflow-wan21-turbo";
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
import type { VideoProviderAdapter } from "@/lib/providers/provider-adapters";

type WanSubmitResponse = {
  requestId?: unknown;
  request_id?: unknown;
};

type WanStatusResponse = {
  status?: unknown;
  reason?: unknown;
  results?: {
    videos?: Array<{ url?: unknown }>;
  };
};

type JobContext = {
  clientId: string;
  reelScriptId: string;
};

export type CreateSiliconflowWan21TurboAdapterParams = {
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

function getSiliconflowApiKey(): string {
  const token = process.env[WAN_ENV_KEY_NAME];
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
      "Reference image asset is required for Wan B-roll",
    );
  }
  return assetId;
}

function validateCreateJobInput(input: CreateVideoJobInput): void {
  resolvedCreateVideoJobInputSchema.parse(input);

  if (input.assetRole !== "broll") {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Wan adapter only accepts assetRole broll",
    );
  }

  if (input.referenceVideoAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Wan does not accept reference video loops",
    );
  }

  resolveReferenceStillAssetId(input);

  const prompt = input.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Server-authored prompt is required for Wan B-roll",
    );
  }
}

function resolveImageSize(input: CreateVideoJobInput): string {
  const fromPromptMeta = (input as { imageSize?: unknown }).imageSize;
  if (
    typeof fromPromptMeta === "string" &&
    (WAN_IMAGE_SIZE_ALLOWLIST as readonly string[]).includes(fromPromptMeta)
  ) {
    return fromPromptMeta;
  }
  return WAN_DEFAULT_IMAGE_SIZE;
}

function estimateCentsForInput(
  input: CreateVideoJobInput,
  unitCostCentsPerClip: number,
): number {
  const clipCount = clampWanClipCount(input.clipCount ?? 1);
  return unitCostCentsPerClip * clipCount;
}

function mapWanVendorStatus(raw: unknown): string {
  if (typeof raw !== "string") {
    return "failed";
  }
  const mapped = WAN_VENDOR_STATUS_MAP[raw as WanVendorStatus];
  return mapped ?? raw;
}

function extractWanOutputUrl(payload: WanStatusResponse): string | undefined {
  const url = payload.results?.videos?.[0]?.url;
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
      reason?: unknown;
      detail?: unknown;
    };
    const candidate =
      payload.message ?? payload.error ?? payload.reason ?? payload.detail ?? text;
    return sanitizeProviderErrorMessage(candidate);
  } catch {
    return sanitizeProviderErrorMessage(text);
  }
}

async function siliconflowRequest(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
      WAN_FETCH_TIMEOUT_MS,
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
      if (redirects > WAN_FETCH_MAX_REDIRECTS) {
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
      if (Number.isFinite(size) && size > WAN_FETCH_MAX_BYTES) {
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
      if (totalBytes > WAN_FETCH_MAX_BYTES) {
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

export function createSiliconflowWan21TurboAdapter(
  params: CreateSiliconflowWan21TurboAdapterParams,
): VideoProviderAdapter {
  const {
    defaultEstimateCents,
    unitCostCentsPerClip = defaultEstimateCents || WAN_UNIT_COST_CENTS_PER_CLIP,
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
        allowedMimeTypes: WAN_IMAGE_MIME_ALLOWLIST,
        ttlSec: WAN_INPUT_URL_TTL_SEC,
      }));

  const jobContextByExternalId = new Map<ExternalJobId, JobContext>(
    initialJobContexts ?? [],
  );

  return {
    providerKey: WAN_PROVIDER_KEY,
    videoAssetRole: WAN_VIDEO_ASSET_ROLE,

    async estimateCost(input: CreateVideoJobInput) {
      return costEstimateSchema.parse({
        estimatedCostCents: estimateCentsForInput(input, unitCostCentsPerClip),
        currency: "USD",
        providerKey: input.providerKey,
      });
    },

    async createJob(input: CreateVideoJobInput) {
      validateCreateJobInput(input);
      const token = getSiliconflowApiKey();

      const stillAssetId = resolveReferenceStillAssetId(input);
      const imageUrl = await resolveAssetUrl(
        stillAssetId,
        input.clientId,
        "image",
      );
      const duration = clampWanClipDurationSec(input.targetDurationSec);
      const prompt = input.prompt!.trim();

      const response = await siliconflowRequest(
        fetchImpl,
        token,
        WAN_SUBMIT_URL,
        {
          model: WAN_MODEL_ID,
          prompt,
          image: imageUrl,
          image_size: resolveImageSize(input),
          duration,
        },
      );

      if (!response.ok) {
        const message = await readResponseErrorMessage(response);
        throw new ProviderAdapterError("PROVIDER_REQUEST_FAILED", message);
      }

      const payload = (await response.json()) as WanSubmitResponse;
      const externalJobId = parseExternalJobId(
        payload.requestId ?? payload.request_id,
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
      const token = getSiliconflowApiKey();

      const response = await siliconflowRequest(
        fetchImpl,
        token,
        WAN_STATUS_URL,
        { requestId: externalJobId },
      );

      if (!response.ok) {
        const message = await readResponseErrorMessage(response);
        return normalizeVideoJobStatusResult(
          {
            status: "failed",
            errorMessage: message,
          },
          WAN_ALLOWED_OUTPUT_HOSTS,
        );
      }

      const payload = (await response.json()) as WanStatusResponse;
      return normalizeVideoJobStatusResult(
        {
          status: mapWanVendorStatus(payload.status),
          errorMessage: payload.reason,
          outputUrl: extractWanOutputUrl(payload),
        },
        WAN_ALLOWED_OUTPUT_HOSTS,
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

      validateProviderOutputUrl(outputUrl, WAN_ALLOWED_OUTPUT_HOSTS);
      const { buffer, contentType } = await downloadProviderOutput(
        outputUrl,
        WAN_ALLOWED_OUTPUT_HOSTS,
        fetchImpl,
      );

      const uploaded = await uploadGeneratedVideo({
        clientId: context.clientId,
        reelScriptId: context.reelScriptId,
        buffer,
        mimeType: contentType,
      });

      return storedMediaAssetSchema.parse({
        storageKey: uploaded.storageKey,
        mimeType: contentType,
        sizeBytes: uploaded.sizeBytes,
        actualCostCents: unitCostCentsPerClip,
      });
    },
  };
}
