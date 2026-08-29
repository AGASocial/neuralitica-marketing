import {
  MEDIA_ASSET_TYPE_AVATAR_REFERENCE,
  avatarReferenceAssetMetadataSchema,
  type AvatarReferenceAssetItem,
  type AvatarReferenceAssetMetadata,
} from "@/lib/contracts/media-assets";

/** FormData / body keys that must never influence tenancy or storage. */
export const FORBIDDEN_MEDIA_UPLOAD_FORM_KEYS = [
  "client_id",
  "clientId",
  "as_client_id",
  "storage_key",
  "storageKey",
  "path",
  "asset_type",
  "assetType",
  "metadata",
  "role",
  "active",
  "auth_user_id",
  "authUserId",
] as const;

export const FORBIDDEN_MEDIA_DELETE_KEYS = [
  "client_id",
  "clientId",
  "as_client_id",
  "storage_key",
  "storageKey",
  "path",
  "asset_type",
  "assetType",
  "metadata",
  "role",
  "active",
  "auth_user_id",
  "authUserId",
] as const;

export function findForbiddenUploadFormKeys(formData: FormData): string[] {
  const found: string[] = [];
  for (const key of formData.keys()) {
    if (
      (FORBIDDEN_MEDIA_UPLOAD_FORM_KEYS as readonly string[]).includes(key)
    ) {
      found.push(key);
    }
  }
  return found;
}

export function findForbiddenDeleteKeys(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }
  const found: string[] = [];
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if ((FORBIDDEN_MEDIA_DELETE_KEYS as readonly string[]).includes(key)) {
      found.push(key);
    }
  }
  return found;
}

export function sanitizeOriginalFilename(raw: string): string {
  const stripped = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\]/g, "_")
    .trim();
  const truncated = stripped.slice(0, 255);
  return truncated.length > 0 ? truncated : "upload";
}

export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

export function previewUrlForAssetId(assetId: string): string {
  return `/api/media/assets/${assetId}`;
}

export function mapMediaAssetRowToItem(row: {
  id: string;
  asset_type: string;
  metadata: unknown;
  created_at: unknown;
}): AvatarReferenceAssetItem | null {
  if (row.asset_type !== MEDIA_ASSET_TYPE_AVATAR_REFERENCE) {
    return null;
  }
  const createdAt = toIsoTimestamp(row.created_at);
  if (!createdAt) {
    return null;
  }
  const metaParsed = avatarReferenceAssetMetadataSchema.safeParse(
    row.metadata ?? {},
  );
  if (!metaParsed.success) {
    return null;
  }
  return {
    id: row.id,
    assetType: MEDIA_ASSET_TYPE_AVATAR_REFERENCE,
    createdAt,
    metadata: metaParsed.data,
    previewUrl: previewUrlForAssetId(row.id),
  };
}

export function buildAssetMetadata(
  prepared: AvatarReferenceAssetMetadata,
): AvatarReferenceAssetMetadata {
  return prepared;
}

export type MediaAssetSelectRow = {
  id: string;
  asset_type: string;
  storage_key: string;
  metadata: unknown;
  created_at: unknown;
};
