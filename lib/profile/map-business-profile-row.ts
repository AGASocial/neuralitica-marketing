import { interviewAnswersCompleteSchema } from "@/lib/contracts/interview";
import type { BusinessProfileForClientResult } from "@/lib/contracts/profile";

export type ProfileSelectRow = {
  fields: unknown;
  version: unknown;
  updated_at: unknown;
};

function toOptionalIsoUpdatedAt(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function toOptionalVersion(value: unknown): number | undefined {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    return undefined;
  }
  return version;
}

/**
 * Map a SELECT row (or error) to the soft view DTO.
 * Pure — safe for unit tests; not a browser identity surface.
 */
export function mapBusinessProfileRow(params: {
  data: ProfileSelectRow | null;
  error: { code?: string } | null;
}): BusinessProfileForClientResult {
  if (params.error) {
    console.error("[profile] select failed", { code: params.error.code });
    return { exists: false, loadFailed: true };
  }

  if (!params.data) {
    return { exists: false };
  }

  const fieldsParsed = interviewAnswersCompleteSchema.safeParse(
    params.data.fields,
  );
  if (!fieldsParsed.success) {
    const code = fieldsParsed.error.issues[0]?.code ?? "invalid_type";
    console.error("[profile] fields invalid", { code });
    return { exists: false, loadFailed: true };
  }

  const updatedAt = toOptionalIsoUpdatedAt(params.data.updated_at);
  const version = toOptionalVersion(params.data.version);

  return {
    exists: true,
    fields: fieldsParsed.data,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(version !== undefined ? { version } : {}),
  };
}
