import "server-only";

import { tool } from "ai";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import {
  assertProposalIsNonMutating,
  getScriptsStatusInputSchema,
  getScriptsStatusOutputSchema,
  getWeeklyStrategyInputSchema,
  getWeeklyStrategyOutputSchema,
  listCampaignStatusInputSchema,
  listCampaignStatusOutputSchema,
  orchestratorToolErrorSchema,
  proposeApprovePendingVideoInputSchema,
  proposeApprovePendingVideoOutputSchema,
  proposeApproveStrategyInputSchema,
  proposeApproveStrategyOutputSchema,
  proposeGenerateScriptsInputSchema,
  proposeGenerateScriptsOutputSchema,
  proposeGenerateStrategyInputSchema,
  proposeGenerateStrategyOutputSchema,
  proposeGenerateVideosInputSchema,
  proposeGenerateVideosOutputSchema,
  type OrchestratorToolError,
} from "@/lib/contracts/orchestrator-chat";
import type { Locale } from "@/lib/i18n/locales";
import {
  isOperator,
  orchestratorForbidden,
  orchestratorValidationError,
} from "@/lib/orchestrator-chat/authorize";
import { proposalSummary } from "@/lib/orchestrator-chat/proposal-copy";
import { resolveOrchestratorWeekStart } from "@/lib/orchestrator-chat/week";
import { listApprovedApprovalsForClientUser } from "@/lib/approvals/list-get-approvals";
import { listPendingApprovalsForClientUser } from "@/lib/approvals/list-get-approvals";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import { toContentStrategyView } from "@/lib/content-strategy/to-strategy-view";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { buildReelScriptListForStrategy } from "@/lib/reel-scripts/list-reel-scripts-for-week";

function toolError(error: OrchestratorToolError) {
  return orchestratorToolErrorSchema.parse(error);
}

export function createOrchestratorTools(user: CurrentUser, locale: Locale) {
  return {
    listCampaignStatus: tool({
      description:
        "Show where the owner’s campaign stands: videos waiting for approval, videos ready to post, and this week’s plan status.",
      inputSchema: listCampaignStatusInputSchema,
      execute: async (raw) => {
        const parsed = listCampaignStatusInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);

        const [pending, approved] = await Promise.all([
          listPendingApprovalsForClientUser({ user }),
          listApprovedApprovalsForClientUser({ user }),
        ]);

        if (!pending.ok || !approved.ok) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Could not load campaign status.",
          });
        }

        let strategyStatus: "none" | "draft" | "approved" | "unknown" =
          "unknown";
        let strategyId: string | undefined;
        let scriptsGeneratedCount: number | undefined;
        let scriptsPendingCount: number | undefined;

        try {
          const row = await loadLatestStrategyRowWithApproval({
            clientId: user.id,
            weekStart,
          });
          if (!row) {
            strategyStatus = "none";
          } else {
            strategyStatus = row.status === "approved" ? "approved" : "draft";
            strategyId = row.id;
          }

          if (isOperator(user) && row?.status === "approved") {
            const { items } = await buildReelScriptListForStrategy({
              clientId: user.id,
              weekStart,
              strategyId: row.id,
              version: row.version,
              brief: row.brief,
            });
            scriptsGeneratedCount = items.filter(
              (i) => i.status === "generated",
            ).length;
            scriptsPendingCount = items.filter(
              (i) => i.status === "pending",
            ).length;
          }
        } catch {
          strategyStatus = "unknown";
        }

        return listCampaignStatusOutputSchema.parse({
          ok: true,
          role: user.role,
          weekStart,
          pendingApprovalsCount: pending.items.length,
          approvedReadyCount: approved.items.length,
          pendingApprovals: pending.items.slice(0, 10).map((item) => ({
            approvalId: item.approvalId,
            status: item.status,
            captionPreview: item.captionPreview?.slice(0, 200),
          })),
          strategyStatus,
          strategyId,
          scriptsGeneratedCount,
          scriptsPendingCount,
        });
      },
    }),

    getWeeklyStrategy: tool({
      description:
        "Load this week’s content plan (themes and video topics) for the signed-in business.",
      inputSchema: getWeeklyStrategyInputSchema,
      execute: async (raw) => {
        const parsed = getWeeklyStrategyInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);

        const row = await loadLatestStrategyRowWithApproval({
          clientId: user.id,
          weekStart,
        });
        if (!row) {
          return getWeeklyStrategyOutputSchema.parse({
            ok: true,
            weekStart,
            strategy: null,
          });
        }

        const view = await toContentStrategyView(row);
        return getWeeklyStrategyOutputSchema.parse({
          ok: true,
          weekStart,
          strategy: {
            id: view.id,
            version: view.version,
            status: view.status,
            pillars: view.brief.pillars,
            themes: view.brief.themes,
            slots: view.brief.slots.map((slot) => ({
              slotIndex: slot.slotIndex,
              tema: slot.tema,
              goal: slot.goal,
              formatoPlaybookSlug: slot.formatoPlaybookSlug,
              modalidad: slot.modalidad,
            })),
            isEditable: view.isEditable,
          },
        });
      },
    }),

    getScriptsStatus: tool({
      description:
        "Operator/Advanced: list script readiness for this week’s approved plan (plain status per video).",
      inputSchema: getScriptsStatusInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = getScriptsStatusInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return getScriptsStatusOutputSchema.parse({
            ok: true,
            weekStart,
            approvedStrategyId: null,
            items: [],
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        return getScriptsStatusOutputSchema.parse({
          ok: true,
          weekStart,
          approvedStrategyId: approved.id,
          items: items.map((item) => ({
            slotIndex: item.slotIndex,
            scriptId: item.scriptId,
            tema: item.tema,
            status: item.status,
            modalidad: item.modalidad,
          })),
        });
      },
    }),

    proposeGenerateStrategy: tool({
      description:
        "Propose creating this week’s content plan. Does NOT create anything until the user taps Approve on the card.",
      inputSchema: proposeGenerateStrategyInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeGenerateStrategyInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const proposal = {
          kind: "generate_strategy" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "generate_strategy"),
          weekStart,
          action: "generateContentStrategy" as const,
        };
        assertProposalIsNonMutating(proposal);
        return proposeGenerateStrategyOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeApproveStrategy: tool({
      description:
        "Propose approving the draft weekly plan. Does NOT approve until the user taps Approve on the card.",
      inputSchema: proposeApproveStrategyInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeApproveStrategyInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const row = await loadLatestStrategyRowWithApproval({
          clientId: user.id,
          weekStart,
        });
        if (!row || row.status !== "draft") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No draft plan to approve for that week.",
          });
        }
        if (
          parsed.data.strategyId !== undefined &&
          parsed.data.strategyId !== row.id
        ) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "That plan was not found.",
          });
        }
        const view = await toContentStrategyView(row);
        const proposal = {
          kind: "approve_strategy" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "approve_strategy", {
            slotCount: view.brief.slots.length,
          }),
          weekStart,
          strategyId: view.id,
          action: "approveContentStrategy" as const,
          slotCount: view.brief.slots.length,
          themes: view.brief.themes,
        };
        assertProposalIsNonMutating(proposal);
        return proposeApproveStrategyOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeApprovePendingVideo: tool({
      description:
        "Propose approving a video waiting for the owner. Does NOT approve until the user taps Approve on the card.",
      inputSchema: proposeApprovePendingVideoInputSchema,
      execute: async (raw) => {
        const parsed = proposeApprovePendingVideoInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const pending = await listPendingApprovalsForClientUser({ user });
        if (!pending.ok) {
          return toolError({
            ok: false,
            error: "INTERNAL",
            message: "Could not load videos waiting for approval.",
          });
        }
        const item =
          parsed.data.approvalId !== undefined
            ? pending.items.find((i) => i.approvalId === parsed.data.approvalId)
            : pending.items[0];
        if (!item) {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "No video is waiting for approval right now.",
          });
        }
        const proposal = {
          kind: "approve_pending_video" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: false,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "approve_pending_video"),
          approvalId: item.approvalId,
          action: "decideApproval" as const,
          decision: "approved" as const,
          captionPreview: item.captionPreview?.slice(0, 200),
        };
        assertProposalIsNonMutating(proposal);
        return proposeApprovePendingVideoOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeGenerateScripts: tool({
      description:
        "Propose writing this week’s video texts (scripts). Does NOT generate until the user taps Approve on the card. Call this whenever you offer to write/create the texts.",
      inputSchema: proposeGenerateScriptsInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeGenerateScriptsInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Approve this week’s plan before writing the videos.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const pendingSlotCount = items.filter(
          (i) => i.status === "pending",
        ).length;
        const proposal = {
          kind: "generate_scripts" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "generate_scripts"),
          weekStart,
          action: "generateReelScripts" as const,
          pendingSlotCount,
        };
        assertProposalIsNonMutating(proposal);
        return proposeGenerateScriptsOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),

    proposeGenerateVideos: tool({
      description:
        "Propose preparing video generation for this week. Does NOT spend on paid video until a later cost-confirm card. Call this whenever you offer to generate/create the videos.",
      inputSchema: proposeGenerateVideosInputSchema,
      execute: async (raw) => {
        if (!isOperator(user)) {
          return toolError(orchestratorForbidden());
        }
        const parsed = proposeGenerateVideosInputSchema.safeParse(raw);
        if (!parsed.success) {
          return toolError(orchestratorValidationError());
        }
        const weekStart = resolveOrchestratorWeekStart(parsed.data.weekStart);
        const approved = await getApprovedStrategyForWeek({
          clientId: user.id,
          weekStart,
        });
        if (!approved || approved.status !== "approved") {
          return toolError({
            ok: false,
            error: "NOT_FOUND",
            message: "Approve this week’s plan before creating videos.",
          });
        }
        const { items } = await buildReelScriptListForStrategy({
          clientId: user.id,
          weekStart,
          strategyId: approved.id,
          version: approved.version,
          brief: approved.brief,
        });
        const readyScriptCount = items.filter(
          (i) => i.status === "generated",
        ).length;
        const proposal = {
          kind: "generate_videos" as const,
          requiresConfirmation: true as const,
          mutates: false as const,
          incursSpend: true,
          estimatedCostCents: null,
          summary: proposalSummary(locale, "generate_videos"),
          weekStart,
          action: "generateReelScripts" as const,
          readyScriptCount,
          paidMediaRequiresCostConfirm: true as const,
        };
        assertProposalIsNonMutating(proposal);
        return proposeGenerateVideosOutputSchema.parse({
          ok: true,
          proposal,
        });
      },
    }),
  };
}

export type OrchestratorTools = ReturnType<typeof createOrchestratorTools>;
