"use server";

import {
  getReelScriptsForWeekInputSchema,
  type GetReelScriptsForWeekResult,
} from "@/lib/contracts/reel-script";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  reelScriptForbiddenError,
  reelScriptForbiddenFieldsError,
  reelScriptInternalError,
  reelScriptUnauthenticatedError,
  reelScriptValidationError,
} from "@/lib/reel-scripts/errors";
import { findForbiddenReelScriptKeys } from "@/lib/reel-scripts/find-forbidden-keys";
import { emptyWeekCostSummary } from "@/lib/cost-policy/empty-week-cost-summary";
import { getReelCostRollupForScript } from "@/lib/cost-policy/get-reel-cost-rollup-for-script";
import { getReelCostSummaryForWeek } from "@/lib/cost-policy/get-reel-cost-summary-for-week";
import type { ReelCostRollupsMap } from "@/lib/contracts/actual-cost";
import { buildReelScriptListForStrategy } from "@/lib/reel-scripts/list-reel-scripts-for-week";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { getAssemblyJobsForReelScripts } from "@/lib/assembly/get-assembly-jobs-for-reel-scripts";
import { getVideoJobsForReelScripts } from "@/lib/video-jobs/get-video-jobs-for-reel-scripts";
import { getVoiceoverSummariesForReelScripts } from "@/lib/tts/get-voiceover-summaries-for-reel-scripts";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GetReelScriptsForWeekResult {
  if (error.status === 401) {
    return reelScriptUnauthenticatedError();
  }
  return reelScriptForbiddenError();
}

/**
 * Operator script list for a week (US-5.1).
 * Frontend consumer: `/operator/scripts` — initial load + week picker refresh.
 */
export async function getReelScriptsForWeek(
  rawInput: unknown,
): Promise<GetReelScriptsForWeekResult> {
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

    if (findForbiddenReelScriptKeys(rawInput).length > 0) {
      return reelScriptForbiddenFieldsError();
    }

    const parsed = getReelScriptsForWeekInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return reelScriptValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
    const { weekStart } = parsed.data;

    const approved = await getApprovedStrategyForWeek({ clientId, weekStart });
    if (!approved || approved.status !== "approved") {
      return {
        ok: true,
        weekStart,
        approvedStrategy: null,
        strategyVersionChanged: false,
        items: [],
        costSummary: emptyWeekCostSummary(weekStart, clientId),
        reelCostRollups: {},
        videoJobsByReelScriptId: {},
        voiceoverByReelScriptId: {},
        assemblyByReelScriptId: {},
      };
    }

    const { items, strategyVersionChanged } = await buildReelScriptListForStrategy(
      {
        clientId,
        weekStart,
        strategyId: approved.id,
        version: approved.version,
        brief: approved.brief,
      },
    );

    const costSummary = await getReelCostSummaryForWeek({
      clientId,
      weekStart,
      slotReelScriptIds: items.map((item) => ({
        slotIndex: item.slotIndex,
        reelScriptId: item.scriptId,
      })),
    });

    const reelCostRollups: ReelCostRollupsMap = {};
    const rollupScriptIds = [
      ...new Set(
        items
          .map((item) => item.scriptId)
          .filter((scriptId): scriptId is string => scriptId !== null),
      ),
    ];

    await Promise.all(
      rollupScriptIds.map(async (reelScriptId) => {
        const rollup = await getReelCostRollupForScript({
          clientId,
          reelScriptId,
          weekStart,
          eventScope: "week",
        });
        if (rollup !== null) {
          reelCostRollups[reelScriptId] = rollup;
        }
      }),
    );

    const videoJobsByReelScriptId = await getVideoJobsForReelScripts({
      clientId,
      reelScriptIds: rollupScriptIds,
    });

    const itemsByScriptId = new Map(
      items
        .filter((item) => item.scriptId !== null)
        .map((item) => [item.scriptId as string, item]),
    );

    const voiceoverByReelScriptId = await getVoiceoverSummariesForReelScripts({
      clientId,
      reelScriptIds: rollupScriptIds,
      itemsByScriptId,
    });

    const modalidadByReelScriptId = new Map(
      items
        .filter((item) => item.scriptId !== null)
        .map((item) => [item.scriptId as string, item.modalidad]),
    );

    const assemblyByReelScriptId = await getAssemblyJobsForReelScripts({
      clientId,
      reelScriptIds: rollupScriptIds,
      modalidadByReelScriptId,
    });

    return {
      ok: true,
      weekStart,
      approvedStrategy: {
        id: approved.id,
        version: approved.version,
        status: "approved",
      },
      strategyVersionChanged,
      items,
      costSummary,
      reelCostRollups,
      videoJobsByReelScriptId,
      voiceoverByReelScriptId,
      assemblyByReelScriptId,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[reel-scripts] list unexpected error");
    return reelScriptInternalError();
  }
}
