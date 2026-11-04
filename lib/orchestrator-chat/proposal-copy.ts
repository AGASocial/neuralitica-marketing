import type { Locale } from "@/lib/i18n/locales";

export function proposalSummary(
  locale: Locale,
  key:
    | "generate_strategy"
    | "approve_strategy"
    | "approve_pending_video"
    | "generate_scripts"
    | "generate_videos"
    | "request_video_changes"
    | "regenerate_script"
    | "confirm_paid_generation",
  params?: { slotCount?: number; amountCents?: number },
): string {
  const es = locale === "es";
  const amount =
    params?.amountCents != null
      ? `$${(params.amountCents / 100).toFixed(2)}`
      : es
        ? "un costo estimado"
        : "an estimated cost";
  switch (key) {
    case "generate_strategy":
      return es
        ? "Crear el plan de esta semana a partir de tu negocio. Usa un cargo pequeño de escritura con IA; no corre nada hasta que apruebes."
        : "Create this week’s content plan from your business profile. Uses a small AI writing charge; nothing runs until you approve.";
    case "approve_strategy": {
      const n = params?.slotCount ?? 0;
      return es
        ? `Aprobar el plan de esta semana (${n} videos). No cambia nada hasta que apruebes.`
        : `Approve this week’s plan (${n} videos). Nothing changes until you approve.`;
    }
    case "approve_pending_video":
      return es
        ? "Aprobar este video para que pase a Listos para publicar. No se publica en Instagram hasta que lo publiques aparte."
        : "Approve this video so it can move to Ready to post. Nothing posts to Instagram until you publish separately.";
    case "generate_scripts":
      return es
        ? "Escribir los textos de tus videos de esta semana. Cargo pequeño de escritura con IA; no corre nada hasta que apruebes."
        : "Write this week’s video texts. Small AI writing charge; nothing runs until you approve.";
    case "generate_videos":
      return es
        ? "Preparar la generación de tus videos. Primero aseguramos los textos; el gasto de video se confirma en una tarjeta aparte antes de cobrar."
        : "Prepare generating your videos. We’ll secure the write-ups first; any video spend is confirmed on a separate card before charging.";
    case "request_video_changes":
      return es
        ? "Pedir cambios en este video con lo que me contaste. No se aplica hasta que apruebes."
        : "Request changes on this video with what you told me. Nothing applies until you approve.";
    case "regenerate_script":
      return es
        ? "Reescribir el texto de este video. Cargo pequeño de escritura con IA; no corre nada hasta que apruebes."
        : "Rewrite this video’s text. Small AI writing charge; nothing runs until you approve.";
    case "confirm_paid_generation":
      return es
        ? `Crear este video cuesta unos ${amount}. No se cobra nada hasta que apruebes.`
        : `Creating this video costs about ${amount}. Nothing is charged until you approve.`;
    default:
      return es ? "Confirma por favor." : "Please confirm.";
  }
}
