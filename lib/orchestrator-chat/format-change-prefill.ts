import type { Locale } from "@/lib/i18n/locales";

export type ChangePrefillInput = {
  title: string;
  cardId: string;
  locale: Locale;
};

export type ChangePrefill = {
  /** Owner-visible transcript text — never includes the card UUID. */
  text: string;
  /** Hidden context for the agent / chat request (omit for typed composer sends). */
  metadata?: { cardId: string };
};

/**
 * Prefill for Change / Cambiar from an AgentCard (Hoy, approvals, chat).
 * Visible text is locale-aware; card id stays in metadata only.
 */
export function formatChangePrefill(input: ChangePrefillInput): ChangePrefill {
  const prefix = input.locale === "es" ? "Cambiar" : "Change";
  const title = input.title.trim();
  const text = title.length > 0 ? `${prefix}: ${title}` : prefix;
  return {
    text,
    metadata: { cardId: input.cardId },
  };
}

/** Read card anchor id from a UIMessage-like metadata bag. */
export function readCardAnchorId(
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const cardId = (metadata as { cardId?: unknown }).cardId;
  if (typeof cardId !== "string") {
    return null;
  }
  const trimmed = cardId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Latest user message card anchor (for system-prompt injection).
 */
export function extractLatestCardAnchorId(
  messages: Array<{ role?: string; metadata?: unknown }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") {
      continue;
    }
    const id = readCardAnchorId(message.metadata);
    if (id) {
      return id;
    }
  }
  return null;
}
