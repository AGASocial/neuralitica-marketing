import "server-only";

import {
  PROVIDER_CONFIG_MISSING,
  REPLICATE_API_BASE_URL,
  SADTALKER_ALLOWED_OUTPUT_HOSTS,
  SADTALKER_AUDIO_MIME_ALLOWLIST,
  SADTALKER_DEFAULT_PREDICTION_INPUT,
  SADTALKER_ENV_KEY_NAME,
  SADTALKER_FETCH_MAX_BYTES,
  SADTALKER_FETCH_MAX_REDIRECTS,
  SADTALKER_FETCH_TIMEOUT_MS,
  SADTALKER_PORTRAIT_MIME_ALLOWLIST,
  SADTALKER_REPLICATE_INPUT_FIELDS,
  SADTALKER_REPLICATE_MODEL_VERSION,
} from "@/lib/contracts/sadtalker-low";
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

type ReplicatePrediction = {
  id?: unknown;
  status?: unknown;
  error?: unknown;
  output?: unknown;
};

type JobContext = {
  clientId: string;
  reelScriptId: string;
};

export type CreateSadtalkerLowAdapterParams = {
  defaultEstimateCents: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "portrait" | "audio",
  ) => Promise<string>;
  uploadGeneratedVideo?: (
    args: UploadGeneratedVideoArgs,
  ) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
};

function getReplicateApiToken(): string {
  const token = process.env[SADTALKER_ENV_KEY_NAME];
  if (!token || token.trim().length === 0) {
    throw new ProviderAdapterError(
      PROVIDER_CONFIG_MISSING,
      "Provider is not configured",
    );
  }
  return token.trim();
}

function validateCreateJobInput(input: CreateVideoJobInput): void {
  resolvedCreateVideoJobInputSchema.parse(input);

  if (input.referenceVideoAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "SadTalker does not accept reference video loops",
    );
  }

  if (!input.voiceoverAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Voiceover asset is required for SadTalker",
    );
  }

  const portraitAssetId = input.portraitAssetId ?? input.referenceImageAssetId;
  if (!portraitAssetId) {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Portrait or reference image asset is required for SadTalker",
    );
  }
}

function resolvePortraitAssetId(input: CreateVideoJobInput): string {
  return input.portraitAssetId ?? input.referenceImageAssetId!;
}

function extractReplicateOutputUrl(output: unknown): string | undefined {
  if (typeof output === "string" && output.startsWith("https:")) {
    return output;
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === "string" && item.startsWith("https:")) {
        return item;
      }
    }
  }

  return undefined;
}

async function readResponseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return `Provider request failed (${response.status})`;
  }

  try {
    const payload = JSON.parse(text) as {
      detail?: unknown;
      error?: unknown;
      title?: unknown;
    };
    const candidate = payload.detail ?? payload.error ?? payload.title ?? text;
    return sanitizeProviderErrorMessage(candidate);
  } catch {
    return sanitizeProviderErrorMessage(text);
  }
}

async function replicateRequest(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${REPLICATE_API_BASE_URL}${path}`;
  return fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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
      SADTALKER_FETCH_TIMEOUT_MS,
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
      if (redirects > SADTALKER_FETCH_MAX_REDIRECTS) {
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
      if (Number.isFinite(size) && size > SADTALKER_FETCH_MAX_BYTES) {
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
      if (totalBytes > SADTALKER_FETCH_MAX_BYTES) {
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

export function createSadtalkerLowAdapter(
  params: CreateSadtalkerLowAdapterParams,
): VideoProviderAdapter {
  const {
    defaultEstimateCents,
    resolveMediaAssetUrl,
    uploadGeneratedVideo = uploadGeneratedVideoBuffer,
    fetchImpl = fetch,
  } = params;

  const resolveAssetUrl =
    resolveMediaAssetUrl ??
    (async (assetId: string, clientId: string, kind: "portrait" | "audio") =>
      resolveMediaAssetUrlForProvider({
        assetId,
        clientId,
        allowedMimeTypes:
          kind === "portrait"
            ? SADTALKER_PORTRAIT_MIME_ALLOWLIST
            : SADTALKER_AUDIO_MIME_ALLOWLIST,
      }));

  const jobContextByExternalId = new Map<ExternalJobId, JobContext>();

  return {
    providerKey: "sadtalker_low",
    videoAssetRole: "primary",

    async estimateCost(input: CreateVideoJobInput) {
      return costEstimateSchema.parse({
        estimatedCostCents: defaultEstimateCents,
        currency: "USD",
        providerKey: input.providerKey,
      });
    },

    async createJob(input: CreateVideoJobInput) {
      validateCreateJobInput(input);
      const token = getReplicateApiToken();

      const portraitAssetId = resolvePortraitAssetId(input);
      const [sourceImageUrl, drivenAudioUrl] = await Promise.all([
        resolveAssetUrl(portraitAssetId, input.clientId, "portrait"),
        resolveAssetUrl(input.voiceoverAssetId!, input.clientId, "audio"),
      ]);

      const response = await replicateRequest(fetchImpl, token, "/v1/predictions", {
        method: "POST",
        body: JSON.stringify({
          version: SADTALKER_REPLICATE_MODEL_VERSION,
          input: {
            [SADTALKER_REPLICATE_INPUT_FIELDS.sourceImage]: sourceImageUrl,
            [SADTALKER_REPLICATE_INPUT_FIELDS.drivenAudio]: drivenAudioUrl,
            [SADTALKER_REPLICATE_INPUT_FIELDS.preprocess]:
              SADTALKER_DEFAULT_PREDICTION_INPUT.preprocess,
            [SADTALKER_REPLICATE_INPUT_FIELDS.still]:
              SADTALKER_DEFAULT_PREDICTION_INPUT.still,
            [SADTALKER_REPLICATE_INPUT_FIELDS.enhancer]:
              SADTALKER_DEFAULT_PREDICTION_INPUT.enhancer,
          },
        }),
      });

      if (!response.ok) {
        const message = await readResponseErrorMessage(response);
        throw new ProviderAdapterError("PROVIDER_REQUEST_FAILED", message);
      }

      const payload = (await response.json()) as ReplicatePrediction;
      const externalJobId = parseExternalJobId(payload.id);
      const statusResult = normalizeVideoJobStatusResult(
        {
          status: payload.status,
          errorMessage: payload.error,
          outputUrl: extractReplicateOutputUrl(payload.output),
        },
        SADTALKER_ALLOWED_OUTPUT_HOSTS,
      );

      jobContextByExternalId.set(externalJobId, {
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
      });

      return parseCreateVideoJobResult({
        externalJobId,
        status: statusResult.status,
        estimatedCostCents: defaultEstimateCents,
      });
    },

    async getJobStatus(externalJobId: ExternalJobId) {
      parseExternalJobId(externalJobId);
      const token = getReplicateApiToken();

      const response = await replicateRequest(
        fetchImpl,
        token,
        `/v1/predictions/${encodeURIComponent(externalJobId)}`,
        { method: "GET" },
      );

      if (!response.ok) {
        const message = await readResponseErrorMessage(response);
        return normalizeVideoJobStatusResult(
          {
            status: "failed",
            errorMessage: message,
          },
          SADTALKER_ALLOWED_OUTPUT_HOSTS,
        );
      }

      const payload = (await response.json()) as ReplicatePrediction;
      return normalizeVideoJobStatusResult(
        {
          status: payload.status,
          errorMessage: payload.error,
          outputUrl: extractReplicateOutputUrl(payload.output),
        },
        SADTALKER_ALLOWED_OUTPUT_HOSTS,
      );
    },

    async fetchAsset(externalJobId: ExternalJobId, rawOutputUrl?: string) {
      parseExternalJobId(externalJobId);

      const context = jobContextByExternalId.get(externalJobId);
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

      validateProviderOutputUrl(outputUrl, SADTALKER_ALLOWED_OUTPUT_HOSTS);
      const { buffer, contentType } = await downloadProviderOutput(
        outputUrl,
        SADTALKER_ALLOWED_OUTPUT_HOSTS,
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
        actualCostCents: defaultEstimateCents,
      });
    },
  };
}
