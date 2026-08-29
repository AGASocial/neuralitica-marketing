import {
  playbookFormatoAgentDtoSchema,
  playbookPayloadCoreSchema,
  playbookSlugSchema,
  type PlaybookForAgentsResult,
  type PlaybookFormatoAgentDto,
  type PlaybookPayloadCore,
} from "@/lib/contracts/playbook";

export type PlaybookAgentSelectRow = {
  slug: unknown;
  payload: unknown;
};

function mapPayloadToAgentDto(
  slug: string,
  payload: PlaybookPayloadCore,
): PlaybookFormatoAgentDto {
  const dto: PlaybookFormatoAgentDto = {
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

  return playbookFormatoAgentDtoSchema.parse(dto);
}

/**
 * Map active playbook SELECT rows to the agent DTO list.
 * Pure — safe for unit tests; strips ejemplo_referencia at map time.
 */
export function mapPlaybookRowsForAgents(params: {
  rows: PlaybookAgentSelectRow[] | null;
  error: { code?: string } | null;
}): PlaybookForAgentsResult {
  if (params.error) {
    console.error("[playbook] agents select failed", {
      code: params.error.code,
    });
    return { formats: [], loadFailed: true };
  }

  if (!params.rows || params.rows.length === 0) {
    return { formats: [] };
  }

  const formats: PlaybookFormatoAgentDto[] = [];
  let skipped = 0;

  for (const row of params.rows) {
    const slugParsed = playbookSlugSchema.safeParse(row.slug);
    if (!slugParsed.success) {
      skipped += 1;
      console.error("[playbook] agents slug invalid", {
        code: slugParsed.error.issues[0]?.code ?? "invalid_slug",
      });
      continue;
    }

    const payloadParsed = playbookPayloadCoreSchema.safeParse(row.payload);
    if (!payloadParsed.success) {
      skipped += 1;
      console.error("[playbook] agents payload invalid", {
        slug: slugParsed.data,
        code: payloadParsed.error.issues[0]?.code ?? "invalid_payload",
      });
      continue;
    }

    try {
      formats.push(
        mapPayloadToAgentDto(slugParsed.data, payloadParsed.data),
      );
    } catch {
      skipped += 1;
      console.error("[playbook] agents dto invalid", {
        slug: slugParsed.data,
        code: "invalid_dto",
      });
    }
  }

  if (formats.length === 0 && skipped > 0) {
    return { formats: [], loadFailed: true };
  }

  return { formats };
}
