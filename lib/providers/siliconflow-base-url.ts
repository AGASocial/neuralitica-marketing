import "server-only";

/**
 * SiliconFlow API hosts.
 * International keys authenticate against `.com`; China-region keys use `.cn`.
 * Default is international — `.cn` rejected the project's production API key
 * with HTTP 401 "Api key is invalid" while `.com` succeeded for the same key.
 */
export const SILICONFLOW_DEFAULT_API_BASE_URL =
  "https://api.siliconflow.com" as const;

const ALLOWED_BASE_URLS = new Set([
  "https://api.siliconflow.com",
  "https://api.siliconflow.cn",
]);

/**
 * Resolve SiliconFlow API origin. Optional `SILICONFLOW_BASE_URL` must be
 * exactly one of the allowlisted hosts (no path, no caller-supplied proxy).
 */
export function resolveSiliconFlowApiBaseUrl(): string {
  const raw = process.env.SILICONFLOW_BASE_URL?.trim();
  if (!raw) {
    return SILICONFLOW_DEFAULT_API_BASE_URL;
  }

  try {
    const url = new URL(raw);
    const origin = url.origin;
    if (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      ALLOWED_BASE_URLS.has(origin)
    ) {
      return origin;
    }
  } catch {
    // fall through
  }

  return SILICONFLOW_DEFAULT_API_BASE_URL;
}

export function resolveSiliconFlowChatCompletionsUrl(): string {
  return `${resolveSiliconFlowApiBaseUrl()}/v1/chat/completions`;
}

export function resolveSiliconFlowTtsSpeechUrl(): string {
  return `${resolveSiliconFlowApiBaseUrl()}/v1/audio/speech`;
}

export function resolveSiliconFlowWanSubmitUrl(): string {
  return `${resolveSiliconFlowApiBaseUrl()}/v1/video/submit`;
}

export function resolveSiliconFlowWanStatusUrl(): string {
  return `${resolveSiliconFlowApiBaseUrl()}/v1/video/status`;
}
