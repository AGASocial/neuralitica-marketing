import {
  contentStrategyBriefSchema,
  contentStrategyStatusSchema,
  type ContentStrategyBrief,
  type ContentStrategyStatus,
} from "@/lib/contracts/content-strategy";

export type StrategySelectRow = {
  id: unknown;
  client_id: unknown;
  week_start: unknown;
  version: unknown;
  status: unknown;
  brief: unknown;
  created_at: unknown;
  updated_at: unknown;
  approved_by?: unknown;
  approved_at?: unknown;
};

export type ContentStrategyRow = {
  id: string;
  clientId: string;
  weekStart: string;
  version: number;
  status: ContentStrategyStatus;
  brief: ContentStrategyBrief;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

function toIso8601(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function formatWeekStart(value: unknown): string | null {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

export function mapStrategyRowMetadata(
  row: StrategySelectRow,
): Omit<ContentStrategyRow, "brief"> | null {
  const createdAt = toIso8601(row.created_at);
  const updatedAt = toIso8601(row.updated_at);
  const weekStart = formatWeekStart(row.week_start);
  if (!createdAt || !updatedAt || !weekStart) {
    return null;
  }

  const statusParsed = contentStrategyStatusSchema.safeParse(row.status);
  if (!statusParsed.success) {
    return null;
  }

  if (typeof row.id !== "string" || typeof row.client_id !== "string") {
    return null;
  }
  if (typeof row.version !== "number" || !Number.isInteger(row.version)) {
    return null;
  }

  const approvedBy =
    typeof row.approved_by === "string" && row.approved_by.length > 0
      ? row.approved_by
      : null;
  const approvedAt = toIso8601(row.approved_at);

  return {
    id: row.id,
    clientId: row.client_id,
    weekStart,
    version: row.version,
    status: statusParsed.data,
    createdAt,
    updatedAt,
    approvedBy,
    approvedAt,
  };
}

export function mapStrategyRow(row: StrategySelectRow): ContentStrategyRow | null {
  const metadata = mapStrategyRowMetadata(row);
  if (!metadata) {
    return null;
  }

  const briefParsed = contentStrategyBriefSchema.safeParse(row.brief);
  if (!briefParsed.success) {
    return null;
  }

  return {
    ...metadata,
    brief: briefParsed.data,
  };
}

export type ContentStrategyRowLoad = Omit<ContentStrategyRow, "brief"> & {
  brief: unknown;
};

export function mapStrategyRowLoad(
  row: StrategySelectRow,
): ContentStrategyRowLoad | null {
  const metadata = mapStrategyRowMetadata(row);
  if (!metadata) {
    return null;
  }

  return {
    ...metadata,
    brief: row.brief,
  };
}
