import {
  playbookFormatoAgentDtoSchema,
  playbookFormatoOperatorViewSchema,
  playbookListItemSchema,
  playbookPayloadCoreSchema,
  type PlaybookFormatoAgentDto,
  type PlaybookFormatoOperatorView,
  type PlaybookListItem,
  type PlaybookPayloadCore,
} from "@/lib/contracts/playbook";

export type PlaybookSelectRow = {
  slug: string;
  version: unknown;
  payload: unknown;
  active: boolean;
  archived_at: unknown;
  updated_at: unknown;
};

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

export function parsePlaybookVersion(value: unknown): number | null {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    return null;
  }
  return version;
}

export function mapPlaybookListItem(row: PlaybookSelectRow): PlaybookListItem | null {
  const payloadParsed = playbookPayloadCoreSchema.safeParse(row.payload);
  if (!payloadParsed.success) {
    return null;
  }

  const version = parsePlaybookVersion(row.version);
  const updatedAt = toIsoTimestamp(row.updated_at);
  if (version == null || updatedAt == null) {
    return null;
  }

  const archivedAt =
    row.archived_at == null ? null : toIsoTimestamp(row.archived_at);

  const item = {
    slug: row.slug,
    titulo: payloadParsed.data.titulo,
    active: row.active,
    archivedAt,
    version,
    updatedAt,
  };

  const parsed = playbookListItemSchema.safeParse(item);
  return parsed.success ? parsed.data : null;
}

export function mapPlaybookFormatoForOperator(
  row: PlaybookSelectRow,
): PlaybookFormatoOperatorView | null {
  const payloadParsed = playbookPayloadCoreSchema.safeParse(row.payload);
  if (!payloadParsed.success) {
    return null;
  }

  const version = parsePlaybookVersion(row.version);
  const updatedAt = toIsoTimestamp(row.updated_at);
  if (version == null || updatedAt == null) {
    return null;
  }

  const archivedAt =
    row.archived_at == null ? null : toIsoTimestamp(row.archived_at);

  const view = {
    slug: row.slug,
    version,
    active: row.active,
    archivedAt,
    updatedAt,
    payload: payloadParsed.data,
  };

  const parsed = playbookFormatoOperatorViewSchema.safeParse(view);
  return parsed.success ? parsed.data : null;
}

export function mapPlaybookPayloadToAgentDto(
  slug: string,
  payload: PlaybookPayloadCore,
): PlaybookFormatoAgentDto | null {
  const dto = {
    slug,
    titulo: payload.titulo,
    explicacion: payload.explicacion,
    estructura: payload.estructura,
    hookType: payload.hook_type,
    duracionIdealSeg: payload.duracion_ideal_seg,
    modalidadesRecomendadas: payload.modalidades_recomendadas,
    rubros: payload.rubros,
    guionHints: payload.guion_hints,
    ctaTipo: payload.cta_tipo,
    ...(payload.editing_hints !== undefined
      ? { editingHints: payload.editing_hints }
      : {}),
  };

  const parsed = playbookFormatoAgentDtoSchema.safeParse(dto);
  return parsed.success ? parsed.data : null;
}

export const FORBIDDEN_PLAYBOOK_CREATE_KEYS = [
  "active",
  "archivedAt",
  "archived_at",
  "version",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "id",
  "client_id",
  "clientId",
  "role",
  "auth_user_id",
  "authUserId",
  "expectedVersion",
] as const;

export const FORBIDDEN_PLAYBOOK_UPDATE_KEYS = [
  ...FORBIDDEN_PLAYBOOK_CREATE_KEYS,
  "slug",
] as const;

function findForbiddenKeys(
  input: unknown,
  forbidden: readonly string[],
): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }
  const found: string[] = [];
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (forbidden.includes(key)) {
      found.push(key);
    }
  }
  return found;
}

export function findForbiddenCreatePlaybookKeys(input: unknown): string[] {
  return findForbiddenKeys(input, FORBIDDEN_PLAYBOOK_CREATE_KEYS);
}

export function findForbiddenUpdatePlaybookKeys(input: unknown): string[] {
  return findForbiddenKeys(input, FORBIDDEN_PLAYBOOK_UPDATE_KEYS);
}

export function findForbiddenArchivePlaybookKeys(input: unknown): string[] {
  return findForbiddenKeys(input, [
    ...FORBIDDEN_PLAYBOOK_CREATE_KEYS,
    "slug",
    "payload",
  ]);
}
