import {
  INTERVIEW_ANSWERS_MAX_UTF8_BYTES,
  interviewAnswersCompleteSchema,
  type InterviewAnswersComplete,
} from "@/lib/contracts/interview";
import type {
  BusinessProfileFields,
  UpdateBusinessProfileSuccess,
} from "@/lib/contracts/profile";

/**
 * Identity / privilege / audit keys — reject as FORBIDDEN_FIELDS before Zod.
 * Never used in WHERE / never written. Case-insensitive names.
 */
const FORBIDDEN_UPDATE_KEYS = new Set(
  [
    "client_id",
    "clientId",
    "id",
    "profile_id",
    "profileId",
    "source_interview_id",
    "sourceInterviewId",
    "as_client_id",
    "asClientId",
    "role",
    "active",
    "auth_user_id",
    "authUserId",
    "version",
    "updated_at",
    "updatedAt",
    "updated_by",
    "updatedBy",
    "created_at",
    "createdAt",
  ].map((key) => key.toLowerCase()),
);

/** Privilege / identity / audit keys: reject before Zod. Case-insensitive. */
export function findForbiddenUpdateBusinessProfileKeys(
  input: unknown,
): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  return Object.keys(input).filter((key) =>
    FORBIDDEN_UPDATE_KEYS.has(key.toLowerCase()),
  );
}

export function profileFieldsUtf8ByteLength(
  fields: BusinessProfileFields,
): number {
  return Buffer.byteLength(JSON.stringify(fields), "utf8");
}

export function isProfileFieldsPayloadTooLarge(
  fields: BusinessProfileFields,
): boolean {
  return profileFieldsUtf8ByteLength(fields) > INTERVIEW_ANSWERS_MAX_UTF8_BYTES;
}

/**
 * Server-computed UPDATE payload. Client never supplies version / updated_by / updated_at.
 * `nextVersion` must be currentVersion + 1 from a prior SELECT of own row.
 */
export function buildBusinessProfileUpdatePayload(params: {
  fields: BusinessProfileFields;
  currentVersion: number;
  editorClientId: string;
  nowIso?: string;
}): {
  fields: BusinessProfileFields;
  version: number;
  updated_by: string;
  updated_at: string;
} {
  return {
    fields: params.fields,
    version: params.currentVersion + 1,
    updated_by: params.editorClientId,
    updated_at: params.nowIso ?? new Date().toISOString(),
  };
}

export type ProfileUpdateSelectRow = {
  fields: unknown;
  version: unknown;
  updated_at: unknown;
};

/**
 * Map UPDATE … RETURNING row to success DTO.
 * Omits id, client_id, source_interview_id, updated_by.
 */
export function mapUpdateBusinessProfileResult(
  row: ProfileUpdateSelectRow | null,
): UpdateBusinessProfileSuccess | null {
  if (!row) {
    return null;
  }

  const fieldsParsed = interviewAnswersCompleteSchema.safeParse(row.fields);
  if (!fieldsParsed.success) {
    return null;
  }

  const version = Number(row.version);
  if (!Number.isInteger(version) || version < 1) {
    return null;
  }

  const updatedAt = toIsoUpdatedAt(row.updated_at);
  if (!updatedAt) {
    return null;
  }

  return {
    ok: true,
    fields: fieldsParsed.data as InterviewAnswersComplete,
    version,
    updatedAt,
  };
}

function toIsoUpdatedAt(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}
