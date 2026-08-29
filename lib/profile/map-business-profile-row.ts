import { interviewAnswersCompleteSchema } from "@/lib/contracts/interview";
import type {
  BusinessProfileForAgentsResult,
  BusinessProfileForClientResult,
} from "@/lib/contracts/profile";
import type { VisualModeSummary } from "@/lib/contracts/visual-preferences";

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

/**
 * Map a SELECT row to the agent DTO (US-2.3 / US-3.1).
 * Requires positive version when exists; adds clientId + visualModeSummary.
 * visualModeSummary defaults null; caller may pass allowlist projection when Preferencias exist.
 * Pure — safe for unit tests; not a browser identity surface.
 */
export function mapBusinessProfileRowForAgents(params: {
  clientId: string;
  data: ProfileSelectRow | null;
  error: { code?: string } | null;
  visualModeSummary?: VisualModeSummary | null;
}): BusinessProfileForAgentsResult {
  const base = mapBusinessProfileRow({
    data: params.data,
    error: params.error,
  });

  if (!base.exists) {
    if ("loadFailed" in base && base.loadFailed) {
      return { exists: false, loadFailed: true };
    }
    return { exists: false };
  }

  if (base.version === undefined) {
    console.error("[profile] agents version invalid", { code: "invalid_version" });
    return { exists: false, loadFailed: true };
  }

  return {
    exists: true,
    clientId: params.clientId,
    version: base.version,
    fields: base.fields,
    visualModeSummary: params.visualModeSummary ?? null,
    ...(base.updatedAt !== undefined ? { updatedAt: base.updatedAt } : {}),
  };
}
