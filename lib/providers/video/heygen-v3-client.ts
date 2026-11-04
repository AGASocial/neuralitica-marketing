/**
 * Shared HeyGen API v3 HTTP helpers (upload / create / poll).
 * No secrets logged. Mockable via fetchImpl.
 */
import "server-only";

import {
  HEYGEN_API_BASE_URL,
  HEYGEN_API_KEY_HEADER,
  HEYGEN_CREATE_AVATAR_PATH,
  HEYGEN_CREATE_VIDEO_PATH,
  HEYGEN_GET_AVATAR_LOOK_PATH_PREFIX,
  HEYGEN_GET_VIDEO_PATH_PREFIX,
  HEYGEN_LOOK_POLL_INTERVAL_MS,
  HEYGEN_LOOK_POLL_MAX_ATTEMPTS,
  HEYGEN_UPLOAD_ASSET_PATH,
} from "@/lib/contracts/heygen-high";
import {
  ProviderAdapterError,
  sanitizeProviderErrorMessage,
} from "@/lib/providers/normalize-provider-response";

export type HeygenV3ClientDeps = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type HeygenApiErrorBody = {
  error?: unknown;
  message?: unknown;
  detail?: unknown;
  data?: unknown;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorMessage(
  response: Response,
  apiKey: string,
): Promise<string> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return `Provider request failed (${response.status})`;
  }
  let candidate = text;
  try {
    const payload = JSON.parse(text) as HeygenApiErrorBody;
    const raw =
      payload.detail ?? payload.error ?? payload.message ?? text;
    candidate = typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch {
    candidate = text;
  }
  if (apiKey.length > 0) {
    candidate = candidate.split(apiKey).join("[redacted]");
  }
  return sanitizeProviderErrorMessage(candidate);
}

export async function heygenJsonRequest(
  deps: HeygenV3ClientDeps,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return fetchImpl(`${HEYGEN_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      [HEYGEN_API_KEY_HEADER]: deps.apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function heygenUploadAsset(
  deps: HeygenV3ClientDeps,
  params: { bytes: Buffer; filename: string; mimeType: string },
): Promise<{ assetId: string; url?: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.bytes)], {
    type: params.mimeType,
  });
  form.append("file", blob, params.filename);

  const response = await fetchImpl(
    `${HEYGEN_API_BASE_URL}${HEYGEN_UPLOAD_ASSET_PATH}`,
    {
      method: "POST",
      headers: {
        [HEYGEN_API_KEY_HEADER]: deps.apiKey,
        // Let fetch set multipart boundary — do not set Content-Type manually.
      },
      body: form,
    },
  );

  if (!response.ok) {
    throw new ProviderAdapterError(
      "PROVIDER_REQUEST_FAILED",
      await readErrorMessage(response, deps.apiKey),
    );
  }

  const payload = (await response.json()) as {
    data?: {
      asset_id?: unknown;
      id?: unknown;
      url?: unknown;
    };
    asset_id?: unknown;
    id?: unknown;
  };
  const data = payload.data ?? payload;
  const assetIdRaw =
    (data as { asset_id?: unknown }).asset_id ??
    (data as { id?: unknown }).id;
  if (typeof assetIdRaw !== "string" || assetIdRaw.trim().length === 0) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "HeyGen asset upload missing asset_id",
    );
  }
  const url =
    typeof (data as { url?: unknown }).url === "string"
      ? ((data as { url: string }).url)
      : undefined;
  return { assetId: assetIdRaw.trim(), url };
}

export async function heygenCreatePhotoAvatar(
  deps: HeygenV3ClientDeps,
  params: { name: string; imageAssetId: string },
): Promise<{ lookId: string; groupId: string | null; status: string }> {
  const response = await heygenJsonRequest(deps, HEYGEN_CREATE_AVATAR_PATH, {
    method: "POST",
    body: JSON.stringify({
      type: "photo",
      name: params.name,
      file: { type: "asset_id", asset_id: params.imageAssetId },
    }),
  });

  if (!response.ok) {
    throw new ProviderAdapterError(
      "PROVIDER_REQUEST_FAILED",
      await readErrorMessage(response, deps.apiKey),
    );
  }

  const payload = (await response.json()) as {
    data?: {
      avatar_item?: { id?: unknown; status?: unknown; group_id?: unknown };
      avatar_group?: { id?: unknown };
    };
  };
  const item = payload.data?.avatar_item;
  const lookId = typeof item?.id === "string" ? item.id : null;
  if (!lookId) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "HeyGen photo avatar missing look id",
    );
  }
  const groupId =
    typeof item?.group_id === "string"
      ? item.group_id
      : typeof payload.data?.avatar_group?.id === "string"
        ? payload.data.avatar_group.id
        : null;
  const status =
    typeof item?.status === "string" ? item.status : "processing";
  return { lookId, groupId, status };
}

export async function heygenWaitForLookCompleted(
  deps: HeygenV3ClientDeps,
  lookId: string,
): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; attempt < HEYGEN_LOOK_POLL_MAX_ATTEMPTS; attempt += 1) {
    const response = await heygenJsonRequest(
      deps,
      `${HEYGEN_GET_AVATAR_LOOK_PATH_PREFIX}${encodeURIComponent(lookId)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      throw new ProviderAdapterError(
        "PROVIDER_REQUEST_FAILED",
        await readErrorMessage(response, deps.apiKey),
      );
    }
    const payload = (await response.json()) as {
      data?: { status?: unknown; error?: unknown };
      status?: unknown;
    };
    const status =
      (typeof payload.data?.status === "string" && payload.data.status) ||
      (typeof payload.status === "string" && payload.status) ||
      "";
    if (status === "completed") {
      return;
    }
    if (status === "failed") {
      throw new ProviderAdapterError(
        "PROVIDER_REQUEST_FAILED",
        sanitizeProviderErrorMessage(
          typeof payload.data?.error === "string"
            ? payload.data.error
            : "HeyGen photo avatar look failed",
        ),
      );
    }
    await sleep(HEYGEN_LOOK_POLL_INTERVAL_MS);
  }
  throw new ProviderAdapterError(
    "PROVIDER_REQUEST_FAILED",
    "HeyGen photo avatar look timed out",
  );
}

export async function heygenCreateAudioDrivenAvatarVideo(
  deps: HeygenV3ClientDeps,
  params: {
    avatarId: string;
    audioAssetId: string;
    bodyExtras?: Record<string, unknown>;
  },
): Promise<{ videoId: string; status: string; raw: Record<string, unknown> }> {
  const body = {
    type: "avatar",
    avatar_id: params.avatarId,
    audio_asset_id: params.audioAssetId,
    ...(params.bodyExtras ?? {}),
  };
  const response = await heygenJsonRequest(deps, HEYGEN_CREATE_VIDEO_PATH, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ProviderAdapterError(
      "PROVIDER_REQUEST_FAILED",
      await readErrorMessage(response, deps.apiKey),
    );
  }
  const payload = (await response.json()) as {
    data?: { video_id?: unknown; id?: unknown; status?: unknown };
  };
  const data = payload.data ?? {};
  const videoIdRaw = data.video_id ?? data.id;
  if (typeof videoIdRaw !== "string" || videoIdRaw.trim().length === 0) {
    throw new ProviderAdapterError(
      "PROVIDER_RESPONSE_INVALID",
      "HeyGen create video missing video_id",
    );
  }
  return {
    videoId: videoIdRaw.trim(),
    status: typeof data.status === "string" ? data.status : "waiting",
    raw: data as Record<string, unknown>,
  };
}

export async function heygenGetVideo(
  deps: HeygenV3ClientDeps,
  videoId: string,
): Promise<Response> {
  return heygenJsonRequest(
    deps,
    `${HEYGEN_GET_VIDEO_PATH_PREFIX}${encodeURIComponent(videoId)}`,
    { method: "GET" },
  );
}

export { readErrorMessage as readHeygenResponseErrorMessage };
