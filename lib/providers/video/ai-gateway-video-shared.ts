import "server-only";

import {
  createGateway,
  experimental_getVideoStatus,
  experimental_startVideo,
  type StartVideoResult,
} from "ai";
import type { JSONValue } from "@ai-sdk/provider";

import {
  AI_GATEWAY_ENV_KEY_NAME,
  AI_GATEWAY_VIDEO_FETCH_MAX_BYTES,
  AI_GATEWAY_VIDEO_FETCH_MAX_REDIRECTS,
  AI_GATEWAY_VIDEO_FETCH_TIMEOUT_MS,
  PROVIDER_CONFIG_MISSING,
} from "@/lib/contracts/ai-gateway-video";

/**
 * HTTPS hosts allowed for Gateway video downloads (suffix match).
 * Kept in lib/providers (not contracts) — vendor host allowlist rule.
 */
export const AI_GATEWAY_ALLOWED_OUTPUT_HOSTS: readonly string[] = [
  "heygen.com",
  "heygen.ai",
  "files.heygen.com",
  "files.heygen.ai",
  "resource.heygen.com",
  "resource.heygen.ai",
  "storage.googleapis.com",
  "googleapis.com",
  "googleusercontent.com",
  "fal.media",
  "blob.vercel-storage.com",
  "vercel-storage.com",
  "ai-gateway.vercel.sh",
  "byteoversea.com",
  "byteintl.com",
  "bytedance.com",
  "volces.com",
];
import {
  EXTERNAL_JOB_ID_MAX_LENGTH,
  type ExternalJobId,
} from "@/lib/contracts/providers";
import {
  ProviderAdapterError,
  validateProviderOutputUrl,
} from "@/lib/providers/normalize-provider-response";

export type GatewayVideoOperation = JSONValue;

export type StartVideoFn = typeof experimental_startVideo;
export type GetVideoStatusFn = typeof experimental_getVideoStatus;

export type CompletedVideoBytes = {
  buffer: Buffer;
  mimeType: string;
};

export type GatewayStatusVideo =
  | { type: "url"; url: string; mediaType?: string }
  | { type: "base64"; data: string; mediaType?: string }
  | { type: "binary"; data: Uint8Array; mediaType?: string }
  | { uint8Array: Uint8Array; mediaType?: string };

export function requireAiGatewayApiKey(
  envKeyName: string = AI_GATEWAY_ENV_KEY_NAME,
): string {
  const token = process.env[envKeyName]?.trim();
  if (!token) {
    throw new ProviderAdapterError(
      PROVIDER_CONFIG_MISSING,
      "Provider is not configured",
    );
  }
  return token;
}

export function createGatewayVideoModel(params: {
  apiKey: string;
  modelId: string;
}) {
  const gateway = createGateway({ apiKey: params.apiKey });
  return gateway.videoModel(params.modelId);
}

/**
 * Persist the opaque startVideo operation inside externalJobId (base64url).
 * Fits externalJobIdSchema charset and max length.
 */
export function encodeGatewayVideoOperation(
  operation: GatewayVideoOperation,
): string {
  const encoded = Buffer.from(JSON.stringify(operation), "utf8").toString(
    "base64url",
  );
  if (encoded.length === 0 || encoded.length > EXTERNAL_JOB_ID_MAX_LENGTH) {
    throw new ProviderAdapterError(
      "PROVIDER_REQUEST_FAILED",
      "Gateway operation id exceeds storage limits",
    );
  }
  return encoded;
}

export function decodeGatewayVideoOperation(
  externalJobId: ExternalJobId,
): GatewayVideoOperation {
  try {
    const json = Buffer.from(externalJobId, "base64url").toString("utf8");
    return JSON.parse(json) as GatewayVideoOperation;
  } catch {
    throw new ProviderAdapterError(
      "INVALID_PROVIDER_INPUT",
      "Invalid gateway video job id",
    );
  }
}

export function extractGatewayJobIdHint(
  startResult: StartVideoResult,
): string | undefined {
  const meta = startResult.providerMetadata as
    | { gateway?: { asyncJob?: { jobId?: unknown } } }
    | undefined;
  const jobId = meta?.gateway?.asyncJob?.jobId;
  return typeof jobId === "string" && jobId.length > 0 ? jobId : undefined;
}

function mimeOrMp4(mediaType: string | undefined): string {
  return typeof mediaType === "string" && mediaType.startsWith("video/")
    ? mediaType.split(";")[0]!.trim()
    : "video/mp4";
}

export async function materializeGatewayStatusVideo(
  video: GatewayStatusVideo,
  fetchImpl: typeof fetch = fetch,
): Promise<CompletedVideoBytes> {
  if ("uint8Array" in video) {
    if (!video.uint8Array || video.uint8Array.byteLength === 0) {
      throw new ProviderAdapterError(
        "PROVIDER_OUTPUT_MISSING",
        "Provider output is not available",
      );
    }
    return {
      buffer: Buffer.from(video.uint8Array),
      mimeType: mimeOrMp4(video.mediaType),
    };
  }

  switch (video.type) {
    case "binary": {
      if (!video.data || video.data.byteLength === 0) {
        throw new ProviderAdapterError(
          "PROVIDER_OUTPUT_MISSING",
          "Provider output is not available",
        );
      }
      return {
        buffer: Buffer.from(video.data),
        mimeType: mimeOrMp4(video.mediaType),
      };
    }
    case "base64": {
      if (!video.data || video.data.length === 0) {
        throw new ProviderAdapterError(
          "PROVIDER_OUTPUT_MISSING",
          "Provider output is not available",
        );
      }
      return {
        buffer: Buffer.from(video.data, "base64"),
        mimeType: mimeOrMp4(video.mediaType),
      };
    }
    case "url":
      return downloadGatewayVideoUrl(video.url, fetchImpl);
    default:
      throw new ProviderAdapterError(
        "PROVIDER_OUTPUT_MISSING",
        "Provider output is not available",
      );
  }
}

export async function downloadGatewayVideoUrl(
  initialUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CompletedVideoBytes> {
  let currentUrl = validateProviderOutputUrl(
    initialUrl,
    AI_GATEWAY_ALLOWED_OUTPUT_HOSTS,
  );
  let redirects = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      AI_GATEWAY_VIDEO_FETCH_TIMEOUT_MS,
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
      if (redirects > AI_GATEWAY_VIDEO_FETCH_MAX_REDIRECTS) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Provider output exceeded redirect limit",
        );
      }
      currentUrl = validateProviderOutputUrl(
        new URL(location, currentUrl).href,
        AI_GATEWAY_ALLOWED_OUTPUT_HOSTS,
      );
      continue;
    }

    if (!response.ok) {
      throw new ProviderAdapterError(
        "PROVIDER_DOWNLOAD_FAILED",
        `Provider output download failed (${response.status})`,
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
      if (Number.isFinite(size) && size > AI_GATEWAY_VIDEO_FETCH_MAX_BYTES) {
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
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > AI_GATEWAY_VIDEO_FETCH_MAX_BYTES) {
        throw new ProviderAdapterError(
          "PROVIDER_DOWNLOAD_FAILED",
          "Provider output exceeds maximum size",
        );
      }
      chunks.push(Buffer.from(value));
    }

    return {
      buffer: Buffer.concat(chunks),
      mimeType: contentType.startsWith("video/")
        ? contentType.split(";")[0]!.trim()
        : "video/mp4",
    };
  }
}

export const defaultStartVideo: StartVideoFn = experimental_startVideo;
export const defaultGetVideoStatus: GetVideoStatusFn =
  experimental_getVideoStatus;
