/**
 * Playbook de formatos contract (US-16.1).
 * Operator payload uses snake_case in jsonb; agent DTO uses camelCase.
 */
import { z } from "zod";

import { visualModalitySchema } from "@/lib/contracts/visual-preferences";

export const playbookSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

export const playbookHookTypeSchema = z.enum([
  "question",
  "bold_claim",
  "pain_point",
  "curiosity_gap",
  "statistic",
  "before_after_tease",
  "objection_callout",
  "myth_statement",
  "local_hook",
  "quick_tip",
]);

export const playbookCtaTipoSchema = z.enum([
  "dm",
  "link_in_bio",
  "call",
  "visit",
  "book",
  "comment",
  "save",
  "follow",
  "none",
]);

export const playbookRubroSchema = z.enum([
  "plumbing",
  "hvac",
  "electrical",
  "cleaning",
  "landscaping",
  "auto_repair",
  "beauty",
  "fitness",
  "restaurant",
  "retail",
  "professional_services",
  "healthcare",
  "real_estate",
  "home_services",
  "other",
]);

export const playbookBeatSchema = z.string().trim().min(1).max(200);
export const playbookHintSchema = z.string().trim().min(1).max(500);
export const playbookEditingHintSchema = z.string().trim().min(1).max(200);
export const playbookTituloSchema = z.string().trim().min(1).max(120);
export const playbookExplicacionSchema = z.string().trim().min(1).max(2000);
export const playbookEjemploReferenciaSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000);
export const playbookDuracionIdealSegSchema = z.number().int().min(5).max(90);

/** Fields stored inside neuramark_content_playbooks.payload (excluding slug). */
export const playbookPayloadCoreSchema = z
  .object({
    titulo: playbookTituloSchema,
    explicacion: playbookExplicacionSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    hook_type: playbookHookTypeSchema,
    duracion_ideal_seg: playbookDuracionIdealSegSchema,
    modalidades_recomendadas: z
      .array(visualModalitySchema)
      .max(3)
      .superRefine((arr, ctx) => {
        if (new Set(arr).size !== arr.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate modalities are not allowed",
            path: ["modalidades_recomendadas"],
          });
        }
      }),
    rubros: z.array(playbookRubroSchema).max(15),
    guion_hints: z.array(playbookHintSchema).min(1).max(20),
    editing_hints: z.array(playbookEditingHintSchema).max(15).optional(),
    cta_tipo: playbookCtaTipoSchema,
    /** Operator-only — stored in payload; stripped from agent DTO */
    ejemplo_referencia: playbookEjemploReferenciaSchema.optional(),
  })
  .strict();

export type PlaybookPayloadCore = z.infer<typeof playbookPayloadCoreSchema>;
export type PlaybookHookType = z.infer<typeof playbookHookTypeSchema>;
export type PlaybookCtaTipo = z.infer<typeof playbookCtaTipoSchema>;
export type PlaybookRubro = z.infer<typeof playbookRubroSchema>;

export const PLAYBOOK_HOOK_TYPES = playbookHookTypeSchema.options;
export const PLAYBOOK_CTA_TIPOS = playbookCtaTipoSchema.options;
export const PLAYBOOK_RUBROS = playbookRubroSchema.options;

/** Default empty-ish payload for create form (client presentation only). */
export function emptyPlaybookPayload(): PlaybookPayloadCore {
  return {
    titulo: "",
    explicacion: "",
    estructura: [""],
    hook_type: "question",
    duracion_ideal_seg: 30,
    modalidades_recomendadas: [],
    rubros: [],
    guion_hints: [""],
    cta_tipo: "none",
  };
}

export const playbookFormatoAgentDtoSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    explicacion: playbookExplicacionSchema,
    estructura: z.array(playbookBeatSchema).min(1).max(12),
    hookType: playbookHookTypeSchema,
    duracionIdealSeg: playbookDuracionIdealSegSchema,
    modalidadesRecomendadas: z.array(visualModalitySchema).max(3),
    rubros: z.array(playbookRubroSchema).max(15),
    guionHints: z.array(playbookHintSchema).min(1).max(20),
    editingHints: z.array(playbookEditingHintSchema).max(15).optional(),
    ctaTipo: playbookCtaTipoSchema,
  })
  .strict();

export type PlaybookFormatoAgentDto = z.infer<
  typeof playbookFormatoAgentDtoSchema
>;

export const playbookForAgentsSuccessSchema = z
  .object({
    formats: z.array(playbookFormatoAgentDtoSchema),
  })
  .strict();

export const playbookForAgentsLoadFailedSchema = z
  .object({
    formats: z.tuple([]).or(z.array(playbookFormatoAgentDtoSchema).length(0)),
    loadFailed: z.literal(true),
  })
  .strict();

export type PlaybookForAgentsResult =
  | z.infer<typeof playbookForAgentsSuccessSchema>
  | z.infer<typeof playbookForAgentsLoadFailedSchema>;

export const playbookErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "DUPLICATE_SLUG",
  "VERSION_CONFLICT",
  "ALREADY_ARCHIVED",
  "FORBIDDEN_FIELDS",
  "INTERNAL_ERROR",
]);

export type PlaybookMutationError = {
  ok: false;
  error: {
    code: z.infer<typeof playbookErrorCodeSchema>;
    messageKey?: string;
    fields?: Record<string, string[]>;
  };
};

export type PlaybookErrorCode = z.infer<typeof playbookErrorCodeSchema>;

export const playbookListItemSchema = z
  .object({
    slug: playbookSlugSchema,
    titulo: playbookTituloSchema,
    active: z.boolean(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type PlaybookListItem = z.infer<typeof playbookListItemSchema>;

export const playbookListForOperatorSuccessSchema = z
  .object({
    ok: z.literal(true),
    formatos: z.array(playbookListItemSchema),
  })
  .strict();

export const playbookListForOperatorLoadFailedSchema = z
  .object({
    ok: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type PlaybookListForOperatorResult =
  | z.infer<typeof playbookListForOperatorSuccessSchema>
  | z.infer<typeof playbookListForOperatorLoadFailedSchema>;

export const playbookFormatoOperatorViewSchema = z
  .object({
    slug: playbookSlugSchema,
    version: z.number().int().positive(),
    active: z.boolean(),
    archivedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    payload: playbookPayloadCoreSchema,
  })
  .strict();

export type PlaybookFormatoOperatorView = z.infer<
  typeof playbookFormatoOperatorViewSchema
>;

export const playbookFormatoForOperatorFoundSchema = z
  .object({
    ok: z.literal(true),
    formato: playbookFormatoOperatorViewSchema,
  })
  .strict();

export const playbookFormatoForOperatorNotFoundSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: z.literal("NOT_FOUND"),
      messageKey: z.literal("playbook.errors.notFound"),
    }),
  })
  .strict();

export type PlaybookFormatoForOperatorResult =
  | z.infer<typeof playbookFormatoForOperatorFoundSchema>
  | z.infer<typeof playbookFormatoForOperatorNotFoundSchema>;

export const createPlaybookFormatoInputSchema = z
  .object({
    slug: playbookSlugSchema,
    payload: playbookPayloadCoreSchema,
  })
  .strict();

export type CreatePlaybookFormatoInput = z.infer<
  typeof createPlaybookFormatoInputSchema
>;

export const createPlaybookFormatoSuccessSchema = z
  .object({
    ok: z.literal(true),
    slug: playbookSlugSchema,
    version: z.literal(1),
  })
  .strict();

export type CreatePlaybookFormatoResult =
  | z.infer<typeof createPlaybookFormatoSuccessSchema>
  | PlaybookMutationError;

export const updatePlaybookFormatoInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    payload: playbookPayloadCoreSchema,
  })
  .strict();

export type UpdatePlaybookFormatoInput = z.infer<
  typeof updatePlaybookFormatoInputSchema
>;

export const updatePlaybookFormatoSuccessSchema = z
  .object({
    ok: z.literal(true),
    slug: playbookSlugSchema,
    version: z.number().int().positive(),
  })
  .strict();

export type UpdatePlaybookFormatoResult =
  | z.infer<typeof updatePlaybookFormatoSuccessSchema>
  | PlaybookMutationError;

export const archivePlaybookFormatoInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export type ArchivePlaybookFormatoInput = z.infer<
  typeof archivePlaybookFormatoInputSchema
>;

export const archivePlaybookFormatoSuccessSchema = z
  .object({
    ok: z.literal(true),
    slug: playbookSlugSchema,
    alreadyArchived: z.boolean().optional(),
  })
  .strict();

export type ArchivePlaybookFormatoResult =
  | z.infer<typeof archivePlaybookFormatoSuccessSchema>
  | PlaybookMutationError;
