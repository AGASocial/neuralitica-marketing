/**
 * Snapshot de tendencias contract (US-16.2).
 * Operator entry payloads use snake_case in jsonb; agent DTO uses camelCase.
 */
import { z } from "zod";

import {
  playbookBeatSchema,
  playbookEditingHintSchema,
  playbookEjemploReferenciaSchema,
  playbookExplicacionSchema,
  playbookHintSchema,
  playbookHookTypeSchema,
  playbookRubroSchema,
  playbookSlugSchema,
  playbookTituloSchema,
} from "@/lib/contracts/playbook";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";

export const trendWeekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "week_start must be YYYY-MM-DD")
  .superRefine((value, ctx) => {
    const date = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return;
    }
    if (date.getUTCDay() !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "week_start must be an ISO week Monday",
      });
    }
  });

export const trendFuenteSchema = z.enum([
  "manual",
  "scraping",
  "operator_review",
]);

export const trendPrioridadSemanaSchema = z.number().int().min(1).max(5);

export const trendDuracionIdealSegSchema = z
  .object({
    cold_open: z.number().int().min(1).max(10),
    total: z.number().int().min(5).max(90),
  })
  .strict()
  .superRefine((obj, ctx) => {
    if (obj.cold_open > obj.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cold_open must be <= total",
        path: ["cold_open"],
      });
    }
  });

export const trendEvitarSchema = z.string().trim().min(1).max(2000);

export const trendEntryCoreSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    week_start: trendWeekStartSchema,
    activo: z.boolean(),
    prioridad_semana: trendPrioridadSemanaSchema,
    fuente: trendFuenteSchema,
    explicacion: playbookExplicacionSchema,
    evitar: trendEvitarSchema.optional(),
    ejemplo_referencia: playbookEjemploReferenciaSchema.optional(),
    hook_type: playbookHookTypeSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    guion_hints: z.array(playbookHintSchema).min(1).max(20),
    editing_hints: z.array(playbookEditingHintSchema).max(15).optional(),
    duracion_ideal_seg: trendDuracionIdealSegSchema,
    modalidades_recomendadas: z.array(visualModalitySchema).max(3),
    rubros: z.array(playbookRubroSchema).max(15),
    formatos_playbook_compatibles: z
      .array(playbookSlugSchema)
      .min(1)
      .max(10),
  })
  .strict();

export type TrendEntryCore = z.infer<typeof trendEntryCoreSchema>;

export const trendEntryCreateInputSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    week_start: trendWeekStartSchema,
    prioridad_semana: trendPrioridadSemanaSchema,
    explicacion: playbookExplicacionSchema,
    evitar: trendEvitarSchema.optional(),
    ejemplo_referencia: playbookEjemploReferenciaSchema.optional(),
    hook_type: playbookHookTypeSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    guion_hints: z.array(playbookHintSchema).min(1).max(20),
    editing_hints: z.array(playbookEditingHintSchema).max(15).optional(),
    duracion_ideal_seg: trendDuracionIdealSegSchema,
    modalidades_recomendadas: z.array(visualModalitySchema).max(3),
    rubros: z.array(playbookRubroSchema).max(15),
    formatos_playbook_compatibles: z.array(playbookSlugSchema).min(1).max(10),
  })
  .strict();

export type TrendEntryCreateInput = z.infer<typeof trendEntryCreateInputSchema>;

export const trendEntryUpdateInputSchema = trendEntryCreateInputSchema
  .omit({ slug: true })
  .strict();

export type TrendEntryUpdateInput = z.infer<typeof trendEntryUpdateInputSchema>;

/** Editable táctica fields (excluding slug / week_start) for forms. */
export type TrendEntryFormFields = Omit<
  TrendEntryCreateInput,
  "slug" | "week_start"
>;

export function emptyTrendEntryFields(): TrendEntryFormFields {
  return {
    titulo: "",
    prioridad_semana: 3,
    explicacion: "",
    hook_type: "question",
    estructura: [""],
    guion_hints: [""],
    duracion_ideal_seg: { cold_open: 2, total: 25 },
    modalidades_recomendadas: [],
    rubros: [],
    formatos_playbook_compatibles: [],
  };
}

export const trendErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "DUPLICATE_SLUG",
  "WEEK_START_MISMATCH",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type TrendErrorCode = z.infer<typeof trendErrorCodeSchema>;

export type TrendMutationError = {
  ok: false;
  error: {
    code: TrendErrorCode;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};

export const trendWeekListItemSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    entryCount: z.number().int().min(0),
    activeEntryCount: z.number().int().min(0),
    publishedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type TrendWeekListItem = z.infer<typeof trendWeekListItemSchema>;

export const trendWeekListForOperatorSuccessSchema = z
  .object({
    ok: z.literal(true),
    weeks: z.array(trendWeekListItemSchema),
  })
  .strict();

export const trendWeekListForOperatorLoadFailedSchema = z
  .object({
    ok: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type TrendWeekListForOperatorResult =
  | z.infer<typeof trendWeekListForOperatorSuccessSchema>
  | z.infer<typeof trendWeekListForOperatorLoadFailedSchema>;

export const trendSnapshotOperatorViewSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    publishedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    entries: z.array(trendEntryCoreSchema),
  })
  .strict();

export type TrendSnapshotOperatorView = z.infer<
  typeof trendSnapshotOperatorViewSchema
>;

export const trendSnapshotForOperatorFoundSchema = z
  .object({
    ok: z.literal(true),
    snapshot: trendSnapshotOperatorViewSchema,
  })
  .strict();

export const trendSnapshotForOperatorNotFoundSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: z.literal("NOT_FOUND"),
      messageKey: z.literal("trend.errors.weekNotFound"),
    }),
  })
  .strict();

export type TrendSnapshotForOperatorResult =
  | z.infer<typeof trendSnapshotForOperatorFoundSchema>
  | z.infer<typeof trendSnapshotForOperatorNotFoundSchema>;

export const publishOrUpdateSnapshotSuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    created: z.boolean(),
  })
  .strict();

export type PublishOrUpdateSnapshotResult =
  | z.infer<typeof publishOrUpdateSnapshotSuccessSchema>
  | TrendMutationError;

export const addTrendEntrySuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slug: playbookSlugSchema,
  })
  .strict();

export type AddTrendEntryResult =
  | z.infer<typeof addTrendEntrySuccessSchema>
  | TrendMutationError;

export const updateTrendEntrySuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slug: playbookSlugSchema,
  })
  .strict();

export type UpdateTrendEntryResult =
  | z.infer<typeof updateTrendEntrySuccessSchema>
  | TrendMutationError;

export const deactivateTrendEntrySuccessSchema = z
  .object({
    ok: z.literal(true),
    weekStart: trendWeekStartSchema,
    slug: playbookSlugSchema,
    alreadyInactive: z.boolean().optional(),
  })
  .strict();

export type DeactivateTrendEntryResult =
  | z.infer<typeof deactivateTrendEntrySuccessSchema>
  | TrendMutationError;

export const publishOrUpdateSnapshotInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    entries: z.array(trendEntryCreateInputSchema).max(50).optional(),
  })
  .strict();

export type PublishOrUpdateSnapshotInput = z.infer<
  typeof publishOrUpdateSnapshotInputSchema
>;

export const addTrendEntryInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    entry: trendEntryCreateInputSchema,
  })
  .strict();

export type AddTrendEntryInput = z.infer<typeof addTrendEntryInputSchema>;

export const trendEntryAgentDtoSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    weekStart: trendWeekStartSchema,
    prioridadSemana: trendPrioridadSemanaSchema,
    fuente: trendFuenteSchema,
    explicacion: playbookExplicacionSchema,
    evitar: trendEvitarSchema.optional(),
    hookType: playbookHookTypeSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    guionHints: z.array(playbookHintSchema).min(1).max(20),
    editingHints: z.array(playbookEditingHintSchema).max(15).optional(),
    duracionIdealSeg: trendDuracionIdealSegSchema,
    modalidadesRecomendadas: z.array(visualModalitySchema).max(3),
    rubros: z.array(playbookRubroSchema).max(15),
    formatosPlaybookCompatibles: z.array(playbookSlugSchema).min(1).max(10),
  })
  .strict();

export type TrendEntryAgentDto = z.infer<typeof trendEntryAgentDtoSchema>;

export const trendSnapshotForWeekSuccessSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    entries: z.array(trendEntryAgentDtoSchema),
  })
  .strict();

export type TrendSnapshotForWeekResult = z.infer<
  typeof trendSnapshotForWeekSuccessSchema
>;
