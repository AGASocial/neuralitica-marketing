import "server-only";

import type {
  LlmCompletionInput,
  LlmCompletionResult,
  LlmProviderAdapter,
} from "@/lib/providers/provider-adapters";

export type StubLlmResponseBuilder = (
  input: LlmCompletionInput,
) => string | Promise<string>;

/**
 * Deterministic LLM test double (US-4.1 CONTRACT).
 * Returns valid JSON brief strings for dev/test when no vendor key is configured.
 */
export function createStubLlmAdapter(
  providerKey: string,
  buildContent: StubLlmResponseBuilder = defaultStubBriefJson,
): LlmProviderAdapter {
  return {
    providerKey,

    async estimateCost(input: LlmCompletionInput) {
      return {
        estimatedCostCents: 1,
        currency: "USD" as const,
        providerKey,
      };
    },

    async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const content = await buildContent(input);
      return {
        content,
        inputTokens: 100,
        outputTokens: 400,
        actualCostCents: 1,
      };
    },
  };
}

function defaultStubBriefJson(input: LlmCompletionInput): string {
  const playbookMatch = input.userPrompt.match(
    /<UNTRUSTED_PLAYBOOK_HINTS>([\s\S]*?)<\/UNTRUSTED_PLAYBOOK_HINTS>/,
  );
  const trendMatch = input.userPrompt.match(
    /<UNTRUSTED_TREND_HINTS>([\s\S]*?)<\/UNTRUSTED_TREND_HINTS>/,
  );
  const allowlistMatch = input.userPrompt.match(
    /Allowed modalidades \(must use only these\):\s*([^\n]+)/,
  );

  let playbookSlugs: string[] = ["tip-rapido"];
  let trendSlugs: string[] = [];
  let modalidades: string[] = ["faceless"];

  try {
    if (playbookMatch?.[1]) {
      const parsed = JSON.parse(playbookMatch[1].trim()) as Array<{
        slug?: string;
      }>;
      const slugs = parsed
        .map((row) => row.slug)
        .filter((slug): slug is string => typeof slug === "string");
      if (slugs.length > 0) {
        playbookSlugs = slugs;
      }
    }
  } catch {
    // keep defaults
  }

  try {
    if (trendMatch?.[1]) {
      const parsed = JSON.parse(trendMatch[1].trim()) as Array<{
        slug?: string;
      }>;
      trendSlugs = parsed
        .map((row) => row.slug)
        .filter((slug): slug is string => typeof slug === "string");
    }
  } catch {
    // keep empty
  }

  if (allowlistMatch?.[1]) {
    const modes = allowlistMatch[1]
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (modes.length > 0) {
      modalidades = modes;
    }
  }

  const formatoA = playbookSlugs[0] ?? "tip-rapido";
  const formatoB = playbookSlugs[1] ?? formatoA;
  const formatoC = playbookSlugs[2] ?? formatoB;
  const modalidadA = modalidades[0] ?? "faceless";
  const modalidadB = modalidades[1] ?? modalidadA;
  const modalidadC = modalidades[2] ?? modalidadA;
  const tactica = trendSlugs[0];

  const brief = {
    pillars: ["Confianza local", "Educación práctica"],
    themes: ["Semana de contenido para Instagram Reels"],
    slots: [
      {
        slotIndex: 0,
        dayOfWeek: "monday",
        tema: "Por qué confiar en un negocio local",
        goal: "trust",
        formatoPlaybookSlug: formatoA,
        modalidad: modalidadA,
        ...(tactica ? { tacticaTendenciaSlug: tactica } : {}),
      },
      {
        slotIndex: 1,
        dayOfWeek: "wednesday",
        tema: "Consejo práctico para clientes",
        goal: "education",
        formatoPlaybookSlug: formatoB,
        modalidad: modalidadB,
      },
      {
        slotIndex: 2,
        dayOfWeek: "friday",
        tema: "Oferta o llamado a la acción local",
        goal: "local_sale",
        formatoPlaybookSlug: formatoC,
        modalidad: modalidadC,
        ctaHint: "Escribe por DM para agendar",
      },
    ],
  };

  return JSON.stringify(brief);
}
