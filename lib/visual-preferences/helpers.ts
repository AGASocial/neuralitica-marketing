import type { ZodError, ZodIssue } from "zod";

import {
  FACELESS_STYLE_MAX_UTF8_BYTES,
  facelessStyleSchema,
  visualModalitySchema,
  visualPreferencesRulesSchema,
  type FacelessStyle,
  type UpsertVisualPreferencesInput,
  type UpsertVisualPreferencesSuccess,
  type VisualModality,
  type VisualPreferencesRules,
} from "@/lib/contracts/visual-preferences";
import type { TtsVoiceId } from "@/lib/contracts/tts-voiceover";
import { ttsVoiceIdSchema } from "@/lib/contracts/tts-voiceover";

/**
 * Identity / privilege / rules / consent / audit keys — reject as
 * FORBIDDEN_FIELDS before Zod. Never used in WHERE / never written.
 * Case-insensitive names.
 */
const FORBIDDEN_UPSERT_KEYS = new Set(
  [
    "client_id",
    "clientId",
    "id",
    "as_client_id",
    "asClientId",
    "role",
    "active",
    "auth_user_id",
    "authUserId",
    "rules",
    "must_disclose_not_owner",
    "mustDiscloseNotOwner",
    "consent",
    "consentAvatar",
    "consented_at",
    "consentedAt",
    "consent_version",
    "consentVersion",
    "revoked_at",
    "revokedAt",
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
    "providerVoice",
    "provider_voice",
    "providerKey",
    "provider_key",
    "voice_id",
  ].map((key) => key.toLowerCase()),
);

/** Privilege / identity / rules / consent / audit keys: reject before Zod. */
export function findForbiddenUpsertVisualPreferencesKeys(
  input: unknown,
): string[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  return Object.keys(input).filter((key) => {
    const lower = key.toLowerCase();
    if (FORBIDDEN_UPSERT_KEYS.has(lower)) {
      return true;
    }
    // consent* prefix (CONTRACT)
    if (lower.startsWith("consent")) {
      return true;
    }
    return false;
  });
}

/** Server-derived rules from allowlist membership. Never client-writable. */
export function deriveVisualPreferencesRules(
  allowedModes: readonly VisualModality[],
): VisualPreferencesRules {
  return {
    must_disclose_not_owner: allowedModes.includes("generic_avatar"),
  };
}

/**
 * Read-path authority for rules.must_disclose_not_owner.
 * Prefer derivation from allowed_modes; on stored drift, use derived value
 * and log anomaly — never fail open to false when generic ∈ allowlist.
 */
export function resolveVisualPreferencesRules(params: {
  allowedModes: readonly VisualModality[];
  storedRules: VisualPreferencesRules | null;
}): VisualPreferencesRules {
  const derived = deriveVisualPreferencesRules(params.allowedModes);

  if (params.storedRules == null) {
    return derived;
  }

  const parsed = visualPreferencesRulesSchema.safeParse(params.storedRules);
  if (!parsed.success) {
    return derived;
  }

  if (
    parsed.data.must_disclose_not_owner !== derived.must_disclose_not_owner
  ) {
    console.error("[preferences] rules drift", {
      stored: parsed.data.must_disclose_not_owner,
      derived: derived.must_disclose_not_owner,
    });
    return derived;
  }

  return parsed.data;
}

export function facelessStyleUtf8ByteLength(
  facelessStyle: FacelessStyle | null | undefined,
): number {
  if (facelessStyle == null) {
    return 0;
  }
  return Buffer.byteLength(JSON.stringify(facelessStyle), "utf8");
}

export function isFacelessStylePayloadTooLarge(
  facelessStyle: FacelessStyle | null | undefined,
): boolean {
  return (
    facelessStyleUtf8ByteLength(facelessStyle) > FACELESS_STYLE_MAX_UTF8_BYTES
  );
}

export type VisualPreferencesSelectRow = {
  allowed_modes: unknown;
  faceless_style: unknown;
  generic_avatar_id: unknown;
  voice_id?: unknown;
  rules: unknown;
  updated_at: unknown;
};

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

function parseAllowedModes(value: unknown): VisualModality[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const modes: VisualModality[] = [];
  for (const item of value) {
    const parsed = visualModalitySchema.safeParse(item);
    if (!parsed.success) {
      return null;
    }
    modes.push(parsed.data);
  }
  if (modes.length > 3) {
    return null;
  }
  return modes;
}

function parseFacelessStyle(value: unknown): FacelessStyle | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  const parsed = facelessStyleSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

function parseRules(value: unknown): VisualPreferencesRules | null {
  const parsed = visualPreferencesRulesSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function parseVoiceId(value: unknown): TtsVoiceId | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && ttsVoiceIdSchema.safeParse(value).success) {
    return value as TtsVoiceId;
  }
  return undefined;
}

/**
 * Map SELECT / UPSERT … RETURNING row to Cliente view slice (without consent flag).
 */
export function mapVisualPreferencesRow(params: {
  data: VisualPreferencesSelectRow | null;
  error: { code?: string } | null;
}):
  | {
      kind: "exists";
      allowedModes: VisualModality[];
      facelessStyle: FacelessStyle | null;
      voiceId: TtsVoiceId | null;
      rules: VisualPreferencesRules;
      updatedAt: string;
    }
  | { kind: "missing" }
  | { kind: "loadFailed" } {
  if (params.error) {
    console.error("[preferences] select failed", { code: params.error.code });
    return { kind: "loadFailed" };
  }

  if (!params.data) {
    return { kind: "missing" };
  }

  const allowedModes = parseAllowedModes(params.data.allowed_modes);
  if (!allowedModes) {
    console.error("[preferences] allowed_modes invalid", {
      code: "invalid_type",
    });
    return { kind: "loadFailed" };
  }

  const facelessStyle = parseFacelessStyle(params.data.faceless_style);
  if (facelessStyle === undefined) {
    console.error("[preferences] faceless_style invalid", {
      code: "invalid_type",
    });
    return { kind: "loadFailed" };
  }

  const storedRules = parseRules(params.data.rules);
  if (!storedRules) {
    console.error("[preferences] rules invalid", { code: "invalid_type" });
    return { kind: "loadFailed" };
  }

  const rules = resolveVisualPreferencesRules({
    allowedModes,
    storedRules,
  });

  const updatedAt = toIsoUpdatedAt(params.data.updated_at);
  if (!updatedAt) {
    console.error("[preferences] updated_at invalid", { code: "invalid_type" });
    return { kind: "loadFailed" };
  }

  const voiceId = parseVoiceId(params.data.voice_id);
  if (voiceId === undefined) {
    console.error("[preferences] voice_id invalid", { code: "invalid_type" });
    return { kind: "loadFailed" };
  }

  return {
    kind: "exists",
    allowedModes,
    facelessStyle,
    voiceId: voiceId ?? null,
    rules,
    updatedAt,
  };
}

/**
 * Map UPSERT … RETURNING row to success DTO.
 * Omits client_id / consent.
 */
export function mapUpsertVisualPreferencesResult(
  row: VisualPreferencesSelectRow | null,
): UpsertVisualPreferencesSuccess | null {
  const mapped = mapVisualPreferencesRow({ data: row, error: null });
  if (mapped.kind !== "exists") {
    return null;
  }

  return {
    ok: true,
    allowedModes: mapped.allowedModes,
    facelessStyle: mapped.facelessStyle,
    genericAvatarId: null,
    voiceId: mapped.voiceId,
    rules: mapped.rules,
    updatedAt: mapped.updatedAt,
  };
}

/** Build DB upsert payload — client_id from session only; rules server-derived. */
export function buildVisualPreferencesUpsertPayload(params: {
  clientId: string;
  input: UpsertVisualPreferencesInput;
  existingVoiceId?: TtsVoiceId | null;
}): {
  client_id: string;
  allowed_modes: VisualModality[];
  faceless_style: FacelessStyle | null;
  generic_avatar_id: null;
  voice_id: TtsVoiceId | null;
  rules: VisualPreferencesRules;
} {
  const allowedModes = params.input.allowedModes;
  let voiceId: TtsVoiceId | null = params.existingVoiceId ?? null;
  if (params.input.voiceId !== undefined) {
    voiceId = params.input.voiceId;
  }

  return {
    client_id: params.clientId,
    allowed_modes: allowedModes,
    faceless_style: params.input.facelessStyle ?? null,
    generic_avatar_id: null,
    voice_id: voiceId,
    rules: deriveVisualPreferencesRules(allowedModes),
  };
}

/** Map Zod issues to CONTRACT field paths (same class as interview/profile). */
export function zodPreferencesErrorToFieldErrors(
  error: ZodError,
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      const keys = unrecognizedKeys(issue);
      for (const key of keys) {
        const path = normalizeFieldPath([...issue.path, key]);
        addField(fields, path, "unrecognized_key");
      }
      continue;
    }

    const path = normalizeFieldPath(issue.path);
    addField(fields, path, zodIssueToFieldCode(issue));
  }

  return fields;
}

function addField(
  fields: Record<string, string[]>,
  path: string,
  code: string,
): void {
  if (!path) {
    return;
  }
  fields[path] = [...(fields[path] ?? []), code];
}

function normalizeFieldPath(
  path: readonly (string | number | symbol)[],
): string {
  return path
    .filter((segment): segment is string | number => typeof segment !== "symbol")
    .map(String)
    .join(".");
}

function unrecognizedKeys(issue: ZodIssue): string[] {
  if (issue.code === "unrecognized_keys" && "keys" in issue) {
    return issue.keys;
  }
  return [];
}

function zodIssueToFieldCode(issue: ZodIssue): string {
  switch (issue.code) {
    case "too_small":
      return "too_small";
    case "too_big":
      return "too_big";
    case "invalid_type":
      if ("received" in issue && issue.received === "undefined") {
        return "required";
      }
      return "invalid_type";
    case "unrecognized_keys":
      return "unrecognized_key";
    case "invalid_enum_value":
      return "invalid_type";
    case "custom":
      return issue.message.includes("required") ? "required" : "invalid_type";
    default:
      return issue.code;
  }
}
