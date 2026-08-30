import "server-only";

import {
  createVideoJobResultSchema,
  externalJobIdSchema,
  videoJobStatusResultSchema,
  type VideoJobStatus,
  type VideoJobStatusResult,
} from "@/lib/contracts/providers";

export const INVALID_PROVIDER_OUTPUT_URL = "INVALID_PROVIDER_OUTPUT_URL" as const;

export class ProviderAdapterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderAdapterError";
  }
}

const STATUS_ALIASES: Readonly<Record<string, VideoJobStatus>> = {
  queued: "queued",
  pending: "queued",
  submitted: "queued",
  waiting: "queued",
  processing: "processing",
  running: "processing",
  in_progress: "processing",
  active: "processing",
  completed: "completed",
  succeeded: "completed",
  success: "completed",
  done: "completed",
  failed: "failed",
  error: "failed",
  errored: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
  aborted: "cancelled",
};

export function normalizeProviderJobStatus(raw: unknown): VideoJobStatus {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return "failed";
  }

  const normalized = STATUS_ALIASES[raw.trim().toLowerCase()];
  return normalized ?? "failed";
}

export function sanitizeProviderErrorMessage(raw: unknown): string {
  if (typeof raw !== "string") {
    return "Provider request failed";
  }

  let message = raw
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/([?&](?:api_key|token|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/[A-Za-z0-9+/=]{33,}/g, "[redacted]")
    .replace(/[\0-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (message.length === 0) {
    return "Provider request failed";
  }

  if (message.length > 2000) {
    return `${message.slice(0, 1999)}…`;
  }

  return message;
}

export function validateProviderOutputUrl(
  url: string,
  allowedHosts: readonly string[],
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProviderAdapterError(
      INVALID_PROVIDER_OUTPUT_URL,
      "Provider output URL is invalid",
    );
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderAdapterError(
      INVALID_PROVIDER_OUTPUT_URL,
      "Provider output URL must use https",
    );
  }

  const host = parsed.hostname.toLowerCase();
  const allowed = allowedHosts.some((entry) => {
    const normalized = entry.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });

  if (!allowed) {
    throw new ProviderAdapterError(
      INVALID_PROVIDER_OUTPUT_URL,
      "Provider output URL host is not allowlisted",
    );
  }

  return url;
}

export function normalizeVideoJobStatusResult(
  vendor: {
    status?: unknown;
    progressPercent?: unknown;
    errorMessage?: unknown;
    outputUrl?: unknown;
  },
  allowedHosts?: readonly string[],
): VideoJobStatusResult {
  const status = normalizeProviderJobStatus(vendor.status);

  let progressPercent: number | undefined;
  if (typeof vendor.progressPercent === "number" && Number.isFinite(vendor.progressPercent)) {
    progressPercent = Math.min(100, Math.max(0, vendor.progressPercent));
  }

  const sanitizedErrorMessage =
    status === "failed" || vendor.errorMessage != null
      ? sanitizeProviderErrorMessage(vendor.errorMessage)
      : undefined;

  let rawOutputUrl: string | undefined;
  if (
    typeof vendor.outputUrl === "string" &&
    vendor.outputUrl.length > 0 &&
    allowedHosts &&
    allowedHosts.length > 0
  ) {
    rawOutputUrl = validateProviderOutputUrl(vendor.outputUrl, allowedHosts);
  }

  return videoJobStatusResultSchema.parse({
    status,
    ...(progressPercent !== undefined ? { progressPercent } : {}),
    ...(sanitizedErrorMessage !== undefined ? { sanitizedErrorMessage } : {}),
    ...(rawOutputUrl !== undefined ? { rawOutputUrl } : {}),
  });
}

export function parseExternalJobId(value: unknown) {
  return externalJobIdSchema.parse(value);
}

export function parseCreateVideoJobResult(value: unknown) {
  return createVideoJobResultSchema.parse(value);
}
