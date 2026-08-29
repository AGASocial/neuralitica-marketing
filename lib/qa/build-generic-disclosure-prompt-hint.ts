import "server-only";

/**
 * Optional disclosure instruction for US-5.1 Script agent prompts.
 *
 * US-5.1 MUST read visualModeSummary.mustDiscloseNotOwner from
 * getBusinessProfileForAgents — this helper is convenience only, not authority.
 */

export function buildGenericDisclosurePromptHint(
  mustDiscloseNotOwner: boolean,
  locale: "en" | "es",
): string | null {
  if (!mustDiscloseNotOwner) {
    return null;
  }

  if (locale === "es") {
    return (
      "El guion y el texto en pantalla deben dejar claro que el presentador de IA " +
      "no es el dueño del negocio cuando se usa avatar genérico profesional."
    );
  }

  return (
    "Scripts and on-screen text must disclose that the AI presenter is not " +
    "the business owner when generic professional avatar modality applies."
  );
}
