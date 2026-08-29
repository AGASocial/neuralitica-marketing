import "server-only";

import {
  trendEntryAgentDtoSchema,
  trendEntryCoreSchema,
  trendWeekListItemSchema,
  trendSnapshotOperatorViewSchema,
  type TrendEntryAgentDto,
  type TrendEntryCore,
  type TrendWeekListItem,
  type TrendSnapshotOperatorView,
} from "@/lib/contracts/trend";

export type TrendSnapshotSelectRow = {
  week_start: string;
  entries: unknown;
  published_at: string;
  updated_at: string;
};

function parseEntries(raw: unknown): TrendEntryCore[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const entries: TrendEntryCore[] = [];
  for (const item of raw) {
    const parsed = trendEntryCoreSchema.safeParse(item);
    if (parsed.success) {
      entries.push(parsed.data);
    } else {
      console.error("[trend] entry row skipped during map");
    }
  }
  return entries;
}

export function mapTrendWeekListItem(row: TrendSnapshotSelectRow): TrendWeekListItem | null {
  const entries = parseEntries(row.entries);
  const mapped = trendWeekListItemSchema.safeParse({
    weekStart: row.week_start,
    entryCount: entries.length,
    activeEntryCount: entries.filter((entry) => entry.activo).length,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  });

  return mapped.success ? mapped.data : null;
}

export function mapTrendSnapshotOperatorView(
  row: TrendSnapshotSelectRow,
): TrendSnapshotOperatorView | null {
  const mapped = trendSnapshotOperatorViewSchema.safeParse({
    weekStart: row.week_start,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    entries: parseEntries(row.entries),
  });

  return mapped.success ? mapped.data : null;
}

export function serializeEntries(entries: TrendEntryCore[]): TrendEntryCore[] {
  return entries.map((entry) => trendEntryCoreSchema.parse(entry));
}

export function mapTrendEntryToAgentDto(
  entry: TrendEntryCore,
): TrendEntryAgentDto | null {
  const mapped = trendEntryAgentDtoSchema.safeParse({
    slug: entry.slug,
    titulo: entry.titulo,
    weekStart: entry.week_start,
    prioridadSemana: entry.prioridad_semana,
    fuente: entry.fuente,
    explicacion: entry.explicacion,
    evitar: entry.evitar,
    hookType: entry.hook_type,
    estructura: entry.estructura,
    guionHints: entry.guion_hints,
    editingHints: entry.editing_hints,
    duracionIdealSeg: entry.duracion_ideal_seg,
    modalidadesRecomendadas: entry.modalidades_recomendadas,
    rubros: entry.rubros,
    formatosPlaybookCompatibles: entry.formatos_playbook_compatibles,
  });

  return mapped.success ? mapped.data : null;
}
