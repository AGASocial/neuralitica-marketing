"use server";

import {
  getLatestContentStrategyInputSchema,
  type GetLatestContentStrategyResult,
} from "@/lib/contracts/content-strategy";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  contentStrategyForbiddenError,
  contentStrategyForbiddenFieldsError,
  contentStrategyInternalError,
  contentStrategyNotFoundError,
  contentStrategyUnauthenticatedError,
  contentStrategyValidationError,
  getLatestContentStrategyForbiddenResult,
  getLatestContentStrategyUnauthenticatedResult,
} from "@/lib/content-strategy/errors";
import { findForbiddenGetLatestContentStrategyKeys } from "@/lib/content-strategy/find-forbidden-keys";
import { validateActiveOperatorClientId } from "@/lib/content-strategy/validate-active-operator-client-id";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import { toContentStrategyView } from "@/lib/content-strategy/to-strategy-view";
import { getPlaybookForAgents } from "@/lib/playbook/get-playbook-for-agents";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetLatestContentStrategyResult {
  if (error.status === 401) {
    return getLatestContentStrategyUnauthenticatedResult();
  }
  return getLatestContentStrategyForbiddenResult();
}

/**
 * Operator read of latest strategy for a week (US-4.1 + US-4.2 approval metadata).
 * Frontend consumer: `/operator/strategy` — initial load / week picker.
 */
export async function getLatestContentStrategy(
  rawInput: unknown,
): Promise<GetLatestContentStrategyResult | ReturnType<typeof contentStrategyForbiddenError>> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return authGuardEnvelope(error);
      }
      throw error;
    }

    if (findForbiddenGetLatestContentStrategyKeys(rawInput).length > 0) {
      return contentStrategyForbiddenFieldsError();
    }

    const parsed = getLatestContentStrategyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return contentStrategyValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    let clientId = operator.id;
    if (parsed.data.clientId !== undefined) {
      const clientCheck = await validateActiveOperatorClientId(
        parsed.data.clientId,
      );
      if (!clientCheck.ok) {
        return contentStrategyNotFoundError();
      }
      clientId = parsed.data.clientId;
    }

    const row = await loadLatestStrategyRowWithApproval({
      clientId,
      weekStart: parsed.data.weekStart,
    });

    if (!row) {
      return { ok: true, strategy: null };
    }

    const strategy = await toContentStrategyView(row);

    const playbook = await getPlaybookForAgents();
    const playbookLabels: Record<string, string> = {};
    if (!("loadFailed" in playbook && playbook.loadFailed)) {
      for (const format of playbook.formats) {
        playbookLabels[format.slug] = format.titulo;
      }
    }

    const usedSlugs = new Set<string>();
    for (const slot of strategy.brief.slots) {
      usedSlugs.add(slot.formatoPlaybookSlug);
    }

    const labels: Record<string, string> = {};
    for (const slug of usedSlugs) {
      if (playbookLabels[slug]) {
        labels[slug] = playbookLabels[slug]!;
      }
    }

    return {
      ok: true,
      strategy,
      playbookLabels: Object.keys(labels).length > 0 ? labels : undefined,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[content-strategy] getLatest unexpected error");
    return contentStrategyInternalError();
  }
}
