import {
  INTERVIEW_STEP_ORDER,
  type InterviewAnswers,
  type InterviewStepKey,
} from "@/lib/contracts/interview";
import type { Locale } from "@/lib/i18n/locales";

const TEXT_STEPS = new Set<InterviewStepKey>(["zone", "tone", "style"]);

export function isInterviewTextStep(step: InterviewStepKey): boolean {
  return TEXT_STEPS.has(step);
}

export function interviewStepIndex(step: InterviewStepKey): number {
  return INTERVIEW_STEP_ORDER.indexOf(step) + 1;
}

export function interviewTotalSteps(): number {
  return INTERVIEW_STEP_ORDER.length;
}

export function answeredInterviewSteps(answers: InterviewAnswers): InterviewStepKey[] {
  return INTERVIEW_STEP_ORDER.filter((key) => answers[key] != null);
}

/** Owner-facing question copy (mirrors messages.*.interview.steps). */
export function interviewStepQuestion(
  locale: Locale,
  step: InterviewStepKey,
): { label: string; question: string; helper: string } {
  const es = locale === "es";
  const copy: Record<
    InterviewStepKey,
    { label: string; question: string; helper: string }
  > = es
    ? {
        services: {
          label: "Servicios",
          question: "¿Qué servicios ofreces?",
          helper: "Lista los servicios que los clientes pueden contratar.",
        },
        zone: {
          label: "Zona",
          question: "¿Dónde atiendes a tus clientes?",
          helper: "Describe tu zona: ciudades, barrios o códigos postales.",
        },
        tone: {
          label: "Tono",
          question: "¿Cómo debe sonar tu negocio ante los clientes?",
          helper: "Describe la voz: cercana, directa, formal u otra.",
        },
        offers: {
          label: "Ofertas",
          question: "¿Qué ofertas o promociones debemos mencionar?",
          helper: "Lista ofertas, membresías o garantías actuales.",
        },
        objections: {
          label: "Objeciones",
          question: "¿Qué objeciones suelen poner los clientes?",
          helper: "Dudas o comparaciones habituales antes de contratarte.",
        },
        style: {
          label: "Estilo",
          question: "¿Cómo debemos escribir?",
          helper: "Longitud de frases, detalles locales, frases a usar o evitar.",
        },
        restrictions: {
          label: "Restricciones",
          question: "¿Qué no debemos decir ni prometer nunca?",
          helper: "Palabras, promesas o temas a evitar. Vacío si no hay ninguna.",
        },
      }
    : {
        services: {
          label: "Services",
          question: "What services do you offer?",
          helper: "List the services customers can hire you for.",
        },
        zone: {
          label: "Zone",
          question: "Where do you serve customers?",
          helper: "Describe your service area: cities, neighborhoods, or ZIP codes.",
        },
        tone: {
          label: "Tone",
          question: "How should your business sound to customers?",
          helper: "Describe the voice you want: warm, direct, formal, or something else.",
        },
        offers: {
          label: "Offers",
          question: "What offers or promotions should we mention?",
          helper: "List current offers, memberships, or guarantees we may include.",
        },
        objections: {
          label: "Objections",
          question: "What objections do customers often raise?",
          helper: "List common doubts or comparisons you hear before someone hires you.",
        },
        style: {
          label: "Style",
          question: "How should we write?",
          helper: "Sentence length, local details, phrases to use or avoid in the writing itself.",
        },
        restrictions: {
          label: "Restrictions",
          question: "What must we never say or promise?",
          helper: "Words, claims, or topics to avoid. Leave empty if there are none.",
        },
      };
  return copy[step];
}

export function formatInterviewAnswerPreview(
  step: InterviewStepKey,
  answers: InterviewAnswers,
): string {
  const value = answers[step];
  if (value == null) {
    return "";
  }
  if ("description" in value && typeof value.description === "string") {
    return value.description.trim();
  }
  if ("items" in value && Array.isArray(value.items)) {
    return value.items.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  return "";
}

export function buildInterviewAnswerFragment(params: {
  currentStep: InterviewStepKey;
  description?: string;
  items?: string[];
}): InterviewAnswers | null {
  const { currentStep, description, items } = params;
  if (isInterviewTextStep(currentStep)) {
    const text = description?.trim() ?? "";
    if (!text) {
      return null;
    }
    return { [currentStep]: { description: text } };
  }
  const list = (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  // restrictions may be empty; other list steps need ≥1
  if (currentStep !== "restrictions" && list.length === 0) {
    return null;
  }
  return { [currentStep]: { items: list } };
}
